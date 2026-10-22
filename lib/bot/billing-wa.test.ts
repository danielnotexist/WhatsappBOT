import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyCardLinkToken, verifyInvoiceToken } from "@/lib/billing/links";
import { PLANS } from "@/lib/billing/plans";
import { activateSubscription } from "@/lib/billing/subscription";
import { HypClient, MockHypGateway } from "@/lib/hyp/client";
import type { RecordedSend } from "@/lib/wa/sender";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

const PHONE = "+972501234567";
const TOKEN = "1234567890123454580"; // a HYP token ends with the card's last four digits

/** A user on a paid plan, activated 10 days before the harness clock (20.10.2026 08:00Z) → next charge 10.11. */
async function setup(plan: "basic" | "pro" = "basic") {
  const h = makeHarness();
  const hyp = new MockHypGateway("https://app.example.co.il");
  h.ctx.hyp = () => hyp;
  const created = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(created.id, { onboarding: { step: "done", startedAt: "x" } });
  await h.db.updateUserProfile(created.id, { name: "דנה לוי" });
  h.db.seedWaIdentity(created.id, PHONE);
  await activateSubscription(h.db, created, { plan, transId: "T0", amountIls: PLANS[plan].priceIls, acode: null, token: TOKEN, tokef: "3012", invoiceUrl: null, raw: {} }, new Date("2026-10-10T08:00:00Z"));
  const user = (await h.db.getUser(created.id))!;
  const charges = () => hyp.calls.filter((c) => c.method === "chargeToken");
  const last = (): RecordedSend => h.wa.sent.filter((s) => s.kind !== "read" && s.kind !== "reaction").at(-1)!;
  const okButton = (s: RecordedSend = last()) => s.buttons!.find((b) => b.id.startsWith("bill:ok:"))!.id;
  return { h, hyp, user, charges, last, okButton };
}

async function useUpQuota(h: ReturnType<typeof makeHarness>, userId: string) {
  h.db.usage.push({ user_id: userId, period_start: "2026-10-01", counted_messages: 750, free_remaining: 0, plan_limit: 750 });
}

