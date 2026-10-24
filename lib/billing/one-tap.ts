/**
 * One-tap charges with the saved card (HYP soft + token) — the money code shared by the WhatsApp buttons
 * (lib/billing/whatsapp.ts) and the pay page's upgrade button (lib/billing/web-upgrade.ts). Both callers end in
 * `executeClaimedCharge`: the same stale check, the same HYP request (exactly the amount that was shown, Order = the
 * approval id), the same payments row, the same subscription change and audit. The callers only differ in how the
 * approval was claimed (a button press from the linked number / a single-use form nonce) and in how they tell the
 * user (a chat reply / a page face).
 */
import { ownerAlert } from "@/lib/admin/alerts";
import { chargeReason } from "@/lib/copy/owner-alerts";
import { reportError } from "@/lib/errors/report";
import type { BillingApprovalKind, BillingApprovalRow, SubscriptionRow, UserRow } from "@/lib/db/types";
import { classifyHypFailure, tokefExpired, tokenLast4, type HypFailureKind } from "@/lib/hyp/codes";
import { HypPreflightError } from "@/lib/hyp/sign";
import type { BillingContext } from "./context";
import { quoteMonth, quoteUpgrade, vatOf } from "./money";
import { shortDateHe } from "./notify";
import { PLANS, addOneMonth, isPaidPlan, type PaidPlan } from "./plans";
import { loadCardToken, renewalItem, renewalPlan, scheduleCharge } from "./subscription";

export type OfferKind = Exclude<BillingApprovalKind, "renewal">;

/** The kind of a one-tap charge, in the owner's alert. */
const ONE_TAP_KIND_HE: Partial<Record<BillingApprovalKind, string>> = { upgrade: "שדרוג לפרו", retry: "ניסיון חוזר", renew: "חידוש מנוי" };
export type ChargeKind = Extract<OfferKind, "upgrade" | "retry" | "renew">;

// ---------------------------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------------------------

export interface SubState {
  sub: SubscriptionRow | null;
  /** a paid plan that was ever activated (active / past_due / cancelled) */
  paid: boolean;
  /** past_due: renewal failed through day 7 */
  paused: boolean;
  /** active, the current renewal failed and is being retried */
  inGrace: boolean;
  cancelled: boolean;
  /** next_charge_at is in the past (or missing) */
  periodOver: boolean;
}

export function stateOf(sub: SubscriptionRow | null, now: Date): SubState {
  const paid = Boolean(sub && isPaidPlan(sub.plan) && sub.status !== "trial");
  const periodOver = !sub?.next_charge_at || Date.parse(sub.next_charge_at) <= now.getTime();
  return {
    sub,
    paid,
    paused: paid && sub!.status === "past_due",
    inGrace: paid && sub!.status === "active" && !sub!.cancelled_at && sub!.charge_failures > 0,
    cancelled: paid && sub!.status === "cancelled",
    periodOver,
  };
}

export interface SavedCard {
  token: string;
  tokef: string;
  last4: string;
  expired: boolean;
}

export async function savedCard(ctx: Pick<BillingContext, "db" | "now">, userId: string): Promise<SavedCard | null> {
  const card = await loadCardToken(ctx.db, userId).catch(() => null);
  if (!card) return null;
  return { ...card, last4: tokenLast4(card.token) ?? "????", expired: tokefExpired(card.tokef, ctx.now()) };
}

// ---------------------------------------------------------------------------------------------
// quotes
// ---------------------------------------------------------------------------------------------

export interface Quote {
  plan: PaidPlan;
  amountIls: number;
  details: Record<string, unknown>;
}

/** The invoice line of a prorated upgrade: "שדרוג למסלול פרו — יתרת התקופה עד 10.11.2026". */
export function upgradeItem(periodEnd: Date | string): string {
  return `שדרוג למסלול פרו — יתרת התקופה עד ${shortDateHe(periodEnd)}`;
}

