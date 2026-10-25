/**
 * monthly → annual from the personal area ([מעבר לשנתי], round 3): the annual cycle starts now; the unused part of the
 * current month is credited against the first annual charge (lib/billing/money.ts quoteAnnualSwitch — the same
 * proration as the upgrade), and the rest is charged to the saved card by the shared charge code
 * (executeClaimedCharge, lib/billing/one-tap.ts). The plan stays; next_charge_at becomes a year from now.
 *
 * The approval works like the pay page's upgrade (lib/billing/web-upgrade.ts): the area shows the price and signs it
 * into the form (a single-use nonce + the amount + the monthly cycle it was priced for, 10 minutes — purpose `ann`,
 * so an upgrade offer can never be replayed here or the other way round); submitting the form is the press. The row is
 * an `upgrade` approval (details.change = "annual", billing_cycle = annual) inserted already claimed with id = nonce:
 * the same form twice lands on the first result, and any other open charge of the user blocks it.
 */
import { randomUUID } from "node:crypto";
import { billCopy } from "@/lib/copy/bot-billing";
import type { BillingApprovalRow, SubscriptionRow, UserRow } from "@/lib/db/types";
import { classifyHypFailure, type HypFailureKind } from "@/lib/hyp/codes";
import { paymentSuccessTemplate } from "@/lib/wa/templates";
import type { BillingContext } from "./context";
import { createAnnualOfferToken, verifyAnnualOfferToken } from "./links";
import { MIN_CHARGE_ILS, formatIls, vatOf } from "./money";
import { deliver, sendInvoice, shortDateHe } from "./notify";
import { executeClaimedCharge, isAnnualSwitch, quoteAnnualSwitchFor, savedCard, stateOf, type ClaimedChargeOutcome } from "./one-tap";
import { PLANS, cycleOf, isPaidPlan, planNameHe, priceOf, type PaidPlan } from "./plans";
import { dayLabel } from "./whatsapp";

type ReadCtx = Pick<BillingContext, "db" | "now">;

export interface AnnualSwitchOffer {
  plan: PaidPlan;
  /** to pay now, VAT included */
  amountIls: number;
  vatIls: number;
  annualPriceIls: number;
  creditIls: number;
  daysLeft: number;
  /** the end of the current monthly cycle */
  periodEnd: Date;
  /** the next charge after the switch: a year from now (plus free days already granted) */
  newPeriodEnd: Date;
  last4: string;
  /** the hidden form field */
  offerToken: string;
}

/** Why a monthly plan cannot switch with one press now. */
export type AnnualSwitchBlock = "settle" | "renewal_due" | "no_card" | "card_expired" | "scheduled";

export type AnnualSwitchView = { kind: "offer"; offer: AnnualSwitchOffer } | { kind: "blocked"; reason: AnnualSwitchBlock; last4?: string } | { kind: "not_monthly" };

/** What the personal area offers an active monthly plan. */
export async function annualSwitchView(ctx: ReadCtx, user: Pick<UserRow, "id">, sub: SubscriptionRow | null): Promise<AnnualSwitchView> {
  const now = ctx.now();
  if (!sub || !isPaidPlan(sub.plan) || sub.status !== "active" || sub.cancelled_at || cycleOf(sub) !== "monthly") return { kind: "not_monthly" };
  if (sub.charge_failures > 0) return { kind: "blocked", reason: "settle" };
  if (sub.scheduled_plan || sub.scheduled_cycle) return { kind: "blocked", reason: "scheduled" };
  const card = await savedCard(ctx, user.id);
  if (!card) return { kind: "blocked", reason: "no_card" };
  if (card.expired) return { kind: "blocked", reason: "card_expired", last4: card.last4 };
  const q = quoteAnnualSwitchFor(stateOf(sub, now), now, card.last4);
  if (!q) return { kind: "blocked", reason: "renewal_due" };
  const d = q.details as { vat: number; credit: number; annual_price: number; days_left: number; period_end: string; new_period_end: string };
  const periodEnd = new Date(d.period_end);
  const offerToken = createAnnualOfferToken(user.id, { nonce: randomUUID(), amountIls: q.amountIls, periodEnd, daysLeft: d.days_left }, { now });
  return {
    kind: "offer",
    offer: { plan: q.plan, amountIls: q.amountIls, vatIls: d.vat, annualPriceIls: d.annual_price, creditIls: d.credit, daysLeft: d.days_left, periodEnd, newPeriodEnd: new Date(d.new_period_end), last4: card.last4, offerToken },
  };
}

