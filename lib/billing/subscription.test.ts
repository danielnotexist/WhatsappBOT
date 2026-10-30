import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureOwnerAlerts, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { createConnectLinkToken, verifyConnectLinkToken } from "@/lib/ms/connect-link";
import { createPayLinkToken, verifyPayLinkToken } from "./pay-link";
import { addOneMonth, effectivePlan, servicePlan } from "./plans";
import { activateSubscription, chargeSubscription, resumeAfterCardUpdate, saveCardToken, scheduleCharge } from "./subscription";

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
    // strict shape: one dot, base64url only — no ".png" suffix, no junk the base64url decoder would skip
    for (const bad of [`${t}.png`, `${t}!`, `${t} `, `${t}%2E`, `${t.replace(".", "..")}`, `${t}A`]) expect(verifyPayLinkToken(bad, { key, now })).toBeNull();
    expect(verifyConnectLinkToken(`${createConnectLinkToken("123e4567-e89b-42d3-a456-426614174000", "google", { key, now })}.x`, { key, now })).toBeNull();
    expect(verifyConnectLinkToken(createConnectLinkToken("123e4567-e89b-42d3-a456-426614174000", "google", { key, now }), { key, now })).toMatchObject({ provider: "google" });
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

  it("charges monthly (invoice lines, renewal lock), retries on days 3/5/7 and pauses after the day-7 failure", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    const t0 = new Date("2026-10-20T10:00:00Z");
    await activateSubscription(db, user, { plan: "pro", transId: "T1", amountIls: 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, t0);
    expect((await chargeSubscription(db, hyp, user, t0)).kind).toBe("skipped"); // not due yet

    const due = new Date("2026-11-20T10:00:00Z");
    const ok = await chargeSubscription(db, hyp, user, due);
    expect(ok).toMatchObject({ kind: "charged", amountIls: 299, plan: "pro", nextChargeAt: new Date("2026-12-20T10:00:00Z") });
    const args = hyp.calls.find((c) => c.method === "chargeToken")!.args as { token: string; items: { description: string; price: number }[]; order: string };
    expect(args.token).toBe("0505743578473060772");
    expect(args.items).toEqual([{ description: "מנוי פרו — 20.11.2026–20.12.2026", quantity: 1, price: 299 }]);
    // the monthly charge takes the per-user lock (kind renewal) and links the payment to it
    const lock = db.billingApprovals.find((a) => a.kind === "renewal")!;
    expect(lock).toMatchObject({ status: "succeeded", phone_e164: null, amount_ils: 299, id: args.order });
    expect(db.payments.at(-1)!.approval_id).toBe(lock.id);
    expect((await db.getSubscription(user.id))!.next_charge_at).toBe("2026-12-20T10:00:00.000Z");

    hyp.chargeOk = false; // CCode 4 — a retryable decline
    const due2 = new Date("2026-12-20T10:00:00Z");
    const day = (n: number) => new Date(due2.getTime() + (n - 1) * 86_400_000);
    expect(await chargeSubscription(db, hyp, user, day(1))).toMatchObject({ kind: "retry", failures: 1, retryAt: day(3), ccode: "4" });
    expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued").map((j) => j.run_at)).toEqual([day(3).toISOString()]);
    expect(await chargeSubscription(db, hyp, user, day(3))).toMatchObject({ kind: "retry", failures: 2, retryAt: day(5) });
    expect(await chargeSubscription(db, hyp, user, day(5))).toMatchObject({ kind: "retry", failures: 3, retryAt: day(7) });
    expect((await db.getSubscription(user.id))!.status).toBe("active"); // the service continues through the retries
    expect(await chargeSubscription(db, hyp, user, day(7))).toMatchObject({ kind: "paused", failures: 4 });
    expect((await db.getSubscription(user.id))!.status).toBe("past_due");
    expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued")).toHaveLength(0);
    expect(await chargeSubscription(db, hyp, user, day(8))).toMatchObject({ kind: "skipped", reason: "paused" }); // paused → no automatic charges
    // payment settled from the site → active again
    hyp.chargeOk = true;
    const again = await activateSubscription(db, user, { plan: "pro", transId: "T9", amountIls: 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, day(9));
    expect(again.firstTime).toBe(false);
    expect(again.subscription).toMatchObject({ status: "active", charge_failures: 0 });
  });

  it("a card failure is not retried automatically: waits for a card update and pauses on day 7", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    const due = new Date("2026-11-20T10:00:00Z");
    hyp.chargeScript = ["997"]; // invalid token
    expect(await chargeSubscription(db, hyp, user, due)).toMatchObject({ kind: "card_invalid", ccode: "997", pauseAt: new Date("2026-11-26T10:00:00Z") });
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-22T10:00:00Z"))).toMatchObject({ kind: "skipped", reason: "waiting for a card update" });
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(1);
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-26T10:00:00Z"))).toMatchObject({ kind: "paused" });
  });

  it("a card updated after a card failure is charged on the next attempt day instead of a pause on day 7", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    hyp.chargeScript = ["997"]; // day 1 (20.11): the saved card is unusable
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-20T10:00:00Z"))).toMatchObject({ kind: "card_invalid" });
    // day 2: a new card → the attempt of day 3 runs with it
    await saveCardToken(db, user.id, "9999999999999991111", "3112");
    expect(await resumeAfterCardUpdate(db, user.id, new Date("2026-11-21T12:00:00Z"))).toEqual(new Date("2026-11-22T10:00:00Z"));
    expect((await db.getSubscription(user.id))!.charge_failures).toBe(1);
    expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued").map((j) => j.run_at)).toEqual(["2026-11-22T10:00:00.000Z"]);
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-22T10:00:00Z"))).toMatchObject({ kind: "charged", amountIls: 99 });
    expect((hyp.calls.filter((c) => c.method === "chargeToken").at(-1)!.args as { token: string }).token).toBe("9999999999999991111");
    expect(await db.getSubscription(user.id)).toMatchObject({ status: "active", charge_failures: 0, next_charge_at: "2026-12-20T10:00:00.000Z" });
    // not waiting for a card → nothing to resume
    expect(await resumeAfterCardUpdate(db, user.id, new Date("2026-11-23T10:00:00Z"))).toBeNull();
  });

  it("a card updated late in the wait still gets one attempt (day 7) before any pause", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    hyp.chargeScript = ["997", "4"];
    await chargeSubscription(db, hyp, user, new Date("2026-11-20T10:00:00Z"));
    expect(await resumeAfterCardUpdate(db, user.id, new Date("2026-11-25T12:00:00Z"))).toEqual(new Date("2026-11-26T10:00:00Z")); // day 6 → day 7
    expect((await db.getSubscription(user.id))!.charge_failures).toBe(3);
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-26T10:00:00Z"))).toMatchObject({ kind: "paused" }); // tried, declined → paused
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(2);
  });

  it("HYP approving a monthly charge without a transaction id leaves the lock unknown and changes nothing", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    hyp.chargeScript = [{ ok: true, transId: null, ccode: "0", acode: null, response: { CCode: "0", Id: "0" } }];
    await expect(chargeSubscription(db, hyp, user, new Date("2026-11-20T10:00:00Z"))).rejects.toThrow("without a transaction id");
    expect(db.billingApprovals.find((a) => a.kind === "renewal")).toMatchObject({ status: "unknown", error: "approved without a transaction id" });
    expect(await db.getSubscription(user.id)).toMatchObject({ charge_failures: 0, next_charge_at: "2026-11-20T10:00:00.000Z" }); // no failure counted, no retry scheduled
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-20T11:00:00Z"))).toMatchObject({ kind: "skipped", reason: "another charge is open" });
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(1);
  });

  it("scheduleCharge never leaves the subscription without a job when its key was used before", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const at = new Date("2026-11-20T10:00:00Z");
    await scheduleCharge(db, user.id, at, "resume");
    await scheduleCharge(db, user.id, at, "resume"); // the same key again (cancel → resume twice)
    await scheduleCharge(db, user.id, at); // and the plain key twice
    await scheduleCharge(db, user.id, at);
    expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued").map((j) => j.run_at)).toEqual(["2026-11-20T10:00:00.000Z"]);
  });

  it("a configuration error (901) is not the customer's failure; no answer from HYP leaves the lock unknown", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    const due = new Date("2026-11-20T10:00:00Z");
    hyp.chargeScript = ["901", new Error("ETIMEDOUT")];
    expect(await chargeSubscription(db, hyp, user, due)).toMatchObject({ kind: "config_error", ccode: "901" });
    expect((await db.getSubscription(user.id))!.charge_failures).toBe(0);
    await expect(chargeSubscription(db, hyp, user, new Date("2026-11-21T10:00:00Z"))).rejects.toThrow("ETIMEDOUT");
    expect(db.billingApprovals.filter((a) => a.kind === "renewal").map((a) => a.status)).toEqual(["failed", "unknown"]);
    // the unknown charge blocks every further charge of this user until reconciled
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-21T11:00:00Z"))).toMatchObject({ kind: "skipped", reason: "another charge is open" });
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(2);
  });

  it("the monthly charge tells the owner (lib/admin/alerts.ts): a decline with what happens next, and an unknown outcome", async () => {
    const seen = captureOwnerAlerts();
    try {
      const db = new MemoryDb();
      const user = await db.createUser("dana@example.com");
      const hyp = new MockHypGateway("https://app.example.co.il");
      await activateSubscription(db, user, { plan: "basic", transId: "T1", amountIls: 99, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
      hyp.chargeScript = ["4", new Error("ETIMEDOUT")];
      expect(await chargeSubscription(db, hyp, user, new Date("2026-11-20T10:00:00Z"))).toMatchObject({ kind: "retry", failures: 1 });
      await expect(chargeSubscription(db, hyp, user, new Date("2026-11-22T10:00:00Z"))).rejects.toThrow("ETIMEDOUT");
      const locks = db.billingApprovals.filter((a) => a.kind === "renewal");
      expect(seen.map((s) => s.event)).toEqual([
        expect.objectContaining({ type: "payment_failed", userId: user.id, email: "dana@example.com", amountIls: 99, ref: locks[0]!.id, reason: expect.stringMatching(/^חיוב חודשי: סירוב של חברת האשראי \(קוד 4\)\. ניסיון נוסף אוטומטי: /) }),
        expect.objectContaining({ type: "charge_unknown", userId: user.id, amountIls: 99, ref: locks[1]!.id, reason: "חיוב חודשי: לא התקבלה תשובה מ-HYP." }),
      ]);
    } finally {
      stopCapturingOwnerAlerts();
    }
  });

  it("a scheduled downgrade takes effect at the next monthly charge", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const hyp = new MockHypGateway("https://app.example.co.il");
    await activateSubscription(db, user, { plan: "pro", transId: "T1", amountIls: 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, new Date("2026-10-20T10:00:00Z"));
    await db.upsertSubscription(user.id, { scheduled_plan: "basic" });
    db.now = () => new Date("2026-11-20T10:00:00Z");
    db.usage.push({ user_id: user.id, period_start: "2026-11-01", counted_messages: 100, free_remaining: 2900, plan_limit: 3000 });
    expect(await chargeSubscription(db, hyp, user, new Date("2026-11-20T10:00:00Z"))).toMatchObject({ kind: "charged", plan: "basic", amountIls: 99 });
    expect(await db.getSubscription(user.id)).toMatchObject({ plan: "basic", scheduled_plan: null });
    // the month's quota follows the plan down at once (an upgrade raises it at once)
    expect(db.usage.find((u) => u.user_id === user.id && u.period_start === "2026-11-01")).toMatchObject({ plan_limit: 750, free_remaining: 650 });
  });
  it("a cancel, a downgrade or a switch to monthly made while HYP is charging is kept, never overwritten by the success", async () => {
    const t0 = new Date("2026-10-20T10:00:00Z");
    const due = new Date("2026-11-20T10:00:00Z");
    for (const change of ["cancel", "downgrade", "monthly"] as const) {
      const db = new MemoryDb();
      const user = await db.createUser(`race-${change}@example.com`);
      const hyp = new MockHypGateway("https://app.example.co.il");
      await activateSubscription(db, user, { plan: "pro", cycle: change === "monthly" ? "annual" : "monthly", transId: "T1", amountIls: change === "monthly" ? 2990 : 299, acode: null, token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} }, t0);
      const at = change === "monthly" ? new Date("2027-10-20T10:00:00Z") : due;
      db.now = () => at;
      // the user acts while the charge is in flight (after the lock was taken and the subscription read under it)
      const charge = hyp.chargeToken.bind(hyp);
      hyp.chargeToken = async (input) => {
        if (change === "cancel") await db.cancelSubscription(user.id);
        else if (change === "downgrade") await db.upsertSubscription(user.id, { scheduled_plan: "basic" });
        else await db.upsertSubscription(user.id, { scheduled_cycle: "monthly" });
        return charge(input);
      };
      expect(await chargeSubscription(db, hyp, user, at)).toMatchObject({ kind: "charged", plan: "pro" });
      const sub = (await db.getSubscription(user.id))!;
      if (change === "cancel") {
        // the period just paid runs to its end, and nothing more is charged
        expect(sub).toMatchObject({ status: "cancelled", plan: "pro" });
        expect(sub.cancelled_at).not.toBeNull();
        expect(db.jobs.filter((j) => j.kind === "charge" && j.status === "queued")).toHaveLength(0);
      } else if (change === "downgrade") {
        expect(sub).toMatchObject({ status: "active", plan: "pro", scheduled_plan: "basic" });
      } else {
        expect(sub).toMatchObject({ status: "active", billing_cycle: "annual", scheduled_cycle: "monthly" });
      }
    }
  });

  it("an 'active' row with a cancel on it is a cancelled plan (the backstop of the race); a paused account gets no scheduled service", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const base = { plan: "pro" as const, next_charge_at: "2026-11-20T10:00:00Z" };
    expect(effectivePlan({ ...base, status: "active", cancelled_at: "2026-10-30T00:00:00Z" }, now)).toBe("pro");
    expect(effectivePlan({ ...base, status: "active", cancelled_at: "2026-10-30T00:00:00Z" }, new Date("2026-12-01T00:00:00Z"))).toBe("trial");
    expect(effectivePlan({ ...base, status: "active", cancelled_at: null }, new Date("2026-12-01T00:00:00Z"))).toBe("pro");
    expect(effectivePlan({ ...base, status: "past_due" }, now)).toBe("pro"); // the account page and the retry price
    expect(servicePlan({ ...base, status: "past_due" }, now)).toBe("trial");
    expect(servicePlan({ ...base, status: "active" }, now)).toBe("pro");
  });
});