describe("one-tap upgrade inside WhatsApp", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));

  it("at the 750 limit: prorated price with VAT and the card's last digits → [שדרוג עכשיו] → charged once via soft+token, pro at once, invoice in chat", async () => {
    const { h, hyp, user, charges, last, okButton } = await setup();
    await useUpQuota(h, user.id);
    await processInbound(h.ctx, h.inbound("תסכם לי את המייל של רונית"));
    const offer = last();
    expect(offer.kind).toBe("buttons");
    expect(offer.body).toContain("הגעת ל-750 ההודעות של המסלול הבסיסי");
    // 21 of 31 days left × (299 − 99) = 135.48 ₪, of which VAT 18% = 20.67 ₪
    expect(offer.body).toContain("לתשלום עכשיו: 135.48 ₪ (כולל מע״מ 20.67 ₪)");
    expect(offer.body).toContain("21 ימים, עד יום ג׳ 10.11");
    expect(offer.body).toContain("בכרטיס המסתיים ב-4580");
    expect(offer.buttons!.map((b) => b.title)).toEqual(["שדרוג עכשיו", "לא עכשיו"]);
    expect(charges()).toHaveLength(0); // an offer never charges

    await processInbound(h.ctx, h.button(okButton(offer), "שדרוג עכשיו"));
    expect(charges()).toHaveLength(1);
    const args = charges()[0]!.args as { amount: number; token: string; tokef: string; items: { description: string; quantity: number; price: number }[]; order: string; clientName: string };
    expect(args).toMatchObject({ amount: 135.48, token: TOKEN, tokef: "3012", clientName: "דנה" });
    expect(args.items).toEqual([{ description: "שדרוג למסלול פרו — יתרת התקופה עד 10.11.2026", quantity: 1, price: 135.48 }]);
    const approval = (await h.db.getBillingApproval(args.order))!;
    expect(approval).toMatchObject({ kind: "upgrade", status: "succeeded", ccode: "0", phone_e164: PHONE });
    expect(approval.approved_msg_id).toMatch(/^wamid\./);

    expect(await h.db.getSubscription(user.id)).toMatchObject({ plan: "pro", status: "active", next_charge_at: "2026-11-10T08:00:00.000Z" });
    expect(await h.db.countTrialMessage(user.id)).toBe(2249); // the month's quota rose to 3,000 at once
    const texts = h.wa.sent.filter((s) => s.kind === "text").map((s) => s.body!);
    expect(texts.at(-1)).toContain("שודרג. מסלול פרו פעיל מעכשיו");
    expect(texts.at(-1)).toContain("חויבו 135.48 ₪. החיוב הבא: 299 ₪ ב-יום ג׳ 10.11");
    expect(texts.at(-1)).toContain("אפשר לשלוח אותה שוב");
    // the invoice as a WhatsApp document (our signed /invoice link → fresh PrintHesh signature on open)
    const doc = last();
    expect(doc.kind).toBe("document");
    const link = (doc.extra as { link: string; filename: string }).link;
    expect(verifyInvoiceToken(link.split("/invoice/")[1])).toEqual({ userId: user.id, transId: approval.hyp_trans_id });
    expect((doc.extra as { filename: string }).filename).toBe(`קבלה-${approval.hyp_trans_id}.pdf`);
    expect(doc.body).toBe(`קבלה — 135.48 ₪, 20.10.2026`);
    expect(h.db.payments.at(-1)).toMatchObject({ approval_id: approval.id, ccode: "0", amount_ils: 135.48 });
    expect(h.db.audit.some((a) => a.action === "subscription.upgrade" && a.approved_by_msg_id === approval.approved_msg_id)).toBe(true);
    expect(hyp.calls.some((c) => c.method === "createPaymentPage")).toBe(false); // no web page, no card re-entry
  });

  it("on the wire (real HypClient, fake fetch): exactly one action=soft with Token=True, SendHesh=True, the shown amount and the approval id as Order", async () => {
    const { h, user, okButton } = await setup();
    const urls: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      return new Response(url.searchParams.get("action") === "soft" ? `Id=408671193&CCode=0&Amount=${url.searchParams.get("Amount")}&ACode=0502150&Fild1=&Fild2=&Fild3=&Hesh=EZ` : "CCode=999");
    }) as typeof fetch;
    h.ctx.hyp = () => new HypClient({ masof: "0010345518", key: "KEY1", passp: "PASS1" }, fetchImpl);

    await processInbound(h.ctx, h.inbound("שדרוג"));
    expect(urls).toHaveLength(0); // the offer itself never talks to HYP
    const press = h.button(okButton(), "שדרוג עכשיו");
    await processInbound(h.ctx, press);
    await processInbound(h.ctx, h.button(press.reply!.id, "שדרוג עכשיו")); // a second tap on the same approval
    expect(urls).toHaveLength(1);
    const q = urls[0]!.searchParams;
    expect(`${urls[0]!.origin}${urls[0]!.pathname}`).toBe("https://pay.hyp.co.il/p/");
    const approvalId = press.reply!.id.slice("bill:ok:".length);
    expect(Object.fromEntries(q)).toMatchObject({
      action: "soft",
      Masof: "0010345518",
      PassP: "PASS1",
      Token: "True",
      CC: TOKEN,
      Tmonth: "12",
      Tyear: "30",
      Amount: "135.48",
      Coin: "1",
      SendHesh: "True",
      email: "dana@example.com",
      ClientName: "דנה",
      ClientLName: "לוי",
      UserId: "000000000",
      Order: approvalId,
      Info: `upgrade:${approvalId}`,
      Pritim: "True",
      heshDesc: "[0~שדרוג למסלול פרו — יתרת התקופה עד 10.11.2026~1~135.48]",
    });
    expect(q.has("KEY")).toBe(false); // the API key is only for APISign
    expect(await h.db.getBillingApproval(approvalId)).toMatchObject({ status: "succeeded", hyp_trans_id: "408671193" });
    expect((await h.db.getSubscription(user.id))!.plan).toBe("pro");
    // nothing secret ever reaches the chat
    for (const s of h.wa.sent) expect(JSON.stringify(s)).not.toMatch(/PASS1|KEY1|1234567890123454580/);
  });

  it('"שדרוג" typed in the chat offers the same; [לא עכשיו] changes nothing', async () => {
    const { h, last, charges } = await setup();
    await processInbound(h.ctx, h.inbound("אני רוצה לשדרג לפרו"));
    const offer = last();
    expect(offer.body).toContain("*שדרוג למסלול פרו*");
    await processInbound(h.ctx, h.button(offer.buttons![1]!.id, "לא עכשיו"));
    expect(last().body).toBe("בסדר, לא בוצע חיוב ולא שיניתי כלום.");
    expect(charges()).toHaveLength(0);
  });

  it("approving twice → one charge (sequential, concurrent and a webhook redelivery)", async () => {
    const { h, charges, okButton } = await setup();
    await processInbound(h.ctx, h.inbound("שדרוג"));
    const id = okButton();
    const press = h.button(id, "שדרוג עכשיו");
    await processInbound(h.ctx, press);
    expect(await processInbound(h.ctx, press)).toMatchObject({ note: "duplicate" }); // same wamid redelivered
    await processInbound(h.ctx, h.button(id, "שדרוג עכשיו")); // a second tap
    expect(charges()).toHaveLength(1);
    expect(h.wa.texts.at(-1)).toBe("ההצעה הזו כבר טופלה, ולא יבוצע חיוב נוסף.");

    const b = await setup();
    await processInbound(b.h.ctx, b.h.inbound("שדרוג"));
    const id2 = b.okButton();
    await Promise.all([processInbound(b.h.ctx, b.h.button(id2)), processInbound(b.h.ctx, b.h.button(id2)), processInbound(b.h.ctx, b.h.button(id2))]);
    expect(b.charges()).toHaveLength(1);
    expect(b.h.db.payments.filter((p) => p.approval_id)).toHaveLength(1);
  });

  it("an approval older than 10 minutes never charges: a fresh offer (new id, re-quoted) instead", async () => {
    const { h, charges, okButton, last } = await setup();
    await processInbound(h.ctx, h.inbound("שדרוג"));
    const id = okButton();
    h.advance(10 * 60_000 + 1000);
    await processInbound(h.ctx, h.button(id, "שדרוג עכשיו"));
    expect(charges()).toHaveLength(0);
    expect(h.wa.texts.some((t) => t.startsWith("האישור הקודם כבר לא בתוקף (עברו יותר מ-10 דקות)"))).toBe(true);
    const fresh = okButton(last());
    expect(fresh).not.toBe(id);
    expect((await h.db.getBillingApproval(id.slice(8)))!.status).toBe("expired");
    await processInbound(h.ctx, h.button(fresh, "שדרוג עכשיו"));
    expect(charges()).toHaveLength(1);
  });

  it("a press from any number other than the linked one the offer went to → rejected, nothing charged", async () => {
    const { h, charges, okButton, user } = await setup();
    await processInbound(h.ctx, h.inbound("שדרוג"));
    const id = okButton();
    // another account's number presses Dana's approval id
    const other = await h.db.createUser("yossi@example.com");
    await h.db.mergeUserProfile(other.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(other.id, "+972509999999");
    await processInbound(h.ctx, { ...h.button(id, "שדרוג עכשיו"), from: "972509999999", fromE164: "+972509999999" });
    expect(h.wa.sent.filter((s) => s.to === "+972509999999" && s.body).at(-1)!.body).toBe("האישור הזה לא שייך למספר הזה, ולכן לא בוצע דבר.");
    // Dana moved her account to a new number: the offer sent to the old one cannot be approved from the new one
    const identity = h.db.waIdentities.find((w) => w.user_id === user.id)!;
    await h.db.unlinkWaIdentity(user.id, identity.id);
    h.db.seedWaIdentity(user.id, "+972507777777");
    await processInbound(h.ctx, { ...h.button(id), from: "972507777777", fromE164: "+972507777777" });
    expect(charges()).toHaveLength(0);
    expect((await h.db.getBillingApproval(id.slice(8)))!.status).toBe("pending");
    expect(h.db.audit.filter((a) => a.action === "billing.approval.reject")).toHaveLength(2);
  });

  it("soft failure codes: decline → [ניסיון חוזר] with a fresh approval; card → [עדכון כרטיס] only; temporary; configuration", async () => {
    const { h, hyp, charges, okButton, last, user } = await setup();
    hyp.chargeScript = ["4"];
    await processInbound(h.ctx, h.inbound("שדרוג"));
    await processInbound(h.ctx, h.button(okButton()));
    expect(last().body).toContain("חברת האשראי לא אישרה (קוד 4), ולכן לא בוצע חיוב");
    expect(last().buttons!.map((b) => b.title)).toEqual(["ניסיון חוזר", "עדכון כרטיס"]);
    expect((await h.db.getSubscription(user.id))!.plan).toBe("basic");
    expect(h.db.payments.at(-1)).toMatchObject({ ccode: "4" });
    await processInbound(h.ctx, h.button(okButton(), "ניסיון חוזר")); // the retry approval → charged
    expect(charges()).toHaveLength(2);
    expect((await h.db.getSubscription(user.id))!.plan).toBe("pro");

    const c = await setup();
    c.hyp.chargeScript = ["997"];
    await processInbound(c.h.ctx, c.h.inbound("שדרוג"));
    await processInbound(c.h.ctx, c.h.button(c.okButton()));
    expect(c.last().body).toContain("הכרטיס השמור לא אושר לחיוב (קוד 997)");
    expect(c.last().buttons).toEqual([{ id: "bill:card", title: "עדכון כרטיס" }]);

    const t = await setup();
    t.hyp.chargeScript = ["999"];
    await processInbound(t.h.ctx, t.h.inbound("שדרוג"));
    await processInbound(t.h.ctx, t.h.button(t.okButton()));
    expect(t.last().body).toContain("תקלת תקשורת");

    const f = await setup();
    f.hyp.chargeScript = ["901"];
    await processInbound(f.h.ctx, f.h.inbound("שדרוג"));
    await processInbound(f.h.ctx, f.h.button(f.okButton()));
    expect(f.h.wa.texts.at(-1)).toContain("תקלה זמנית במערכת התשלומים שלנו");
  });

  it("no answer from HYP → unknown: no automatic retry, and every further charge is blocked until reconciled", async () => {
    const { h, hyp, charges, okButton } = await setup();
    hyp.chargeScript = [new Error("ETIMEDOUT")];
    await processInbound(h.ctx, h.inbound("שדרוג"));
    const id = okButton();
    await processInbound(h.ctx, h.button(id));
    expect(h.wa.texts.at(-1)).toContain("כדי לא לחייב פעמיים");
    expect((await h.db.getBillingApproval(id.slice(8)))!.status).toBe("unknown");
    await processInbound(h.ctx, h.inbound("שדרוג"));
    await processInbound(h.ctx, h.button(okButton()));
    expect(h.wa.texts.at(-1)).toContain("יש חיוב קודם שעדיין בבדיקה");
    expect(charges()).toHaveLength(1);
  });

  it("an expired card is caught before HYP is called", async () => {
    const { h, charges } = await setup();
    await h.db.upsertSubscription((await h.db.findUserByEmail("dana@example.com"))!.id, { hyp_tokef: "2609" }); // September 2026
    await processInbound(h.ctx, h.inbound("שדרוג"));
    expect(h.wa.texts.at(-1)).toContain("תוקף הכרטיס השמור (מסתיים ב-4580) עבר");
    expect(charges()).toHaveLength(0);
  });

  it("trial users get the payment page; pro users are told; a scheduled downgrade is cleared by 'שדרוג'", async () => {
    const h = makeHarness();
    const u = await h.db.createUser("t@example.com");
    await h.db.mergeUserProfile(u.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(u.id, PHONE);
    await processInbound(h.ctx, h.inbound("שדרוג"));
    expect(h.wa.texts.at(-1)).toMatch(/דף תשלום מאובטח:\nhttps:\/\/app\.example\.co\.il\/pay\//);

    const p = await setup("pro");
    await processInbound(p.h.ctx, p.h.inbound("שדרוג"));
    expect(p.h.wa.texts.at(-1)).toContain("המסלול כבר פרו");
    await processInbound(p.h.ctx, p.h.inbound("לעבור לבסיסי"));
    expect(p.last().body).toContain("לעבור למסלול הבסיסי? השינוי ייכנס לתוקף ב-יום ג׳ 10.11");
    await processInbound(p.h.ctx, p.h.button(p.okButton(), "מעבר לבסיסי"));
    expect(await p.h.db.getSubscription(p.user.id)).toMatchObject({ plan: "pro", scheduled_plan: "basic" });
    await processInbound(p.h.ctx, p.h.inbound("שדרוג"));
    expect(p.h.wa.texts.at(-1)).toContain("המעבר לבסיסי בוטל");
    expect((await p.h.db.getSubscription(p.user.id))!.scheduled_plan).toBeNull();
    expect(p.charges()).toHaveLength(0);
  });
});

describe("cancel / resume from WhatsApp", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));

  it("cancel needs the confirmation button, stays active to the end of the period, and can be resumed without a charge", async () => {
    const { h, user, okButton, last, charges } = await setup();
    await processInbound(h.ctx, h.inbound("ביטול מנוי"));
    expect(last().body).toContain("לבטל את המנוי? הוא יישאר פעיל עד יום ג׳ 10.11");
    expect(last().buttons!.map((b) => b.title)).toEqual(["בטל מנוי", "השאר פעיל"]);
    expect((await h.db.getSubscription(user.id))!.status).toBe("active"); // nothing before the press
    await processInbound(h.ctx, h.button(last().buttons![1]!.id, "השאר פעיל"));
    expect(h.wa.texts.at(-1)).toBe("המנוי נשאר פעיל. לא שיניתי כלום.");

    await processInbound(h.ctx, h.inbound("לבטל את המנוי"));
    await processInbound(h.ctx, h.button(okButton(), "בטל מנוי"));
    expect(await h.db.getSubscription(user.id)).toMatchObject({ status: "cancelled" });
    expect(h.wa.texts.at(-1)).toContain("המנוי בוטל. אפשר להמשיך להשתמש עד יום ג׳ 10.11");
    expect(h.db.jobs.filter((j) => j.kind === "charge" && j.status === "queued")).toHaveLength(0);
    expect(await h.db.countTrialMessage(user.id)).toBeGreaterThan(10); // still on the paid plan until the period ends

    await processInbound(h.ctx, h.inbound("חידוש מנוי"));
    expect(last().body).toContain("עכשיו לא יבוצע חיוב");
    await processInbound(h.ctx, h.button(okButton(), "המשך מנוי"));
    expect(await h.db.getSubscription(user.id)).toMatchObject({ status: "active", cancelled_at: null });
    expect(h.db.jobs.filter((j) => j.kind === "charge" && j.status === "queued").map((j) => j.run_at)).toEqual(["2026-11-10T08:00:00.000Z"]);
    expect(charges()).toHaveLength(0);
  });

  it("after the period ended: 'חידוש מנוי' is a one-tap renewal for a new month", async () => {
    const { h, user, okButton, last, charges } = await setup();
    await h.db.cancelSubscription(user.id);
    h.advance(25 * 86_400_000); // 14.11 — past 10.11
    await processInbound(h.ctx, h.inbound("חידוש מנוי"));
    expect(last().body).toContain("*חידוש מנוי בסיסי*");
    expect(last().body).toContain("לתשלום עכשיו: 99 ₪ (כולל מע״מ 15.10 ₪)");
    await processInbound(h.ctx, h.button(okButton(), "חידוש עכשיו"));
    expect(charges()).toHaveLength(1);
    expect(await h.db.getSubscription(user.id)).toMatchObject({ status: "active", cancelled_at: null, next_charge_at: "2026-12-14T08:00:00.000Z" });
    expect(h.wa.texts.some((t) => t.startsWith("המנוי חודש — מסלול בסיסי פעיל. חויבו 99 ₪"))).toBe(true);
    expect(last().kind).toBe("document");
  });
});

