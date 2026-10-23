import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { HypPreflightError } from "@/lib/hyp/sign";
import { RecordingWaSender } from "@/lib/wa/sender";
import type { BillingContext } from "./context";
import { createCardLinkToken, createUpgradeOfferToken, verifyInvoiceToken, verifyUpgradeOfferToken } from "./links";
import { PLANS } from "./plans";
import { activateSubscription } from "./subscription";
import { upgradeFromWeb, webUpgradeResult, webUpgradeView } from "./web-upgrade";

const PHONE = "+972501234567";
const TOKEN = "1234567890123454580"; // a HYP token ends with the card's last four digits
const START = new Date("2026-10-20T08:00:00Z");

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
});

/** A basic plan activated on 10.10 (next charge 10.11 08:00Z), the clock on 20.10 08:00Z: 21 of 31 days left. */
async function setup(opts: { plan?: "basic" | "pro"; phone?: boolean; windowOpen?: boolean; tokef?: string; token?: string | null } = {}) {
  let now = START;
  const db = new MemoryDb();
  db.now = () => now;
  const hyp = new MockHypGateway("https://app.example.co.il");
  const wa = new RecordingWaSender();
  const ctx: BillingContext = { db, hyp, wa, appUrl: "https://app.example.co.il", now: () => now };
  const created = await db.createUser(`dana-${randomUUID().slice(0, 8)}@example.com`);
  await db.updateUserProfile(created.id, { name: "דנה לוי" });
  if (opts.phone !== false) db.seedWaIdentity(created.id, PHONE);
  const plan = opts.plan ?? "basic";
  await activateSubscription(db, created, { plan, transId: "T0", amountIls: PLANS[plan].priceIls, acode: null, token: opts.token ?? TOKEN, tokef: opts.tokef ?? "3012", invoiceUrl: null, raw: {} }, new Date("2026-10-10T08:00:00Z"));
  if (opts.token === null) await db.upsertSubscription(created.id, { hyp_token_enc: null, hyp_tokef: null });
  if (opts.windowOpen !== false && opts.phone !== false) await db.insertMessage({ user_id: created.id, wa_message_id: "w0", direction: "in", text: "היי" });
  const user = (await db.getUser(created.id))!;
  const charges = () => hyp.calls.filter((c) => c.method === "chargeToken");
  const offer = async () => {
    const v = await webUpgradeView(ctx, user, await db.getSubscription(user.id));
    if (v.kind !== "offer") throw new Error(`no offer: ${JSON.stringify(v)}`);
    return v.offer;
  };
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { db, hyp, wa, ctx, user, charges, offer, advance };
}

describe("the upgrade face (webUpgradeView) — the WhatsApp offer's gate and price", () => {
  it("an active basic plan with a saved card: the prorated difference with VAT, the cycle end, the card, a signed 10-minute offer", async () => {
    const { offer, user } = await setup();
    const o = await offer();
    expect(o).toMatchObject({ amountIls: 135.48, vatIls: 20.67, daysLeft: 21, nextAmountIls: 299, last4: "4580" });
    expect(o.periodEnd.toISOString()).toBe("2026-11-10T08:00:00.000Z");
    const signed = verifyUpgradeOfferToken(o.offerToken, { now: START })!;
    expect(signed).toMatchObject({ userId: user.id, amountIls: 135.48, daysLeft: 21 });
    expect(signed.periodEnd.toISOString()).toBe("2026-11-10T08:00:00.000Z");
    expect(verifyUpgradeOfferToken(o.offerToken, { now: new Date(START.getTime() + 10 * 60_000 + 1000) })).toBeNull();
    // every render mints a new single-use nonce
    expect(signed.nonce).not.toBe(verifyUpgradeOfferToken((await offer()).offerToken, { now: START })!.nonce);
  });

  it("explains instead of offering when one tap cannot work: overdue, renewal due, no card, expired card; nothing for other plans", async () => {
    const a = await setup();
    await a.db.upsertSubscription(a.user.id, { charge_failures: 1 });
    expect(await webUpgradeView(a.ctx, a.user, await a.db.getSubscription(a.user.id))).toEqual({ kind: "blocked", reason: "settle" });

    const b = await setup();
    b.advance(21 * 86_400_000);
    expect(await webUpgradeView(b.ctx, b.user, await b.db.getSubscription(b.user.id))).toEqual({ kind: "blocked", reason: "renewal_due" });

    const c = await setup({ token: null });
    expect(await webUpgradeView(c.ctx, c.user, await c.db.getSubscription(c.user.id))).toEqual({ kind: "blocked", reason: "no_card" });

    const d = await setup({ tokef: "2609" });
    expect(await webUpgradeView(d.ctx, d.user, await d.db.getSubscription(d.user.id))).toEqual({ kind: "blocked", reason: "card_expired", last4: "4580" });

    const e = await setup({ plan: "pro" });
    expect(await webUpgradeView(e.ctx, e.user, await e.db.getSubscription(e.user.id))).toEqual({ kind: "not_basic" });
    await e.db.upsertSubscription(e.user.id, { plan: "basic", status: "cancelled", cancelled_at: START.toISOString() });
    expect(await webUpgradeView(e.ctx, e.user, await e.db.getSubscription(e.user.id))).toEqual({ kind: "not_basic" });
  });
});

