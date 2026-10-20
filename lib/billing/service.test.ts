import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { RecordingWaSender } from "@/lib/wa/sender";
import { verifyPayLinkToken } from "./pay-link";
import { completePayment, runChargeJob, startPayment, type BillingContext } from "./service";

function setup(start = new Date("2026-10-20T10:00:00Z")) {
  let now = start;
  const db = new MemoryDb();
  db.now = () => now;
  const hyp = new MockHypGateway("https://app.example.co.il");
  const wa = new RecordingWaSender();
  const ctx: BillingContext = { db, hyp, wa, appUrl: "https://app.example.co.il", now: () => now };
  return { db, hyp, wa, ctx, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("billing service", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));
  afterEach(() => undefined);

  it("starts a payment with the PLAN §4 SIGN parameters", async () => {
    const { ctx, hyp, db } = setup();
    const user = await db.createUser("dana@example.com");
    await db.updateUserProfile(user.id, { name: "דנה לוי" });
    const url = await startPayment(ctx, user, "basic");
    expect(url).toContain("/api/pay/mock");
    const args = hyp.calls[0]!.args as Record<string, unknown>;
    expect(args).toMatchObject({ Amount: 99, Coin: 1, Order: `${user.id}:basic`, Sign: true, MoreData: true, SendHesh: true, email: "dana@example.com", PageLang: "HEB", ClientName: "דנה", ClientLName: "לוי", Pritim: true });
  });

  it("completes a verified payment: token saved, plan active, WhatsApp notified, pending input resumed", async () => {
    const { ctx, db, wa } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await db.insertMessage({ user_id: user.id, wa_message_id: "w1", direction: "in", text: "שאלה 11" });
    await db.mergeUserProfile(user.id, { pending_input: "שאלה 11" });
    const r = await completePayment(ctx, `Id=401594866&CCode=0&Amount=99&ACode=0502150&Order=${user.id}%3Abasic&Sign=abc`);
    expect(r).toMatchObject({ ok: true, plan: "basic", transId: "401594866", firstTime: true });
    expect((await db.getSubscription(user.id))!.status).toBe("active");
    expect(wa.sent.at(-1)!.kind).toBe("text"); // inside the 24h window → free text
    expect(wa.texts.at(-1)).toContain("החשבון פעיל");
    expect(wa.texts.at(-1)).toContain("ממשיך מאיפה שעצרנו");
    expect(await db.countTrialMessage(user.id)).toBe(749);
    // same redirect again → no second payment, still ok
    const again = await completePayment(ctx, `Id=401594866&CCode=0&Amount=99&ACode=0502150&Order=${user.id}%3Abasic&Sign=abc`);
    expect(again.ok).toBe(true);
    expect(await db.listPayments(user.id, 10)).toHaveLength(1);
  });

  it("handles declined and unverifiable redirects and bad orders", async () => {
    const { ctx, db, wa } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    const declined = await completePayment(ctx, `Id=1&CCode=6&Amount=99&Order=${user.id}%3Apro&Sign=x`);
    expect(declined).toMatchObject({ ok: false, reason: "declined" });
    // no inbound message in the last 24h → template
    expect(wa.sent.at(-1)!.kind).toBe("template");
    expect(wa.sent.at(-1)!.template!.name).toBe("trial_ended_payment");
    expect((await db.getSubscription(user.id)) ?? null).toBeNull();
    expect(await completePayment(ctx, "Id=1&CCode=0&Order=nope&Sign=x")).toMatchObject({ ok: false, reason: "bad_order" });
  });

  it("runs the monthly charge job with the day 1 / 3 / 5 messages and pay links", async () => {
    const { ctx, db, wa, hyp, advance } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    advance(31 * 86_400_000);
    hyp.chargeOk = false;
    const r1 = await runChargeJob(ctx, user.id);
    expect(r1.kind).toBe("retry");
    const last = wa.sent.at(-1)!;
    expect(last.kind).toBe("template");
    expect(last.template!.name).toBe("payment_failed");
    expect(last.template!.params[0]!.text).toBe("99");
    const stored = (await db.recentMessages(user.id, 5)).at(-1)!;
    expect(stored.text).toContain("לא עבר הפעם");
    const link = stored.text!.match(/https:\/\/app\.example\.co\.il\/pay\/(\S+)/)![1]!;
    expect(verifyPayLinkToken(link)?.userId).toBe(user.id); // signed with the real clock (7-day validity)
    advance(3 * 86_400_000);
    expect((await runChargeJob(ctx, user.id)).kind).toBe("retry");
    expect((await db.recentMessages(user.id, 5)).at(-1)!.text).toContain("ניסיון אחרון בעוד יומיים");
    advance(2 * 86_400_000);
    expect((await runChargeJob(ctx, user.id)).kind).toBe("past_due");
    expect((await db.recentMessages(user.id, 5)).at(-1)!.text).toContain("החשבון מושהה");
  });
});