describe("failed renewals in WhatsApp", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));

  it("[ניסיון חוזר] in grace charges the overdue month once and keeps the cycle; a paused account starts a new month", async () => {
    const { h, user, okButton, charges, last } = await setup();
    await h.db.upsertSubscription(user.id, { charge_failures: 1, next_charge_at: "2026-10-19T08:00:00.000Z" }); // due yesterday, failed
    await processInbound(h.ctx, h.inbound("ניסיון חוזר"));
    expect(last().body).toContain("החיוב החודשי שלא עבר: 99 ₪ (כולל מע״מ 15.10 ₪), בכרטיס המסתיים ב-4580");
    await processInbound(h.ctx, h.button(okButton(), "חיוב עכשיו"));
    expect(charges()).toHaveLength(1);
    expect(await h.db.getSubscription(user.id)).toMatchObject({ status: "active", charge_failures: 0, next_charge_at: "2026-11-19T08:00:00.000Z" });
    expect(h.wa.texts.some((t) => t.startsWith("החיוב עבר והחשבון פעיל. חויבו 99 ₪"))).toBe(true);

    const p = await setup();
    await p.h.db.upsertSubscription(p.user.id, { status: "past_due", charge_failures: 4, next_charge_at: "2026-10-01T08:00:00.000Z" });
    await processInbound(p.h.ctx, p.h.inbound("מה יש לי מחר?"));
    expect(p.last().body).toContain("החשבון מושהה עד להסדרת התשלום. אפשר להסדיר כאן בלחיצה:");
    expect(p.last().buttons!.map((b) => b.title)).toEqual(["ניסיון חוזר", "עדכון כרטיס"]);
    await processInbound(p.h.ctx, p.h.button(p.okButton(), "ניסיון חוזר"));
    expect(p.charges()).toHaveLength(1);
    expect(await p.h.db.getSubscription(p.user.id)).toMatchObject({ status: "active", charge_failures: 0, next_charge_at: "2026-11-20T08:00:00.000Z" });
  });

  it("a template quick reply pressed later than 10 minutes gets a fresh offer; a running monthly charge blocks the press", async () => {
    const { h, user, charges, okButton } = await setup();
    await h.db.upsertSubscription(user.id, { charge_failures: 1, next_charge_at: "2026-10-19T08:00:00.000Z" });
    const stale = await h.db.createBillingApproval({ user_id: user.id, kind: "retry", plan: "basic", amount_ils: 99, phone_e164: PHONE });
    h.advance(3 * 3_600_000);
    await processInbound(h.ctx, h.inbound("ניסיון חוזר", { type: "template_button", reply: { id: `bill:ok:${stale.id}`, title: "ניסיון חוזר" } }));
    expect(charges()).toHaveLength(0);
    expect(h.wa.texts.some((t) => t.includes("עברו יותר מ-10 דקות"))).toBe(true);
    // the monthly job holds the renewal lock right now → the fresh offer cannot be claimed
    const lock = await h.db.openRenewalCharge({ user_id: user.id, plan: "basic", amount_ils: 99 });
    await processInbound(h.ctx, h.button(okButton(), "חיוב עכשיו"));
    expect(h.wa.texts.at(-1)).toContain("יש חיוב קודם שעדיין בבדיקה");
    expect(charges()).toHaveLength(0);
    await h.db.updateBillingApproval(lock!.id, { status: "failed" });
  });

  it("[עדכון כרטיס] sends a signed link to a fresh HYP J2 page", async () => {
    const { h, user } = await setup();
    await processInbound(h.ctx, h.button("bill:card", "עדכון כרטיס"));
    const text = h.wa.texts.at(-1)!;
    expect(text).toContain("רק אימות, בלי חיוב");
    const token = text.match(/\/pay\/card\/(\S+)/)![1]!;
    expect(verifyCardLinkToken(token)).toEqual({ userId: user.id });
  });
});

