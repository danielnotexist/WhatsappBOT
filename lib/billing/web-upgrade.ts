/**
 * Basic → pro from the pay page (/pay/<token>) — the same deal as the WhatsApp upgrade (owner decision): the prorated
 * difference until the end of the current cycle, VAT included (quoteFor "upgrade" → quoteUpgrade), charged to the saved
 * card by the same charge code (executeClaimedCharge, lib/billing/one-tap.ts), pro at once, 299 ₪ from the next renewal,
 * the receipt by mail and the same confirmation in WhatsApp.
 *
 * The approval: the page shows the price and signs it into the form (a single-use nonce + the amount + the cycle,
 * 10 minutes — lib/billing/links.ts). Submitting the form is the press: the approval row is inserted already claimed
 * with id = nonce (Db.openWebCharge, migration 0012). The same form again (a double click, a refresh, back + resubmit)
 * hits the same id: no second approval, no second charge — it lands on the first one's result. Another open charge of
 * the user (a WhatsApp press, the monthly charge, an "unknown" outcome) blocks it by the same unique index.
 */
import { randomUUID } from "node:crypto";
import { billCopy } from "@/lib/copy/bot-billing";
import type { BillingApprovalRow, SubscriptionRow, UserRow } from "@/lib/db/types";
import { classifyHypFailure, type HypFailureKind } from "@/lib/hyp/codes";
import type { BillingContext } from "./context";
import { createUpgradeOfferToken, verifyUpgradeOfferToken } from "./links";
import { MIN_CHARGE_ILS, formatIls, vatOf } from "./money";
import { deliver, sendInvoice, shortDateHe } from "./notify";
import { executeClaimedCharge, isAnnualSwitch, quoteFor, savedCard, stateOf, type ClaimedChargeOutcome } from "./one-tap";
import { PLANS, isBillingCycle, priceOf, type BillingCycle } from "./plans";
import { paymentSuccessTemplate } from "@/lib/wa/templates";
import { dayLabel } from "./whatsapp";

type ReadCtx = Pick<BillingContext, "db" | "now">;

// ---------------------------------------------------------------------------------------------
// what the page shows
// ---------------------------------------------------------------------------------------------

export interface WebUpgradeOffer {
  amountIls: number;
  vatIls: number;
  daysLeft: number;
  /** the end of the current cycle = the next charge, at the pro price */
  periodEnd: Date;
  nextAmountIls: number;
  /** the cycle in force (an annual plan is upgraded for the rest of its year) */
  cycle: BillingCycle;
  /** the cycle of the next charge (monthly when an annual plan is set to move to monthly) */
  nextCycle: BillingCycle;
  last4: string;
  /** the hidden form field: signed nonce + amount + cycle, valid 10 minutes */
  offerToken: string;
}

/** Why an active basic plan cannot be upgraded with one tap right now (the page falls back to the card update). */
export type UpgradeBlock = "settle" | "renewal_due" | "no_card" | "card_expired";

export type WebUpgradeView = { kind: "offer"; offer: WebUpgradeOffer } | { kind: "blocked"; reason: UpgradeBlock; last4?: string } | { kind: "not_basic" };

/** The upgrade face of an active basic subscription — the same gate and price as the WhatsApp offer. */
export async function webUpgradeView(ctx: ReadCtx, user: Pick<UserRow, "id">, sub: SubscriptionRow | null): Promise<WebUpgradeView> {
  const now = ctx.now();
  if (!sub || sub.plan !== "basic" || sub.status !== "active" || sub.cancelled_at) return { kind: "not_basic" };
  if (sub.charge_failures > 0) return { kind: "blocked", reason: "settle" };
  const card = await savedCard(ctx, user.id);
  if (!card) return { kind: "blocked", reason: "no_card" };
  if (card.expired) return { kind: "blocked", reason: "card_expired", last4: card.last4 };
  const q = quoteFor("upgrade", stateOf(sub, now), now, card.last4);
  if (!q) return { kind: "blocked", reason: "renewal_due" };
  const d = q.details as { vat: number; days_left: number; period_end: string; next_amount: number; next_cycle?: string };
  const periodEnd = new Date(d.period_end);
  const offerToken = createUpgradeOfferToken(user.id, { nonce: randomUUID(), amountIls: q.amountIls, periodEnd, daysLeft: d.days_left }, { now });
  const nextCycle: BillingCycle = isBillingCycle(d.next_cycle) ? d.next_cycle : q.cycle;
  return { kind: "offer", offer: { amountIls: q.amountIls, vatIls: d.vat, daysLeft: d.days_left, periodEnd, nextAmountIls: d.next_amount, cycle: q.cycle, nextCycle, last4: card.last4, offerToken } };
}