describe("[לשדרג עכשיו] (upgradeFromWeb)", () => {
  it("charges exactly the amount shown, once, with the saved card; pro at once; the receipt and the chat's confirmation in WhatsApp", async () => {
    const { db, wa, ctx, user, charges, offer } = await setup();
    db.usage.push({ user_id: user.id, period_start: "2026-10-01", counted_messages: 750, free_remaining: 0, plan_limit: 750 });
    const o = await offer();
    const nonce = verifyUpgradeOfferToken(o.offerToken, { now: START })!.nonce;

    const out = await upgradeFromWeb(ctx, user, o.offerToken);
    expect(out).toEqual({ kind: "done", approvalId: nonce });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.args).toMatchObject({
      amount: 135.48,
      token: TOKEN,
      tokef: "3012",
      order: nonce,
      info: `upgrade:${nonce}`,
      clientName: "דנה",
      clientLName: "לוי",
      items: [{ description: "שדרוג למסלול פרו — יתרת התקופה עד 10.11.2026", quantity: 1, price: 135.48 }],
    });
    // the approval: claimed by the form, no phone, the shown terms
    const a = (await db.getBillingApproval(nonce))!;
    expect(a).toMatchObject({ kind: "upgrade", plan: "pro", status: "succeeded", ccode: "0", amount_ils: 135.48, phone_e164: null, approved_msg_id: `web:${nonce}` });
    expect(a.details).toMatchObject({ channel: "web", days_left: 21, vat: 20.67, period_end: "2026-11-10T08:00:00.000Z", last4: "4580" });
    // pro now, 299 from the next renewal (the cycle is unchanged), the month's quota raised
    expect(await db.getSubscription(user.id)).toMatchObject({ plan: "pro", status: "active", next_charge_at: "2026-11-10T08:00:00.000Z", scheduled_plan: null });
    expect(await db.countTrialMessage(user.id)).toBe(2249);
    expect(db.payments.at(-1)).toMatchObject({ approval_id: nonce, ccode: "0", amount_ils: 135.48 });
    expect(db.audit.find((e) => e.action === "subscription.upgrade")).toMatchObject({ target: nonce, approved_by_msg_id: `web:${nonce}`, result: "ok" });
    // WhatsApp (window open): the same text as the chat flow, then the receipt as a document
    const sent = wa.sent.filter((s) => s.to === PHONE);
    expect(sent.map((s) => s.kind)).toEqual(["text", "document"]);
    expect(sent[0]!.body).toContain("שודרג. מסלול פרו פעיל מעכשיו");
    expect(sent[0]!.body).toContain("חויבו 135.48 ₪. החיוב הבא: 299 ₪ ב-יום ג׳ 10.11");
    const link = (sent[1]!.extra as { link: string }).link;
    expect(verifyInvoiceToken(link.split("/invoice/")[1])).toEqual({ userId: user.id, transId: a.hyp_trans_id });

    expect(await webUpgradeResult(ctx, user.id, nonce)).toMatchObject({ status: "succeeded", amountIls: 135.48, vatIls: 20.67, nextAmountIls: 299, nextChargeAt: new Date("2026-11-10T08:00:00.000Z") });
  });

  it("outside the 24-hour window: the payment_success template (pro, 299, the next charge); without a linked number: nothing is sent", async () => {
    const out = await setup({ windowOpen: false });
    await upgradeFromWeb(out.ctx, out.user, (await out.offer()).offerToken);
    expect(out.wa.sent.map((s) => [s.kind, s.template?.name])).toEqual([["template", "payment_success"]]);
    expect(out.wa.sent[0]!.template!.params.map((p) => p.text)).toEqual(["פרו", "299", "10.11.2026"]);
    expect(JSON.stringify(out.wa.sent[0])).toContain("10.11.2026");

    const none = await setup({ phone: false });
    expect((await upgradeFromWeb(none.ctx, none.user, (await none.offer()).offerToken)).kind).toBe("done");
    expect((await none.db.getSubscription(none.user.id))!.plan).toBe("pro");
    expect(none.wa.sent).toEqual([]);
  });

  it("idempotent: the same form twice, at once, or after 10 minutes → one charge, the first result", async () => {
    const { ctx, user, charges, offer, advance, db } = await setup();
    const token = (await offer()).offerToken;
    const [a, b] = await Promise.all([upgradeFromWeb(ctx, user, token), upgradeFromWeb(ctx, user, token)]);
    expect(a).toEqual(b);
    expect(charges()).toHaveLength(1);
    expect(await upgradeFromWeb(ctx, user, token)).toEqual(a);
    advance(30 * 60_000);
    expect(await upgradeFromWeb(ctx, user, token)).toEqual(a); // back + resubmit, long after
    expect(charges()).toHaveLength(1);
    expect(db.billingApprovals.filter((x) => x.kind === "upgrade")).toHaveLength(1);
  });

  it("only the token's own account: an offer signed for another user, a forged or an old offer → nothing charged", async () => {
    const { ctx, user, charges, offer, advance, db } = await setup();
    const other = await setup();
    expect(await upgradeFromWeb(ctx, user, (await other.offer()).offerToken)).toEqual({ kind: "expired" });
    const real = (await offer()).offerToken;
    expect(await upgradeFromWeb(ctx, user, real.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toEqual({ kind: "expired" });
    expect(await upgradeFromWeb(ctx, user, "")).toEqual({ kind: "expired" });
    // a card link token is not an offer
    expect(await upgradeFromWeb(ctx, user, createCardLinkToken(user.id))).toEqual({ kind: "expired" });
    advance(10 * 60_000 + 1000);
    expect(await upgradeFromWeb(ctx, user, real)).toEqual({ kind: "expired" });
    expect(charges()).toHaveLength(0);
    expect(db.billingApprovals).toHaveLength(0);
    expect((await db.getSubscription(user.id))!.plan).toBe("basic");
  });

  it("wrong state since the offer: already pro, another cycle, an overdue charge, the card gone → nothing charged", async () => {
    for (const change of [
      { plan: "pro" as const },
      { next_charge_at: "2026-12-10T08:00:00.000Z" },
      { charge_failures: 1 },
      { hyp_token_enc: null, hyp_tokef: null },
    ]) {
      const { ctx, user, charges, offer, db } = await setup();
      const token = (await offer()).offerToken;
      await db.upsertSubscription(user.id, change);
      expect(await upgradeFromWeb(ctx, user, token)).toEqual({ kind: "changed" });
      expect(charges()).toHaveLength(0);
    }
    // an offer for a cycle that is not the subscription's (signed by us, but stale)
    const s = await setup();
    const forged = createUpgradeOfferToken(s.user.id, { nonce: randomUUID(), amountIls: 1, periodEnd: new Date("2026-11-09T08:00:00Z"), daysLeft: 1 }, { now: START });
    expect(await upgradeFromWeb(s.ctx, s.user, forged)).toEqual({ kind: "changed" });
    expect(s.charges()).toHaveLength(0);
  });

  it("another charge of the user is open (the monthly charge, a WhatsApp press, an unknown outcome) → busy, nothing charged", async () => {
    const { ctx, user, charges, offer, db } = await setup();
    const lock = (await db.openRenewalCharge({ user_id: user.id, plan: "basic", amount_ils: 99 }))!;
    expect(await upgradeFromWeb(ctx, user, (await offer()).offerToken)).toEqual({ kind: "busy" });
    expect(charges()).toHaveLength(0);
    expect(db.audit.at(-1)).toMatchObject({ action: "billing.approve.upgrade", result: "blocked:open_charge" });
    await db.updateBillingApproval(lock.id, { status: "failed" });
    expect((await upgradeFromWeb(ctx, user, (await offer()).offerToken)).kind).toBe("done");
    expect(charges()).toHaveLength(1);
  });

  it("a decline changes nothing and shows why; the retry is a new offer (a new nonce) and charges once", async () => {
    const { ctx, user, charges, offer, db, hyp, wa } = await setup();
    hyp.chargeScript.push("4");
    const first = await upgradeFromWeb(ctx, user, (await offer()).offerToken);
    if (first.kind !== "done") throw new Error("expected done");
    expect(await webUpgradeResult(ctx, user.id, first.approvalId)).toEqual({ status: "failed", failure: "declined", ccode: "4", last4: "4580" });
    expect(await db.getSubscription(user.id)).toMatchObject({ plan: "basic", charge_failures: 0 });
    expect(wa.sent).toEqual([]); // the page says it; no chat message for a declined web upgrade
    const retry = await upgradeFromWeb(ctx, user, (await offer()).offerToken);
    expect(retry.kind === "done" && retry.approvalId).not.toBe(first.approvalId);
    expect(charges()).toHaveLength(2);
    expect((await db.getSubscription(user.id))!.plan).toBe("pro");
  });

  it("maps every outcome for the page: a card failure, no answer (blocks further charges), a preflight error", async () => {
    const card = await setup();
    card.hyp.chargeScript.push("6");
    const c = await upgradeFromWeb(card.ctx, card.user, (await card.offer()).offerToken);
    expect(await webUpgradeResult(card.ctx, card.user.id, (c as { approvalId: string }).approvalId)).toMatchObject({ status: "failed", failure: "card", ccode: "6" });

    const lost = await setup();
    lost.hyp.chargeScript.push(new Error("socket hang up"));
    const l = await upgradeFromWeb(lost.ctx, lost.user, (await lost.offer()).offerToken);
    expect(await webUpgradeResult(lost.ctx, lost.user.id, (l as { approvalId: string }).approvalId)).toEqual({ status: "unknown" });
    expect(await upgradeFromWeb(lost.ctx, lost.user, (await lost.offer()).offerToken)).toEqual({ kind: "busy" });
    expect(lost.charges()).toHaveLength(1);

    const pre = await setup();
    pre.ctx.hyp = { ...pre.hyp, chargeToken: async () => Promise.reject(new HypPreflightError("HYP not configured")) } as unknown as BillingContext["hyp"];
    const p = await upgradeFromWeb(pre.ctx, pre.user, (await pre.offer()).offerToken);
    expect(await webUpgradeResult(pre.ctx, pre.user.id, (p as { approvalId: string }).approvalId)).toMatchObject({ status: "failed", failure: "config" });
    expect((await pre.db.getSubscription(pre.user.id))!.plan).toBe("basic");
  });

  it("the result page reads only this user's web upgrades", async () => {
    const { ctx, user, offer } = await setup();
    const other = await setup();
    const out = await upgradeFromWeb(ctx, user, (await offer()).offerToken);
    const id = (out as { approvalId: string }).approvalId;
    expect(await webUpgradeResult(ctx, other.user.id, id)).toBeNull();
    expect(await webUpgradeResult(ctx, user.id, "not-an-id")).toBeNull();
    expect(await webUpgradeResult(ctx, user.id, randomUUID())).toBeNull();
  });
});
