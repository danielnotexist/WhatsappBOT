import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { createPayLinkToken, verifyPayLinkToken } from "./pay-link";
import { addOneMonth } from "./plans";
import { activateSubscription, chargeSubscription } from "./subscription";

describe("billing", () => {
  beforeEach(() => vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64")));
  afterEach(() => vi.unstubAllEnvs());

  it("adds one month with end-of-month clamping", () => {
    expect(addOneMonth(new Date("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addOneMonth(new Date("2026-10-20T10:00:00Z")).toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("pay-link tokens carry the user id, expire and reject tampering", () => {
    const key = randomBytes(32);
    const now = new Date();
    const t = createPayLinkToken("123e4567-e89b-42d3-a456-426614174000", { key, now });
    expect(verifyPayLinkToken(t, { key, now })).toEqual({ userId: "123e4567-e89b-42d3-a456-426614174000" });
    expect(verifyPayLinkToken(t, { key: randomBytes(32), now })).toBeNull();
    expect(verifyPayLinkToken(t, { key, now: new Date(now.getTime() + 8 * 86_400_000) })).toBeNull();
    expect(verifyPayLinkToken("x.y", { key })).toBeNull();
  });

  it("activates after a verified payment, stores the token encrypted and schedules the monthly charge", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-20T10:00:00Z");
    const { subscription, firstTime } = await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: "A1", token: "0505743578473060772", tokef: "3105", invoiceUrl: "https://inv", raw: {} }, now);
    expect(firstTime).toBe(true);
    expect(subscription).toMatchObject({ plan: "basic", status: "active", next_charge_at: "2026-11-20T10:00:00.000Z", charge_failures: 0, hyp_tokef: "3105" });
    const secret = await db.getSubscriptionSecret(user.id);
    expect(secret!.hyp_token_enc).not.toContain("0505743578473060772");
    expect(secret!.hyp_token_enc!.startsWith("v1.")).toBe(true);
    expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued")).toHaveLength(1);
    expect(db.jobs[0]!.run_at).toBe("2026-11-20T10:00:00.000Z");
    expect((await db.listPayments(user.id, 5))[0]).toMatchObject({ hyp_trans_id: "T1", amount_ils: 99 });
    // the same redirect twice → payment not duplicated
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: "A1", token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, now);
    expect(await db.listPayments(user.id, 5)).toHaveLength(1);
    expect(await db.countTrialMessage(user.id)).toBe(749);
  });

  it("charges monthly, retries on days 1/3/5 and moves to past_due after three failures", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    const t0 = new Date("2026-10-20T10:00:00Z");
    await activateSubscription(db, user, { plan: "pro", transId: "T1", amountIls: 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, t0);
    expect((await chargeSubscription(db, hyp, user, t0)).kind).toBe("skipped"); // not due yet

    const due = new Date("2026-11-20T10:00:00Z");
    const ok = await chargeSubscription(db, hyp, user, due);
    expect(ok).toMatchObject({ kind: "charged", amountIls: 299, nextChargeAt: new Date("2026-12-20T10:00:00Z") });
    expect((hyp.calls.find((c) => c.method === "chargeToken")!.args as { token: string }).token).toBe("0505743578473060772");
    expect((await db.getSubscription(user.id))!.next_charge_at).toBe("2026-12-20T10:00:00.000Z");

    hyp.chargeOk = false;
    const due2 = new Date("2026-12-20T10:00:00Z");
    const r1 = await chargeSubscription(db, hyp, user, due2);
    expect(r1).toMatchObject({ kind: "retry", failures: 1, retryAt: new Date("2026-12-23T10:00:00Z") });
    const r2 = await chargeSubscription(db, hyp, user, new Date("2026-12-23T10:00:00Z"));
    expect(r2).toMatchObject({ kind: "retry", failures: 2, retryAt: new Date("2026-12-25T10:00:00Z") });
    const r3 = await chargeSubscription(db, hyp, user, new Date("2026-12-25T10:00:00Z"));
    expect(r3).toMatchObject({ kind: "past_due", failures: 3 });
    expect((await db.getSubscription(user.id))!.status).toBe("past_due");
    // payment settled from the site → active again
    hyp.chargeOk = true;
    const again = await activateSubscription(db, user, { plan: "pro", transId: "T9", amountIls: 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-12-26T10:00:00Z"));
    expect(again.firstTime).toBe(false);
    expect(again.subscription).toMatchObject({ status: "active", charge_failures: 0 });
  });
});