// ---------------------------------------------------------------------------------------------
// the button
// ---------------------------------------------------------------------------------------------

/**
 * - `done`    — the approval to show (a new one, or the first one of a replayed form)
 * - `expired` — the offer is older than 10 minutes, or not ours: nothing charged, the page shows a fresh price
 * - `changed` — the subscription no longer matches the offer (plan, cycle, card): nothing charged
 * - `busy`    — another charge of the user is open: nothing charged
 */
export type WebUpgradeOutcome = { kind: "done"; approvalId: string } | { kind: "expired" } | { kind: "changed" } | { kind: "busy" };

const SETTLE_WAIT_MS = 8_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A replayed form whose first submission is still charging (a double click): wait for it to settle, so the page shows
 * the real result. Read-only — it never charges.
 */
async function settled(ctx: ReadCtx, id: string, waitMs: number): Promise<void> {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const a = await ctx.db.getBillingApproval(id);
    if (!a || a.status !== "processing") return;
    await sleep(150);
  }
}

/** The approval a form opened before (same nonce), if it is this user's web upgrade. */
async function replayOf(ctx: ReadCtx, userId: string, nonce: string): Promise<BillingApprovalRow | null> {
  const a = await ctx.db.getBillingApproval(nonce);
  return a && a.user_id === userId && a.kind === "upgrade" && !isAnnualSwitch(a) && a.approved_msg_id === `web:${a.id}` ? a : null;
}

/**
 * [לשדרג עכשיו]: verify the signed offer against this user, open the approval (id = nonce), charge it with the shared
 * charge code, and on success confirm in WhatsApp (the same text as the chat flow) with the receipt. Only `user`'s own
 * subscription is ever touched: the offer must be signed for this user id.
 */
export async function upgradeFromWeb(ctx: BillingContext, user: UserRow, offerToken: string, opts: { settleWaitMs?: number } = {}): Promise<WebUpgradeOutcome> {
  const now = ctx.now();
  const waitMs = opts.settleWaitMs ?? SETTLE_WAIT_MS;
  // signature first (expiry ignored): a replayed form lands on its first result even after the 10 minutes
  const signed = verifyUpgradeOfferToken(offerToken, { now: new Date(0) });
  if (!signed || signed.userId !== user.id) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", reason: "web", result: "rejected:offer" });
    return { kind: "expired" };
  }
  const pressId = `web:${signed.nonce}`;
  const before = await replayOf(ctx, user.id, signed.nonce);
  if (before) {
    await settled(ctx, before.id, waitMs);
    return { kind: "done", approvalId: before.id };
  }
  const offer = verifyUpgradeOfferToken(offerToken, { now });
  if (!offer) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: signed.nonce, approved_by_msg_id: pressId, result: "expired" });
    return { kind: "expired" };
  }

  // the offer still describes this subscription: an active basic plan, the same cycle, a usable card
  const card = await savedCard(ctx, user.id);
  const q = card && !card.expired ? quoteFor("upgrade", stateOf(await ctx.db.getSubscription(user.id), now), now, card.last4) : null;
  // never more than the whole difference of the cycle in force (2,000 ₪ on the annual cycle, 200 ₪ on the monthly one)
  const maxIls = q ? priceOf("pro", q.cycle) - priceOf("basic", q.cycle) : 0;
  if (!q || Date.parse(String(q.details.period_end)) !== offer.periodEnd.getTime() || offer.amountIls < MIN_CHARGE_ILS || offer.amountIls > maxIls) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: offer.nonce, approved_by_msg_id: pressId, result: "stale:offer" });
    return { kind: "changed" };
  }

  // exactly the amount that was shown, for the cycle it was priced for
  const details = { ...q.details, vat: vatOf(offer.amountIls), days_left: offer.daysLeft, channel: "web" };
  const a = await ctx.db.openWebCharge({ id: offer.nonce, user_id: user.id, kind: "upgrade", plan: "pro", amount_ils: offer.amountIls, details, billing_cycle: q.cycle });
  if (!a) {
    // the same form at the same moment (a double click) → its result; otherwise another charge is open
    const twin = await replayOf(ctx, user.id, offer.nonce);
    if (twin) {
      await settled(ctx, twin.id, waitMs);
      return { kind: "done", approvalId: twin.id };
    }
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approve.upgrade", target: offer.nonce, approved_by_msg_id: pressId, result: "blocked:open_charge" });
    return { kind: "busy" };
  }

  const out = await executeClaimedCharge(ctx, user, a, pressId);
  if (out.kind === "charged") await confirmInWhatsapp(ctx, user, out);
  return { kind: "done", approvalId: a.id };
}