/** What a charge offer of `kind` costs right now (null when the state does not allow it). */
export function quoteFor(kind: OfferKind, st: SubState, now: Date, last4: string): Quote | null {
  const sub = st.sub;
  if (!sub || !st.paid) return null;
  if (kind === "upgrade") {
    if (sub.plan !== "basic" || sub.status !== "active" || sub.cancelled_at || sub.charge_failures > 0 || !sub.next_charge_at) return null;
    const q = quoteUpgrade(sub.next_charge_at, now);
    if (!q) return null;
    return { plan: "pro", amountIls: q.amountIls, details: { item: upgradeItem(q.periodEnd), vat: q.vatIls, days_left: q.daysLeft, cycle_days: q.cycleDays, period_end: q.periodEnd.toISOString(), next_amount: q.nextAmountIls, last4 } };
  }
  const plan = renewalPlan(sub);
  if (!plan) return null;
  if (kind === "retry") {
    if (!(st.inGrace || st.paused) || !sub.next_charge_at) return null;
    const from = st.paused ? now : new Date(sub.next_charge_at);
    const to = addOneMonth(from);
    // `due` + `paused`: the overdue cycle this offer settles — a press after it changed is stale
    return { plan, amountIls: PLANS[plan].priceIls, details: { item: renewalItem(plan, from, to), vat: vatOf(PLANS[plan].priceIls), period_end: to.toISOString(), due: sub.next_charge_at, paused: st.paused, last4 } };
  }
  if (kind === "renew") {
    if (!(st.paused || (st.cancelled && st.periodOver))) return null;
    const q = quoteMonth(plan, now);
    return { plan, amountIls: q.amountIls, details: { item: renewalItem(plan, now, q.periodEnd), vat: q.vatIls, period_end: q.periodEnd.toISOString(), last4 } };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// execution (after a successful claim — status processing)
// ---------------------------------------------------------------------------------------------

/** Moves a claimed approval out of `processing` (which releases the per-user charge lock). */
export async function finishApproval(ctx: Pick<BillingContext, "db">, a: BillingApprovalRow, patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error">>): Promise<void> {
  await ctx.db.updateBillingApproval(a.id, patch, ["processing"]);
}

const sameInstant = (a: unknown, b: string | null | undefined): boolean => typeof a === "string" && typeof b === "string" && Date.parse(a) === Date.parse(b);

/**
 * Why a claimed charge approval no longer matches the subscription (null = charge it). An offer is priced for one
 * billing cycle: an upgrade for the days left until `period_end`, a retry for the overdue cycle `due`. A renewal, a
 * pause or a plan change since the offer makes it stale — the user asks again and gets a fresh quote.
 */
export function chargeStaleReason(a: BillingApprovalRow, st: SubState, now: Date): string | null {
  const sub = st.sub;
  if (!sub) return "no subscription";
  if (a.kind === "upgrade") {
    if (sub.plan !== "basic" || sub.status !== "active" || sub.cancelled_at || sub.charge_failures > 0) return "not an active basic plan";
    if (!sameInstant(a.details.period_end, sub.next_charge_at)) return "another billing cycle";
    if (Date.parse(sub.next_charge_at!) <= now.getTime()) return "the billing cycle ended";
    return null;
  }
  if (a.kind === "retry") {
    if (!st.inGrace && !st.paused) return "nothing overdue";
    if (!sameInstant(a.details.due, sub.next_charge_at) || a.details.paused !== st.paused) return "another billing cycle";
    if (a.plan !== renewalPlan(sub)) return "the plan changed";
    return null;
  }
  if (!st.paused && !(st.cancelled && st.periodOver)) return "nothing to renew";
  if (a.plan !== renewalPlan(sub)) return "the plan changed";
  return null;
}

/** What happened to a claimed charge approval. Nothing was charged unless `kind` is "charged" (or "unknown"). */
export type ClaimedChargeOutcome =
  | { kind: "stale"; reason: string }
  | { kind: "no_card" }
  | { kind: "card_expired"; last4: string }
  /** nothing reached HYP (gateway not configured / invalid request) */
  | { kind: "preflight" }
  /** no clear answer from HYP: the charge may exist; every further charge of the user is blocked until reconciled */
  | { kind: "unknown" }
  | { kind: "failed"; ccode: string; failure: HypFailureKind; transId: string | null; last4: string }
  | {
      kind: "charged";
      transId: string;
      amountIls: number;
      plan: PaidPlan;
      nextChargeAt: Date;
      /** upgrade: the message that hit the basic limit within the last day was not handled — it can be sent again */
      resendHint: boolean;
      /** the subscription before the charge */
      before: SubscriptionRow;
      /** retry: the overdue cycle was in grace (the cycle continues from its due date) */
      inGrace: boolean;
    };

/**
 * Executes a claimed (processing) charge approval — upgrade / retry / renew — with the saved card. The one charge code
 * for a WhatsApp press and for the pay page. `pressId` is what approved it (a wamid, or "web:<nonce>"), kept in the
 * audit. Re-checks the approval against the subscription (stale → nothing charged), charges exactly the approval's
 * amount via HYP soft + token (Order = the approval id), records the payment, and on success updates the subscription
 * BEFORE the approval leaves `processing` (the per-user charge lock). Sends nothing: the caller tells the user.
 */
export async function executeClaimedCharge(ctx: BillingContext, user: UserRow, a: BillingApprovalRow, pressId: string): Promise<ClaimedChargeOutcome> {
  const now = ctx.now();
  const st = stateOf(await ctx.db.getSubscription(user.id), now);
  const sub = st.sub;
  const audit = (result: string, action = `billing.approve.${a.kind}`) => ctx.db.addAudit({ user_id: user.id, action, target: a.id, approved_by_msg_id: pressId, result });
  const stage = `${pressId.startsWith("web:") ? "חיוב בדף התשלום" : "חיוב בלחיצה בוואטסאפ"} (${ONE_TAP_KIND_HE[a.kind] ?? a.kind})`;

  const staleReason = chargeStaleReason(a, st, now);
  if (staleReason || !sub) {
    const why = staleReason ?? "no subscription";
    await finishApproval(ctx, a, { status: "failed", error: `stale: ${why}` });
    await audit(`stale:${why}`);
    return { kind: "stale", reason: why };
  }

  const card = await savedCard(ctx, user.id);
  if (!card || card.expired) {
    await finishApproval(ctx, a, { status: "failed", error: card ? "card expired" : "no card" });
    await audit(card ? "failed:card_expired" : "failed:no_card");
    return card ? { kind: "card_expired", last4: card.last4 } : { kind: "no_card" };
  }

  const [first, ...rest] = (user.name ?? "").trim().split(/\s+/);
  const item = typeof a.details.item === "string" ? a.details.item : `מנוי ${PLANS[a.plan].nameHe}`;
  let result;
  try {
    result = await ctx.hyp.chargeToken({
      amount: a.amount_ils, // exactly what was shown
      token: card.token,
      tokef: card.tokef,
      email: user.email,
      clientName: first || undefined,
      clientLName: rest.join(" ") || undefined,
      info: `${a.kind}:${a.id}`,
      order: a.id,
      items: [{ description: item, quantity: 1, price: a.amount_ils }],
    });
  } catch (e) {
    if (e instanceof HypPreflightError) {
      // nothing was sent to HYP (gateway not configured / invalid request) — a plain failure, not "unknown"
      await finishApproval(ctx, a, { status: "failed", error: e.message.slice(0, 300) });
      await audit("failed:preflight");
      console.error(`[billing] ${a.kind} ${a.id}: HYP preflight failed:`, e.message);
      await reportError("billing", e, { userId: user.id, db: ctx.db, context: { kind: a.kind, approval: a.id, stage: "preflight" } });
      return { kind: "preflight" };
    }
    // No answer from HYP: the charge may or may not exist. "unknown" blocks every further charge of this user until
    // reconciled in the HYP portal (Order / Info = approval id) — never risk a double charge.
    await finishApproval(ctx, a, { status: "unknown", error: (e as Error).message.slice(0, 300) });
    await audit("unknown");
    console.error(`[billing] ${a.kind} ${a.id}: no answer from HYP — reconcile manually:`, (e as Error).message);
    await reportError("billing", e, { userId: user.id, db: ctx.db, context: { kind: a.kind, approval: a.id, stage: "no_answer" } });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: a.amount_ils, reason: `${stage}: לא התקבלה תשובה מ-HYP.`, ref: a.id }, { db: ctx.db });
    return { kind: "unknown" };
  }

  if (result.ok && !result.transId) {
    // approved without a transaction id: it cannot be matched to a receipt or told apart from a decline — treat it as
    // "unknown" (blocks further charges until reconciled), never as a decline that invites another charge
    await finishApproval(ctx, a, { status: "unknown", ccode: result.ccode || "0", error: "approved without a transaction id" });
    await audit("unknown:no_trans_id");
    console.error(`[billing] ${a.kind} ${a.id}: HYP approved without a transaction id — reconcile manually`);
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: a.amount_ils, reason: `${stage}: HYP אישר בלי מספר עסקה.`, ref: a.id }, { db: ctx.db });
    return { kind: "unknown" };
  }

  if (result.transId) {
    await ctx.db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: a.amount_ils, ccode: result.ok ? "0" : result.ccode || "?", acode: result.acode, invoice_url: null, raw: result.response, approval_id: a.id });
  }

  if (!result.ok || !result.transId) {
    const ccode = result.ccode || "?";
    const failure = classifyHypFailure(ccode);
    await finishApproval(ctx, a, { status: "failed", ccode, hyp_trans_id: result.transId });
    await audit(`failed:${ccode}:${failure}`);
    if (failure === "config") console.error(`[billing] HYP configuration error ${ccode} on ${a.kind} — see docs/hyp-setup.md`);
    ownerAlert({ type: "payment_failed", userId: user.id, email: user.email, name: user.name, amountIls: a.amount_ils, reason: chargeReason(stage, failure, ccode), ref: a.id }, { db: ctx.db });
    return { kind: "failed", ccode, failure, transId: result.transId, last4: card.last4 };
  }

  // ---- success: the subscription first, then the approval leaves `processing` (that releases the charge lock) ----
  if (a.kind === "upgrade") {
    const nextChargeAt = new Date(sub.next_charge_at!);
    await ctx.db.upsertSubscription(user.id, { plan: "pro", scheduled_plan: null });
    await ctx.db.raiseUsageLimit(user.id, PLANS.pro.messages);
    await finishApproval(ctx, a, { status: "succeeded", hyp_trans_id: result.transId, ccode: "0" });
    await audit("ok", "subscription.upgrade");
    // the upgrade came from the 750 limit within the last day → the message that hit it was not handled
    const offerAt = typeof user.profile.limit_offer_at === "string" ? Date.parse(user.profile.limit_offer_at) : 0;
    const resendHint = now.getTime() - offerAt < 24 * 3_600_000 && typeof user.profile.pending_input === "string";
    if (resendHint) await ctx.db.mergeUserProfile(user.id, { pending_input: null, limit_offer_at: null });
    return { kind: "charged", transId: result.transId, amountIls: a.amount_ils, plan: "pro", nextChargeAt, resendHint, before: sub, inGrace: st.inGrace };
  }
  // retry in grace → the cycle continues from its due date; paused / ended → a new month from today
  const nextChargeAt = a.kind === "retry" && st.inGrace ? addOneMonth(new Date(sub.next_charge_at!)) : addOneMonth(now);
  await ctx.db.upsertSubscription(user.id, {
    status: "active",
    plan: a.plan,
    scheduled_plan: null,
    charge_failures: 0,
    next_charge_at: nextChargeAt.toISOString(),
    cancelled_at: null,
    started_at: sub.started_at ?? now.toISOString(),
  });
  await scheduleCharge(ctx.db, user.id, nextChargeAt);
  await finishApproval(ctx, a, { status: "succeeded", hyp_trans_id: result.transId, ccode: "0" });
  await audit("ok", a.kind === "retry" ? "subscription.charge" : "subscription.renew");
  return { kind: "charged", transId: result.transId, amountIls: a.amount_ils, plan: a.plan, nextChargeAt, resendHint: false, before: sub, inGrace: st.inGrace };
}