export type AnnualSwitchOutcome = { kind: "done"; approvalId: string } | { kind: "expired" } | { kind: "changed" } | { kind: "busy" };

/** The approval a form opened before (same nonce), if it is this user's switch to annual. */
async function replayOf(ctx: ReadCtx, userId: string, nonce: string): Promise<BillingApprovalRow | null> {
  const a = await ctx.db.getBillingApproval(nonce);
  return a && a.user_id === userId && isAnnualSwitch(a) && a.approved_msg_id === `web:${a.id}` ? a : null;
}

/**
 * [מעבר לשנתי עכשיו]: verify the signed offer against this user, open the approval (id = nonce), charge it with the
 * shared charge code; on success confirm in WhatsApp with the receipt. Only `user`'s own subscription is touched.
 */
export async function switchToAnnualFromWeb(ctx: BillingContext, user: UserRow, offerToken: string): Promise<AnnualSwitchOutcome> {
  const now = ctx.now();
  const signed = verifyAnnualOfferToken(offerToken, { now: new Date(0) });
  if (!signed || signed.userId !== user.id) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", reason: "web:annual", result: "rejected:offer" });
    return { kind: "expired" };
  }
  const pressId = `web:${signed.nonce}`;
  const before = await replayOf(ctx, user.id, signed.nonce);
  if (before) return { kind: "done", approvalId: before.id };
  const offer = verifyAnnualOfferToken(offerToken, { now });
  if (!offer) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: signed.nonce, approved_by_msg_id: pressId, result: "expired" });
    return { kind: "expired" };
  }

  // the offer still describes this subscription: an active monthly plan, the same cycle, a usable card, a sane amount
  const card = await savedCard(ctx, user.id);
  const sub = await ctx.db.getSubscription(user.id);
  const q = card && !card.expired ? quoteAnnualSwitchFor(stateOf(sub, now), now, card.last4) : null;
  const maxIls = q ? priceOf(q.plan, "annual") : 0;
  if (!q || Date.parse(String(q.details.period_end)) !== offer.periodEnd.getTime() || offer.amountIls < MIN_CHARGE_ILS || offer.amountIls > maxIls) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: offer.nonce, approved_by_msg_id: pressId, result: "stale:offer" });
    return { kind: "changed" };
  }

  // exactly the amount that was shown (the credit as it was then), for the monthly cycle it was priced for
  const details = { ...q.details, vat: vatOf(offer.amountIls), days_left: offer.daysLeft, channel: "web" };
  const a = await ctx.db.openWebCharge({ id: offer.nonce, user_id: user.id, kind: "upgrade", plan: q.plan, amount_ils: offer.amountIls, details, billing_cycle: "annual" });
  if (!a) {
    const twin = await replayOf(ctx, user.id, offer.nonce);
    if (twin) return { kind: "done", approvalId: twin.id };
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: offer.nonce, approved_by_msg_id: pressId, result: "blocked:open_charge" });
    return { kind: "busy" };
  }
  const out = await executeClaimedCharge(ctx, user, a, pressId);
  if (out.kind === "charged") await confirmInWhatsapp(ctx, user, out);
  return { kind: "done", approvalId: a.id };
}

async function confirmInWhatsapp(ctx: BillingContext, user: UserRow, out: Extract<ClaimedChargeOutcome, { kind: "charged" }>): Promise<void> {
  const nextAmount = formatIls(out.nextAmountIls);
  const text = billCopy["bill.annual_switched"]({ plan: PLANS[out.plan].nameHe, amount: formatIls(out.amountIls), nextAmount, nextDate: dayLabel(out.nextChargeAt) });
  const where = await deliver(ctx, user, { text, template: paymentSuccessTemplate({ plan: PLANS[out.plan].nameHe, amount: nextAmount, nextCharge: shortDateHe(out.nextChargeAt), annual: true }) });
  if (where?.windowOpen) await sendInvoice(ctx, user, { transId: out.transId, amountIls: out.amountIls, date: ctx.now(), plan: out.plan, nextChargeAt: out.nextChargeAt, cycle: "annual" }, where);
}