/**
 * The chat flow's confirmation, to the linked number: inside the 24-hour window the same text as after [שדרוג עכשיו]
 * and the receipt as a document; outside it the approved `payment_success` template (pro, the next charge's amount and
 * date; `payment_success_annual` when the next charge is a yearly one). Never throws.
 */
async function confirmInWhatsapp(ctx: BillingContext, user: UserRow, out: Extract<ClaimedChargeOutcome, { kind: "charged" }>): Promise<void> {
  const nextAmount = formatIls(out.nextAmountIls);
  const sub = await ctx.db.getSubscription(user.id);
  const nextAnnual = (sub?.scheduled_cycle ?? sub?.billing_cycle) === "annual";
  const text = billCopy["bill.upgrade_done"]({ amount: formatIls(out.amountIls), nextAmount, nextDate: dayLabel(out.nextChargeAt), resendHint: out.resendHint });
  const where = await deliver(ctx, user, { text, template: paymentSuccessTemplate({ plan: PLANS.pro.nameHe, amount: nextAmount, nextCharge: shortDateHe(out.nextChargeAt), annual: nextAnnual }) });
  if (where?.windowOpen) await sendInvoice(ctx, user, { transId: out.transId, amountIls: out.amountIls, date: ctx.now(), plan: "pro", nextChargeAt: out.nextChargeAt, cycle: out.cycle }, where);
}

// ---------------------------------------------------------------------------------------------
// the result face
// ---------------------------------------------------------------------------------------------

export type UpgradeFailure = "changed" | "no_card" | "card_expired" | HypFailureKind;

export type WebUpgradeResult =
  | { status: "succeeded"; amountIls: number; vatIls: number; nextChargeAt: Date; nextAmountIls: number; nextCycle: BillingCycle }
  | { status: "processing" }
  | { status: "unknown" }
  | { status: "failed"; failure: UpgradeFailure; ccode: string | null; last4: string | null };

/** What became of a web upgrade approval of this user (null: not found, not this user's, or not a web upgrade). */
export async function webUpgradeResult(ctx: Pick<BillingContext, "db">, userId: string, approvalId: string): Promise<WebUpgradeResult | null> {
  if (!/^[0-9a-f-]{36}$/.test(approvalId)) return null;
  const a = await ctx.db.getBillingApproval(approvalId);
  if (!a || a.user_id !== userId || a.kind !== "upgrade" || isAnnualSwitch(a) || a.approved_msg_id !== `web:${a.id}`) return null;
  if (a.status === "succeeded") {
    const end = typeof a.details.period_end === "string" ? new Date(a.details.period_end) : null;
    const sub = end ? null : await ctx.db.getSubscription(userId);
    const nextChargeAt = end ?? new Date(sub?.next_charge_at ?? Date.now());
    const nextCycle: BillingCycle = isBillingCycle(a.details.next_cycle) ? a.details.next_cycle : isBillingCycle(a.billing_cycle) ? a.billing_cycle : "monthly";
    const nextAmountIls = typeof a.details.next_amount === "number" ? a.details.next_amount : priceOf("pro", nextCycle);
    return { status: "succeeded", amountIls: a.amount_ils, vatIls: vatOf(a.amount_ils), nextChargeAt, nextAmountIls, nextCycle };
  }
  if (a.status === "processing" || a.status === "pending") return { status: "processing" };
  if (a.status === "unknown") return { status: "unknown" };
  const last4 = typeof a.details.last4 === "string" ? a.details.last4 : null;
  const error = a.error ?? "";
  const failure: UpgradeFailure = error.startsWith("stale:")
    ? "changed"
    : error === "no card"
      ? "no_card"
      : error === "card expired"
        ? "card_expired"
        : a.ccode
          ? classifyHypFailure(a.ccode)
          : "config"; // nothing reached HYP (preflight)
  return { status: "failed", failure, ccode: a.ccode, last4 };
}
