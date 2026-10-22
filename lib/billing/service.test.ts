import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { RecordingWaSender } from "@/lib/wa/sender";
import { verifyCardLinkToken, verifyInvoiceToken } from "./links";
import { completePayment, runChargeJob, startPayment, type BillingContext } from "./service";
import { loadCardToken } from "./subscription";

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
    expect(args).toMatchObject({ Amount: 99, Coin: 1, Order: `${user.id}:basic`, Sign: true, MoreData: true, SendHesh: true, email: "dana@example.com", PageLang: "HEB", ClientName: "דנה", ClientLName: "לוי", Pritim: true, heshDesc: "[0~מנוי בסיסי — חודש~1~99]" });
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
    // inside the 24h window → free text, then the invoice as a document (our signed /invoice link)
    expect(wa.sent.map((x) => x.kind)).toEqual(["text", "document"]);
    expect(wa.sent[0]!.body).toContain("החשבון פעיל");
    expect(wa.sent[0]!.body).toContain("ממשיכה מאיפה שעצרנו");
    expect((wa.sent[1]!.extra as { link: string }).link).toMatch(/^https:\/\/app\.example\.co\.il\/invoice\//);
    expect(wa.sent[1]!.body).toBe("קבלה — 99 ₪, 20.10.2026");
    expect(await db.countTrialMessage(user.id)).toBe(749);
    // same redirect again → no second payment, still ok
    const again = await completePayment(ctx, `Id=401594866&CCode=0&Amount=99&ACode=0502150&Order=${user.id}%3Abasic&Sign=abc`);
    expect(again.ok).toBe(true);
    expect(await db.listPayments(user.id, 10)).toHaveLength(1);
    expect(wa.sent).toHaveLength(2); // not announced twice
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

  it("runs the monthly charge job: day 1 / 3 / 5 nudges with [ניסיון חוזר] [עדכון כרטיס], pause after day 7", async () => {
    const { ctx, db, wa, hyp, advance } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    advance(31 * 86_400_000); // 20.11 — due; no message from the user since 20.10 → templates
    hyp.chargeOk = false;
    const r1 = await runChargeJob(ctx, user.id);
    expect(r1).toMatchObject({ kind: "retry", failures: 1 });
    const t1 = wa.sent.at(-1)!;
    expect(t1.kind).toBe("template");
    expect(t1.template!.name).toBe("payment_failed");
    expect(t1.template!.params.map((p) => p.text)).toEqual(["99", "יום א׳ 22.11"]);
    // quick reply = a fresh 10-minute retry approval; URL suffix = the signed card-update token
    const quick = t1.template!.buttons.find((b) => b.subType === "quick_reply")!;
    const approvalId = quick.text.replace("bill:ok:", "");
    expect((await db.getBillingApproval(approvalId))).toMatchObject({ kind: "retry", amount_ils: 99, status: "pending", phone_e164: "+972501234567" });
    const cardToken = t1.template!.buttons.find((b) => b.subType === "url")!.text;
    expect(verifyCardLinkToken(cardToken)?.userId).toBe(user.id);
    expect((await db.recentMessages(user.id, 5)).at(-1)!.text).toContain("לא עבר הפעם");

    // the user writes on day 3 → window open → the next nudge is free text with buttons
    advance(2 * 86_400_000); // day 3
    await db.insertMessage({ user_id: user.id, wa_message_id: "w-in", direction: "in", text: "?" });
    expect(await runChargeJob(ctx, user.id)).toMatchObject({ kind: "retry", failures: 2 });
    expect(wa.sent.at(-1)!.kind).toBe("buttons");
    expect(wa.sent.at(-1)!.body).toContain("גם הניסיון השני");
    expect(wa.sent.at(-1)!.buttons!.map((b) => b.title)).toEqual(["ניסיון חוזר", "עדכון כרטיס"]);
    advance(2 * 86_400_000); // day 5
    await db.insertMessage({ user_id: user.id, wa_message_id: "w-in-2", direction: "in", text: "?" });
    expect(await runChargeJob(ctx, user.id)).toMatchObject({ kind: "retry", failures: 3 });
    expect(wa.sent.at(-1)!.body).toContain("הניסיון האחרון יהיה ב-יום ה׳ 26.11");
    advance(2 * 86_400_000); // day 7 — outside the window again → the account_paused template
    expect(await runChargeJob(ctx, user.id)).toMatchObject({ kind: "paused" });
    expect(wa.sent.at(-1)!.template!.name).toBe("account_paused");
    expect((await db.recentMessages(user.id, 5)).at(-1)!.text).toContain("החשבון מושהה");
    expect((await db.getSubscription(user.id))!.status).toBe("past_due");
  });

  it("after a successful monthly charge the invoice goes out: a document in the window, the payment_receipt template outside", async () => {
    const { ctx, db, wa, advance } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    advance(31 * 86_400_000);
    const r = await runChargeJob(ctx, user.id);
    expect(r).toMatchObject({ kind: "charged", amountIls: 99 });
    const t = wa.sent.at(-1)!;
    expect(t.template!.name).toBe("payment_receipt");
    expect(t.template!.params.map((p) => p.text)).toEqual(["99", "בסיסי", "20.12.2026"]);
    expect(verifyInvoiceToken(t.template!.buttons[0]!.text)).toEqual({ userId: user.id, transId: (r as { transId: string }).transId });
  });

  it("card failure → the card is updated from the template's link (window closed) → [ניסיון חוזר] in a template, and day 3 charges the new card", async () => {
    const { ctx, db, wa, hyp, advance } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    advance(31 * 86_400_000); // 20.11 — due, window closed
    hyp.chargeScript = ["997"];
    expect(await runChargeJob(ctx, user.id)).toMatchObject({ kind: "card_invalid" });
    expect(wa.sent.at(-1)!.template!.name).toBe("card_update_needed");
    advance(86_400_000); // day 2: the user taps the template's URL button — no WhatsApp message, so the window stays closed
    const r = await completePayment(ctx, `Id=777&CCode=600&Order=${user.id}%3Acard&Sign=x`);
    expect(r).toMatchObject({ ok: true, mode: "card" });
    expect((await loadCardToken(db, user.id))!.token).toBe("0000000000007774580");
    const t = wa.sent.at(-1)!;
    expect(t.kind).toBe("template");
    expect(t.template!.name).toBe("payment_failed");
    expect(t.template!.params.map((p) => p.text)).toEqual(["99", "יום א׳ 22.11"]);
    const quick = t.template!.buttons.find((b) => b.subType === "quick_reply")!;
    expect(await db.getBillingApproval(quick.text.replace("bill:ok:", ""))).toMatchObject({ kind: "retry", status: "pending", amount_ils: 99 });
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(1); // the card update itself never charges
    // day 3: the automatic attempt runs with the new card (not a pause on day 7)
    advance(86_400_000);
    expect(await runChargeJob(ctx, user.id)).toMatchObject({ kind: "charged", amountIls: 99 });
    expect((hyp.calls.filter((c) => c.method === "chargeToken").at(-1)!.args as { token: string }).token).toBe("0000000000007774580");
    expect(await db.getSubscription(user.id)).toMatchObject({ status: "active", charge_failures: 0, next_charge_at: "2026-12-20T10:00:00.000Z" });
  });

  it("a paused account whose card is updated outside the window gets the account_paused template with [ניסיון חוזר]", async () => {
    const { ctx, db, wa } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    await db.upsertSubscription(user.id, { status: "past_due", charge_failures: 4 });
    const now = ctx.now;
    ctx.now = () => new Date(now().getTime() + 2 * 86_400_000);
    await completePayment(ctx, `Id=778&CCode=600&Order=${user.id}%3Acard&Sign=x`);
    const t = wa.sent.at(-1)!;
    expect(t.template!.name).toBe("account_paused");
    expect(t.template!.buttons.map((b) => b.subType)).toEqual(["quick_reply", "url"]);
    expect((await db.getSubscription(user.id))!.status).toBe("past_due"); // nothing changes without the press
  });

  it("a card-update page that comes back with CCode 0 (a real charge, not a J2 check) saves nothing and alerts the operator", async () => {
    const { ctx, db, wa } = setup();
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await completePayment(ctx, `Id=1&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`);
    const before = (await loadCardToken(db, user.id))!.token;
    await db.insertMessage({ user_id: user.id, wa_message_id: "w-in", direction: "in", text: "עדכון כרטיס" }); // window open
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await completePayment(ctx, `Id=779&CCode=0&Amount=1&Order=${user.id}%3Acard&Sign=x`);
      expect(r).toMatchObject({ ok: false, reason: "charged_not_checked", mode: "card" });
      expect(err.mock.calls.some((c) => String(c[0]).includes("returned CCode 0"))).toBe(true);
    } finally {
      err.mockRestore();
    }
    expect((await loadCardToken(db, user.id))!.token).toBe(before);
    expect(db.audit.some((a) => a.action === "billing.card_update" && a.result === "charged_not_checked")).toBe(true);
    expect(wa.sent.at(-1)!.body).toContain("עדכון הכרטיס לא הושלם בגלל תקלה בהגדרות התשלום");
    expect(await db.listPayments(user.id, 10)).toHaveLength(1); // no payment row for the 1 ₪
  });
});