export type AnnualSwitchFailure = "changed" | "no_card" | "card_expired" | HypFailureKind;

export type AnnualSwitchResult =
  | { status: "succeeded"; plan: PaidPlan; amountIls: number; nextChargeAt: Date; nextAmountIls: number }
  | { status: "processing" }
  | { status: "unknown" }
  | { status: "failed"; failure: AnnualSwitchFailure; ccode: string | null };

/** What became of a switch-to-annual approval of this user (null: not found, not this user's, or not a switch). */
export async function annualSwitchResult(ctx: Pick<BillingContext, "db">, userId: string, approvalId: string): Promise<AnnualSwitchResult | null> {
  if (!/^[0-9a-f-]{36}$/.test(approvalId)) return null;
  const a = await ctx.db.getBillingApproval(approvalId);
  if (!a || a.user_id !== userId || !isAnnualSwitch(a) || a.approved_msg_id !== `web:${a.id}`) return null;
  if (a.status === "succeeded") {
    const sub = await ctx.db.getSubscription(userId);
    return { status: "succeeded", plan: a.plan, amountIls: a.amount_ils, nextChargeAt: new Date(sub?.next_charge_at ?? String(a.details.new_period_end)), nextAmountIls: priceOf(a.plan, "annual") };
  }
  if (a.status === "processing" || a.status === "pending") return { status: "processing" };
  if (a.status === "unknown") return { status: "unknown" };
  const error = a.error ?? "";
  const failure: AnnualSwitchFailure = error.startsWith("stale:") ? "changed" : error === "no card" ? "no_card" : error === "card expired" ? "card_expired" : a.ccode ? classifyHypFailure(a.ccode) : "config";
  return { status: "failed", failure, ccode: a.ccode };
}

/** The personal area's notice for a result (fixed text; nothing from the URL). */
export function annualSwitchMessage(r: AnnualSwitchResult | null, fmtDay: (d: Date) => string): { ok: boolean; text: string } {
  if (!r) return { ok: false, text: "לא מצאנו את הבקשה. אפשר לנסות שוב." };
  switch (r.status) {
    case "succeeded":
      return { ok: true, text: `עברת לחיוב שנתי: מסלול ${planNameHe(r.plan, "annual")}. חויבו ${formatIls(r.amountIls)} ₪, והחיוב הבא: ${formatIls(r.nextAmountIls)} ₪ ב-${fmtDay(r.nextChargeAt)}. הקבלה נשלחה למייל.` };
    case "processing":
      return { ok: true, text: "החיוב עדיין בתהליך. בעוד כמה שניות אפשר לרענן את הדף ולראות את התוצאה." };
    case "unknown":
      return { ok: false, text: "לא התקבלה תשובה ברורה מחברת האשראי. כדי לא לחייב פעמיים, לא יבוצע ניסיון נוסף עד שזה יתברר. אם החיוב עבר, הקבלה תגיע למייל." };
    case "failed": {
      const code = r.ccode ? ` (קוד ${r.ccode})` : "";
      const text: Record<AnnualSwitchFailure, string> = {
        changed: "המצב של המנוי השתנה מאז שהמחיר הוצג, ולכן לא בוצע חיוב. כאן המחיר המעודכן.",
        no_card: "אין כרטיס שמור לחיוב, ולכן לא בוצע חיוב. אפשר לעדכן כרטיס ולחזור לכאן.",
        card_expired: "תוקף הכרטיס השמור עבר, ולכן לא בוצע חיוב. אפשר לעדכן כרטיס ולחזור לכאן.",
        card: `הכרטיס השמור לא אושר לחיוב${code}, ולכן לא בוצע חיוב. אפשר לעדכן כרטיס ולחזור לכאן.`,
        declined: `חברת האשראי לא אישרה את החיוב${code}. החיוב נשאר חודשי, ואפשר לנסות שוב.`,
        temporary: "הייתה תקלת תקשורת מול חברת האשראי, ולא בוצע חיוב. אפשר לנסות שוב בעוד רגע.",
        config: "יש תקלה זמנית במערכת התשלומים שלנו, ולא בוצע חיוב. אפשר לנסות שוב מאוחר יותר.",
      };
      return { ok: false, text: text[r.failure] };
    }
  }
}