describe("receipts (\"קבלה\") in chat", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));

  it('"קבלה" lists the last successful charges with signed links ("חשבונית" works too)', async () => {
    const { h, user, okButton } = await setup();
    await processInbound(h.ctx, h.inbound("קבלה"));
    expect(h.wa.texts.at(-1)).toContain("*הקבלות האחרונות*\n• 20.10.2026 — 99 ₪ — מנוי");
    expect(h.wa.texts.at(-1)).not.toContain("חשבונית");
    await processInbound(h.ctx, h.inbound("שדרוג"));
    await processInbound(h.ctx, h.button(okButton()));
    await processInbound(h.ctx, h.inbound("החשבוניות האחרונות"));
    const list = h.wa.texts.at(-1)!;
    expect(list).toContain("• 20.10.2026 — 135.48 ₪ — שדרוג למסלול פרו — יתרת התקופה עד 10.11.2026");
    const links = [...list.matchAll(/\/invoice\/(\S+)/g)].map((m) => verifyInvoiceToken(m[1]!));
    expect(links.map((l) => l?.userId)).toEqual([user.id, user.id]);
    expect(links[1]!.transId).toBe("T0");
  });

  it("no paid charges yet → a short note; the receipt command is not counted as a message", async () => {
    const h = makeHarness();
    const u = await h.db.createUser("t@example.com");
    await h.db.mergeUserProfile(u.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(u.id, PHONE);
    await processInbound(h.ctx, h.inbound("קבלות"));
    expect(h.wa.texts.at(-1)).toBe("עדיין אין קבלות. אחרי החיוב הראשון הקבלה תגיע לכאן ולמייל.");
    expect(h.db.usage.find((x) => x.user_id === u.id)).toBeUndefined();
  });
});
