/**
 * WhatsApp-native billing on top of HYP (owner decision 21.10.2026): one-tap upgrade / retry / renew with the saved
 * card token, invoices in chat, cancel and downgrade with confirmation.
 *
 * HARD RULE — never charge without an explicit button approval:
 *   an offer (amount shown, VAT included) creates a `billing_approvals` row bound to the linked number it was sent to;
 *   only a press of [approve] from that same number, by the account's owner, within 10 minutes (DB CHECK), claims it
 *   atomically (pending → processing). One approval → at most one HYP charge (claim + payments unique index), and
 *   never two open charges per user (unique index, shared with the monthly renewal). An expired press gets a fresh
 *   offer, not a charge. The amount charged is the amount that was shown.
 */
import { copy } from "@/lib/copy/bot";
import { OFFER_LABELS, billButtons, billCopy } from "@/lib/copy/bot-billing";
import type { BillingApprovalKind, BillingApprovalRow, SubscriptionRow, UserRow } from "@/lib/db/types";
import { classifyHypFailure, tokefExpired, tokenLast4 } from "@/lib/hyp/codes";
import { HypPreflightError } from "@/lib/hyp/sign";
import { dayLabelHe, localDateOf } from "@/lib/time/zoned";
import type { ReplyButton } from "@/lib/wa/types";
import type { BillingContext } from "./context";
import { billingCommandOf } from "./commands";
import { cardLinkFor, invoiceLinkFor } from "./links";
import { formatIls, quoteMonth, quoteUpgrade, vatOf } from "./money";
import { activePhone, sendInvoice, shortDateHe } from "./notify";
import { payLinkFor } from "./pay-link";
import { PLANS, addOneMonth, isPaidPlan, type PaidPlan } from "./plans";
import { loadCardToken, nextChargeRun, renewalItem, renewalPlan, scheduleCharge } from "./subscription";

export type OfferKind = Exclude<BillingApprovalKind, "renewal">;

/** "יום ו׳ 20.11" (Israel time) */
export const dayLabel = (d: Date | string) => dayLabelHe(localDateOf(new Date(d)));

// ---------------------------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------------------------

interface SubState {
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

function stateOf(sub: SubscriptionRow | null, now: Date): SubState {
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

interface SavedCard {
  token: string;
  tokef: string;
  last4: string;
  expired: boolean;
}

async function savedCard(ctx: BillingContext, userId: string): Promise<SavedCard | null> {
  const card = await loadCardToken(ctx.db, userId).catch(() => null);
  if (!card) return null;
  return { ...card, last4: tokenLast4(card.token) ?? "????", expired: tokefExpired(card.tokef, ctx.now()) };
}

/** Reply inside the open window (the user just wrote or pressed) and store the outbound row. */
async function reply(ctx: BillingContext, user: UserRow, to: string, text: string, buttons?: ReplyButton[]): Promise<void> {
  if (buttons?.length) await ctx.wa.sendButtons(to, text, buttons);
  else await ctx.wa.sendText(to, text);
  await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: buttons?.length ? "button" : "text", text });
}

// ---------------------------------------------------------------------------------------------
// quotes and approvals
// ---------------------------------------------------------------------------------------------

interface Quote {
  plan: PaidPlan;
  amountIls: number;
  details: Record<string, unknown>;
}

/** What a charge offer of `kind` costs right now (null when the state does not allow it). */
function quoteFor(kind: OfferKind, st: SubState, now: Date, last4: string): Quote | null {
  const sub = st.sub;
  if (!sub || !st.paid) return null;
  if (kind === "upgrade") {
    if (sub.plan !== "basic" || sub.status !== "active" || sub.cancelled_at || sub.charge_failures > 0 || !sub.next_charge_at) return null;
    const q = quoteUpgrade(sub.next_charge_at, now);
    if (!q) return null;
    const item = `שדרוג למסלול פרו — יתרת התקופה עד ${shortDateHe(q.periodEnd)}`;
    return { plan: "pro", amountIls: q.amountIls, details: { item, vat: q.vatIls, days_left: q.daysLeft, cycle_days: q.cycleDays, period_end: q.periodEnd.toISOString(), next_amount: q.nextAmountIls, last4 } };
  }
  const plan = renewalPlan(sub);
  if (!plan) return null;
  if (kind === "retry") {
    if (!(st.inGrace || st.paused) || !sub.next_charge_at) return null;
    const from = st.paused ? now : new Date(sub.next_charge_at);
    const to = addOneMonth(from);
    return { plan, amountIls: PLANS[plan].priceIls, details: { item: renewalItem(plan, from, to), vat: vatOf(PLANS[plan].priceIls), period_end: to.toISOString(), last4 } };
  }
  if (kind === "renew") {
    if (!(st.paused || (st.cancelled && st.periodOver))) return null;
    const q = quoteMonth(plan, now);
    return { plan, amountIls: q.amountIls, details: { item: renewalItem(plan, now, q.periodEnd), vat: q.vatIls, period_end: q.periodEnd.toISOString(), last4 } };
  }
  return null;
}

async function createApproval(ctx: BillingContext, user: UserRow, to: string, kind: OfferKind, plan: PaidPlan, amountIls: number, details: Record<string, unknown>): Promise<BillingApprovalRow> {
  const a = await ctx.db.createBillingApproval({ user_id: user.id, kind, plan, amount_ils: amountIls, details, phone_e164: to });
  await ctx.db.addAudit({ user_id: user.id, action: `billing.offer.${kind}`, target: a.id, result: amountIls ? `amount:${formatIls(amountIls)}` : "sent" });
  return a;
}

/**
 * A retry approval for the renewal nudges (in-window buttons or the template's quick reply). null when there is no
 * usable card or nothing is overdue.
 */
export async function createRetryApproval(ctx: BillingContext, user: UserRow, phone: string): Promise<BillingApprovalRow | null> {
  const card = await savedCard(ctx, user.id);
  if (!card || card.expired) return null;
  const q = quoteFor("retry", stateOf(await ctx.db.getSubscription(user.id), ctx.now()), ctx.now(), card.last4);
  return q ? createApproval(ctx, user, phone, "retry", q.plan, q.amountIls, q.details) : null;
}

/** Shown before any charge offer: a missing / expired card cannot be charged with one tap. */
async function cardProblem(ctx: BillingContext, user: UserRow, to: string, card: SavedCard | null): Promise<boolean> {
  if (!card) {
    await reply(ctx, user, to, billCopy["bill.no_saved_card"](payLinkFor(ctx.appUrl, user.id)));
    return true;
  }
  if (card.expired) {
    await reply(ctx, user, to, billCopy["bill.card_expired"](card.last4), billButtons.card);
    return true;
  }
  return false;
}

function offerText(kind: OfferKind, q: Quote, lead?: string): string {
  const d = q.details as { vat: number; days_left?: number; period_end: string; next_amount?: number; last4: string };
  if (kind === "upgrade") {
    return billCopy["bill.upgrade_offer"]({ amount: formatIls(q.amountIls), vat: formatIls(d.vat), daysLeft: d.days_left ?? 1, periodEnd: dayLabel(d.period_end), nextAmount: formatIls(d.next_amount ?? PLANS.pro.priceIls), last4: d.last4, lead });
  }
  if (kind === "retry") return billCopy["bill.retry_offer"]({ amount: formatIls(q.amountIls), vat: formatIls(d.vat), last4: d.last4 });
  return billCopy["bill.renew_offer"]({ plan: PLANS[q.plan].nameHe, amount: formatIls(q.amountIls), vat: formatIls(d.vat), periodEnd: dayLabel(d.period_end), last4: d.last4 });
}

/**
 * Presents an offer (or explains why there is none). Charge offers show the amount with VAT and the card's last four
 * digits; the buttons carry the new approval id. Returns the approval when one was created.
 */
export async function presentOffer(ctx: BillingContext, user: UserRow, to: string, kind: OfferKind, opts: { lead?: string } = {}): Promise<BillingApprovalRow | null> {
  const now = ctx.now();
  const st = stateOf(await ctx.db.getSubscription(user.id), now);
  const sub = st.sub;
  const payLink = payLinkFor(ctx.appUrl, user.id);
  if (!st.paid || !sub) {
    await reply(ctx, user, to, kind === "cancel" || kind === "downgrade" ? billCopy["bill.cancel_not_active"]() : billCopy["bill.trial_pay_link"](payLink));
    return null;
  }
  const periodEnd = sub.next_charge_at ? dayLabel(sub.next_charge_at) : "סוף התקופה";

  switch (kind) {
    case "upgrade": {
      if (st.inGrace || st.paused) {
        await reply(ctx, user, to, billCopy["bill.upgrade_needs_settle"]());
        return presentOffer(ctx, user, to, "retry");
      }
      if (st.cancelled) {
        await reply(ctx, user, to, st.periodOver ? billCopy["bill.trial_pay_link"](payLink) : billCopy["bill.upgrade_cancelled_first"](periodEnd));
        return null;
      }
      if (sub.plan === "pro") {
        if (sub.scheduled_plan === "basic") {
          await ctx.db.upsertSubscription(user.id, { scheduled_plan: null });
          await ctx.db.addAudit({ user_id: user.id, action: "subscription.downgrade_cleared", result: "ok" });
          await reply(ctx, user, to, billCopy["bill.downgrade_cleared"]());
        } else {
          await reply(ctx, user, to, billCopy["bill.already_pro"]());
        }
        return null;
      }
      break;
    }
    case "retry":
    case "renew": {
      if (st.cancelled && !st.periodOver) return presentOffer(ctx, user, to, "resume");
      if (!st.inGrace && !st.paused && !(st.cancelled && st.periodOver)) {
        await reply(ctx, user, to, billCopy["bill.already_active"](periodEnd));
        return null;
      }
      // in grace the renewal is retried; paused / ended → a new month
      kind = st.inGrace ? "retry" : kind === "retry" && st.paused ? "retry" : "renew";
      break;
    }
    case "resume": {
      if (!st.cancelled) {
        await reply(ctx, user, to, billCopy["bill.already_active"](periodEnd));
        return null;
      }
      if (st.periodOver) return presentOffer(ctx, user, to, "renew");
      const plan = renewalPlan(sub)!;
      const a = await createApproval(ctx, user, to, "resume", plan, 0, { period_end: sub.next_charge_at });
      await reply(ctx, user, to, billCopy["bill.resume_offer"]({ periodEnd, amount: formatIls(PLANS[plan].priceIls) }), billButtons.offer(a.id, OFFER_LABELS.resume.yes, OFFER_LABELS.resume.no));
      return a;
    }
    case "cancel": {
      if (st.cancelled) {
        await reply(ctx, user, to, st.periodOver ? billCopy["bill.cancel_not_active"]() : billCopy["bill.already_cancelled"](periodEnd));
        return null;
      }
      const a = await createApproval(ctx, user, to, "cancel", sub.plan as PaidPlan, 0, { period_end: sub.next_charge_at });
      const text = st.paused ? billCopy["bill.cancel_confirm_paused"]() : copy["bill.cancel_confirm"](periodEnd);
      await reply(ctx, user, to, text, billButtons.offer(a.id, OFFER_LABELS.cancel.yes, OFFER_LABELS.cancel.no));
      return a;
    }
    case "downgrade": {
      if (st.cancelled) {
        await reply(ctx, user, to, billCopy["bill.already_cancelled"](periodEnd));
        return null;
      }
      if (sub.plan === "basic" || sub.scheduled_plan === "basic") {
        await reply(ctx, user, to, sub.plan === "basic" ? billCopy["bill.already_basic"]() : billCopy["bill.downgrade_scheduled"](periodEnd));
        return null;
      }
      const a = await createApproval(ctx, user, to, "downgrade", "basic", 0, { period_end: sub.next_charge_at });
      await reply(ctx, user, to, billCopy["bill.downgrade_confirm"](periodEnd), billButtons.offer(a.id, OFFER_LABELS.downgrade.yes, OFFER_LABELS.downgrade.no));
      return a;
    }
  }

  // charge offers: upgrade / retry / renew
  const card = await savedCard(ctx, user.id);
  if (await cardProblem(ctx, user, to, card)) return null;
  const q = quoteFor(kind, st, now, card!.last4);
  if (!q) {
    await reply(ctx, user, to, kind === "upgrade" ? billCopy["bill.upgrade_wait_renewal"]() : billCopy["bill.already_active"](periodEnd));
    return null;
  }
  const a = await createApproval(ctx, user, to, kind, q.plan, q.amountIls, q.details);
  const labels = OFFER_LABELS[kind as "upgrade" | "retry" | "renew"];
  await reply(ctx, user, to, offerText(kind, q, opts.lead), billButtons.offer(a.id, labels.yes, labels.no));
  return a;
}

// ---------------------------------------------------------------------------------------------
// button presses
// ---------------------------------------------------------------------------------------------

export function parseBillingButton(id: string): { verb: "ok" | "no"; approvalId: string } | { verb: "card" } | null {
  if (id === "bill:card") return { verb: "card" };
  const m = id.match(/^bill:(ok|no):([0-9a-f-]{36})$/);
  return m ? { verb: m[1] as "ok" | "no", approvalId: m[2]! } : null;
}

/**
 * A press on a billing button (interactive reply or template quick reply). `from` is the number that pressed —
 * already resolved to `user` by its linked identity; the approval must have been sent to that same number.
 */
export async function handleBillingButton(ctx: BillingContext, user: UserRow, from: string, buttonId: string, waMessageId: string): Promise<void> {
  const parsed = parseBillingButton(buttonId);
  if (!parsed) {
    await reply(ctx, user, from, billCopy["bill.approval_not_found"]());
    return;
  }
  if (parsed.verb === "card") {
    await sendCardLink(ctx, user, from);
    return;
  }
  const a = await ctx.db.getBillingApproval(parsed.approvalId);
  if (!a) {
    await reply(ctx, user, from, billCopy["bill.approval_not_found"]());
    return;
  }
  // only the account's owner, from the linked number the offer was sent to (and that number is still the active one)
  if (a.user_id !== user.id || a.phone_e164 !== from || a.kind === "renewal" || (await activePhone(ctx, user.id)) !== from) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.approval.reject", target: a.id, reason: "wrong_number", approved_by_msg_id: waMessageId, result: "rejected" });
    await reply(ctx, user, from, billCopy["bill.approval_wrong_number"]());
    return;
  }
  const kind = a.kind as OfferKind;

  if (parsed.verb === "no") {
    const declined = await ctx.db.updateBillingApproval(a.id, { status: "declined" }, ["pending"]);
    await ctx.db.addAudit({ user_id: user.id, action: `billing.decline.${kind}`, target: a.id, approved_by_msg_id: waMessageId, result: declined ? "declined" : `noop:${a.status}` });
    if (!declined) await reply(ctx, user, from, billCopy["bill.approval_used"]());
    else await reply(ctx, user, from, kind === "cancel" ? copy["bill.cancel_kept"]() : kind === "downgrade" ? billCopy["bill.downgrade_kept"]() : billCopy["bill.offer_declined"]());
    return;
  }

  const expired = a.status === "expired" || (a.status === "pending" && Date.parse(a.expires_at) <= ctx.now().getTime());
  if (expired) {
    await ctx.db.updateBillingApproval(a.id, { status: "expired" }, ["pending"]);
    await ctx.db.addAudit({ user_id: user.id, action: `billing.approve.${kind}`, target: a.id, approved_by_msg_id: waMessageId, result: "expired" });
    await reply(ctx, user, from, billCopy["bill.approval_expired"]());
    await presentOffer(ctx, user, from, kind);
    return;
  }
  if (a.status !== "pending") {
    await ctx.db.addAudit({ user_id: user.id, action: `billing.approve.${kind}`, target: a.id, approved_by_msg_id: waMessageId, result: `duplicate:${a.status}` });
    await reply(ctx, user, from, billCopy["bill.approval_used"]());
    return;
  }

  const claimed = await ctx.db.claimBillingApproval(a.id, { userId: user.id, phoneE164: from, waMessageId });
  if (!claimed) {
    const fresh = await ctx.db.getBillingApproval(a.id);
    const blocked = fresh?.status === "pending" && Date.parse(fresh.expires_at) > ctx.now().getTime();
    await ctx.db.addAudit({ user_id: user.id, action: `billing.approve.${kind}`, target: a.id, approved_by_msg_id: waMessageId, result: blocked ? "blocked:open_charge" : `not_claimed:${fresh?.status ?? "?"}` });
    await reply(ctx, user, from, blocked ? billCopy["bill.charge_in_progress"]() : billCopy["bill.approval_used"]());
    return;
  }
  await executeApproval(ctx, user, from, claimed, waMessageId);
}

// ---------------------------------------------------------------------------------------------
// execution (after a successful claim — status processing)
// ---------------------------------------------------------------------------------------------

async function finish(ctx: BillingContext, a: BillingApprovalRow, patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error">>): Promise<void> {
  await ctx.db.updateBillingApproval(a.id, patch, ["processing"]);
}

async function executeApproval(ctx: BillingContext, user: UserRow, to: string, a: BillingApprovalRow, waMessageId: string): Promise<void> {
  const now = ctx.now();
  const st = stateOf(await ctx.db.getSubscription(user.id), now);
  const sub = st.sub;
  const audit = (result: string, action = `billing.approve.${a.kind}`) => ctx.db.addAudit({ user_id: user.id, action, target: a.id, approved_by_msg_id: waMessageId, result });
  const stale = async (why: string) => {
    await finish(ctx, a, { status: "failed", error: `stale: ${why}` });
    await audit(`stale:${why}`);
    await reply(ctx, user, to, billCopy["bill.offer_stale"]());
  };
  const periodEnd = sub?.next_charge_at ? dayLabel(sub.next_charge_at) : "סוף התקופה";

  if (a.kind === "cancel") {
    if (!sub || !st.paid || st.cancelled) return stale("not cancellable");
    await ctx.db.cancelSubscription(user.id);
    if (sub.scheduled_plan) await ctx.db.upsertSubscription(user.id, { scheduled_plan: null });
    await ctx.db.cancelJobs(user.id, "charge");
    await finish(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.cancel");
    await reply(ctx, user, to, copy["bill.cancelled"](st.periodOver ? dayLabel(now) : periodEnd));
    return;
  }
  if (a.kind === "downgrade") {
    if (!sub || sub.plan !== "pro" || st.cancelled) return stale("not a pro plan");
    await ctx.db.upsertSubscription(user.id, { scheduled_plan: "basic" });
    await finish(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.downgrade_scheduled");
    await reply(ctx, user, to, billCopy["bill.downgrade_scheduled"](periodEnd));
    return;
  }
  if (a.kind === "resume") {
    if (!sub || !st.cancelled || st.periodOver) return stale("not resumable");
    await ctx.db.upsertSubscription(user.id, { status: "active", cancelled_at: null });
    const run = nextChargeRun(sub, now);
    if (run) await scheduleCharge(ctx.db, user.id, run, "resume");
    await finish(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.resume");
    await reply(ctx, user, to, billCopy["bill.resumed"]({ periodEnd, amount: formatIls(PLANS[renewalPlan(sub) ?? "basic"].priceIls) }));
    return;
  }

  // ---- charges: upgrade / retry / renew ----
  const staleReason =
    a.kind === "upgrade"
      ? !sub || sub.plan !== "basic" || sub.status !== "active" || sub.cancelled_at || sub.charge_failures > 0
        ? "not an active basic plan"
        : null
      : a.kind === "retry"
        ? !st.inGrace && !st.paused
          ? "nothing overdue"
          : null
        : !st.paused && !(st.cancelled && st.periodOver)
          ? "nothing to renew"
          : null;
  if (staleReason || !sub) return stale(staleReason ?? "no subscription");

  const card = await savedCard(ctx, user.id);
  if (!card || card.expired) {
    await finish(ctx, a, { status: "failed", error: card ? "card expired" : "no card" });
    await audit(card ? "failed:card_expired" : "failed:no_card");
    if (card) await reply(ctx, user, to, billCopy["bill.card_expired"](card.last4), billButtons.card);
    else await reply(ctx, user, to, billCopy["bill.no_saved_card"](payLinkFor(ctx.appUrl, user.id)));
    return;
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
      await finish(ctx, a, { status: "failed", error: e.message.slice(0, 300) });
      await audit("failed:preflight");
      console.error(`[billing] ${a.kind} ${a.id}: HYP preflight failed:`, e.message);
      await reply(ctx, user, to, billCopy["bill.charge_failed_config"]());
      return;
    }
    // No answer from HYP: the charge may or may not exist. "unknown" blocks every further charge of this user until
    // reconciled in the HYP portal (Order / Info = approval id) — never risk a double charge.
    await finish(ctx, a, { status: "unknown", error: (e as Error).message.slice(0, 300) });
    await audit("unknown");
    console.error(`[billing] ${a.kind} ${a.id}: no answer from HYP — reconcile manually:`, (e as Error).message);
    await reply(ctx, user, to, billCopy["bill.charge_unknown"]());
    return;
  }

  if (result.transId) {
    await ctx.db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: a.amount_ils, ccode: result.ok ? "0" : result.ccode || "?", acode: result.acode, invoice_url: null, raw: result.response, approval_id: a.id });
  }

  if (!result.ok || !result.transId) {
    const ccode = result.ccode || "?";
    const fk = classifyHypFailure(ccode);
    await finish(ctx, a, { status: "failed", ccode, hyp_trans_id: result.transId });
    await audit(`failed:${ccode}:${fk}`);
    if (fk === "card") {
      await reply(ctx, user, to, billCopy["bill.charge_failed_card"](ccode), billButtons.card);
    } else if (fk === "config") {
      console.error(`[billing] HYP configuration error ${ccode} on ${a.kind} — see docs/hyp-setup.md`);
      await reply(ctx, user, to, billCopy["bill.charge_failed_config"]());
    } else {
      // a fresh approval (new 10 minutes, re-quoted) behind [ניסיון חוזר]
      const fresh = await ctx.db.getSubscription(user.id);
      const q = quoteFor(a.kind as OfferKind, stateOf(fresh, ctx.now()), ctx.now(), card.last4);
      const again = q ? await createApproval(ctx, user, to, a.kind as OfferKind, q.plan, q.amountIls, q.details) : null;
      const amount = formatIls(q?.amountIls ?? a.amount_ils);
      const text = fk === "temporary" ? billCopy["bill.charge_failed_temporary"](amount) : billCopy["bill.charge_failed_declined"]({ code: ccode, amount });
      await reply(ctx, user, to, text, again ? billButtons.retryOrCard(again.id) : billButtons.card);
    }
    return;
  }

  // ---- success ----
  await finish(ctx, a, { status: "succeeded", hyp_trans_id: result.transId, ccode: "0" });
  const amount = formatIls(a.amount_ils);
  let nextChargeAt: Date;
  if (a.kind === "upgrade") {
    nextChargeAt = new Date(sub.next_charge_at!);
    await ctx.db.upsertSubscription(user.id, { plan: "pro", scheduled_plan: null });
    await ctx.db.raiseUsageLimit(user.id, PLANS.pro.messages);
    await audit("ok", "subscription.upgrade");
    // the upgrade came from the 750 limit within the last day → the message that hit it was not handled
    const offerAt = typeof user.profile.limit_offer_at === "string" ? Date.parse(user.profile.limit_offer_at) : 0;
    const resendHint = now.getTime() - offerAt < 24 * 3_600_000 && typeof user.profile.pending_input === "string";
    if (resendHint) await ctx.db.mergeUserProfile(user.id, { pending_input: null, limit_offer_at: null });
    await reply(ctx, user, to, billCopy["bill.upgrade_done"]({ amount, nextAmount: formatIls(PLANS.pro.priceIls), nextDate: dayLabel(nextChargeAt), resendHint }));
  } else {
    // retry in grace → the cycle continues from its due date; paused / ended → a new month from today
    nextChargeAt = a.kind === "retry" && st.inGrace ? addOneMonth(new Date(sub.next_charge_at!)) : addOneMonth(now);
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
    await audit("ok", a.kind === "retry" ? "subscription.charge" : "subscription.renew");
    await reply(ctx, user, to, a.kind === "renew" ? billCopy["bill.renewed"]({ plan: PLANS[a.plan].nameHe, amount, nextDate: dayLabel(nextChargeAt) }) : billCopy["bill.charge_ok_resumed"]({ amount, nextDate: dayLabel(nextChargeAt) }));
  }
  await sendInvoice(ctx, user, { transId: result.transId, amountIls: a.amount_ils, date: now, plan: a.plan, nextChargeAt }, { phone: to, windowOpen: true });
}

// ---------------------------------------------------------------------------------------------
// commands, card link, invoices, status
// ---------------------------------------------------------------------------------------------

/** A fresh signed /pay/card/<token> link (7 days); opening it creates a new HYP J2 page. */
export async function sendCardLink(ctx: BillingContext, user: UserRow, to: string): Promise<void> {
  const st = stateOf(await ctx.db.getSubscription(user.id), ctx.now());
  if (!st.paid) {
    await reply(ctx, user, to, billCopy["bill.trial_pay_link"](payLinkFor(ctx.appUrl, user.id)));
    return;
  }
  await ctx.db.addAudit({ user_id: user.id, action: "billing.card_link", result: "sent" });
  await reply(ctx, user, to, billCopy["bill.card_update_link"](cardLinkFor(ctx.appUrl, user.id)));
}

/** "קבלה" (or "חשבונית") — the last three successful charges with their receipt links. */
export async function sendInvoiceList(ctx: BillingContext, user: UserRow, to: string): Promise<void> {
  const paid = (await ctx.db.listPayments(user.id, 30)).filter((p) => p.ccode === "0").slice(0, 3);
  if (!paid.length) {
    await reply(ctx, user, to, billCopy["bill.invoice_none"]());
    return;
  }
  const lines = [];
  for (const p of paid) {
    const approval = p.approval_id ? await ctx.db.getBillingApproval(p.approval_id) : null;
    const desc = typeof approval?.details.item === "string" ? approval.details.item : "מנוי";
    lines.push({ date: shortDateHe(p.created_at), amount: formatIls(Number(p.amount_ils)), desc, link: invoiceLinkFor(ctx.appUrl, user.id, p.hyp_trans_id) });
  }
  await reply(ctx, user, to, billCopy["bill.invoice_list"](lines));
}

async function sendStatus(ctx: BillingContext, user: UserRow, to: string): Promise<void> {
  const st = stateOf(await ctx.db.getSubscription(user.id), ctx.now());
  if (!st.paid || !st.sub) {
    await reply(ctx, user, to, billCopy["bill.trial_pay_link"](payLinkFor(ctx.appUrl, user.id)));
    return;
  }
  const plan = st.sub.plan as PaidPlan;
  const next = renewalPlan(st.sub) ?? plan;
  const usage = await ctx.db.getCurrentUsage(user.id);
  await reply(
    ctx,
    user,
    to,
    copy["bill.status"]({
      planName: PLANS[plan].nameHe,
      used: usage?.counted_messages ?? 0,
      limit: usage?.plan_limit ?? PLANS[plan].messages,
      nextCharge: st.cancelled ? "אין (המנוי מבוטל)" : st.sub.next_charge_at ? dayLabel(st.sub.next_charge_at) : "—",
      amount: formatIls(PLANS[next].priceIls),
    }),
  );
}

/** Billing commands typed in the chat. true = handled (nothing else should answer this message). */
export async function handleBillingCommand(ctx: BillingContext, user: UserRow, to: string, text: string): Promise<boolean> {
  const cmd = billingCommandOf(text);
  if (!cmd) return false;
  switch (cmd) {
    case "invoice":
      await sendInvoiceList(ctx, user, to);
      break;
    case "card":
      await sendCardLink(ctx, user, to);
      break;
    case "status":
      await sendStatus(ctx, user, to);
      break;
    case "refund":
      // Placeholder (docs/hyp-setup.md §refunds): refunds are handled manually by the operator.
      await ctx.db.addAudit({ user_id: user.id, action: "billing.refund_request", result: "manual" });
      await reply(ctx, user, to, billCopy["bill.refund_request"]());
      break;
    default:
      await presentOffer(ctx, user, to, cmd);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// gates used by the inbound pipeline
// ---------------------------------------------------------------------------------------------

const LIMIT_OFFER_EVERY_MS = 6 * 3_600_000;

/**
 * The basic plan's 750 messages are used up: the one-tap upgrade offer (prorated, VAT shown) instead of a web link.
 * Without a saved card → the previous message with the payment link. At most once per 6 hours; the message that hit
 * the limit is kept (pending_input) and the upgrade reply says it can be sent again.
 */
export async function handlePlanLimit(ctx: BillingContext, user: UserRow, to: string, text: string): Promise<void> {
  const now = ctx.now();
  const last = typeof user.profile.limit_offer_at === "string" ? Date.parse(user.profile.limit_offer_at) : 0;
  if (now.getTime() - last < LIMIT_OFFER_EVERY_MS) return;
  await ctx.db.mergeUserProfile(user.id, { limit_offer_at: now.toISOString(), pending_input: text });
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = `${reset.getUTCDate()}.${reset.getUTCMonth() + 1}`;
  const card = await savedCard(ctx, user.id);
  const sub = await ctx.db.getSubscription(user.id);
  const quotable = card && !card.expired && sub && quoteFor("upgrade", stateOf(sub, now), now, card.last4);
  if (!quotable) {
    await reply(ctx, user, to, copy["bill.plan_limit_reached"](resetDate, payLinkFor(ctx.appUrl, user.id)));
    return;
  }
  await presentOffer(ctx, user, to, "upgrade", { lead: billCopy["bill.limit_lead"](resetDate) });
}

/** A message while the account is paused (past_due): one tap to settle, at most once per 24 hours. */
export async function handlePaused(ctx: BillingContext, user: UserRow, to: string, text: string): Promise<void> {
  const now = ctx.now();
  const last = typeof user.profile.past_due_notified_at === "string" ? Date.parse(user.profile.past_due_notified_at) : 0;
  if (now.getTime() - last <= 24 * 3_600_000) return;
  await ctx.db.mergeUserProfile(user.id, { past_due_notified_at: now.toISOString(), pending_input: text });
  const approval = await createRetryApproval(ctx, user, to);
  if (approval) {
    const offer = billCopy["bill.retry_offer"]({ amount: formatIls(approval.amount_ils), vat: formatIls(vatOf(approval.amount_ils)), last4: String(approval.details.last4 ?? "") });
    await reply(ctx, user, to, `${billCopy["bill.paused_reply"]()}\n\n${offer}`, billButtons.retryOrCard(approval.id));
    return;
  }
  const card = await savedCard(ctx, user.id);
  if (card?.expired) await reply(ctx, user, to, billCopy["bill.paused_reply"](), billButtons.card);
  else await reply(ctx, user, to, copy["bill.past_due_blocked_reply"](payLinkFor(ctx.appUrl, user.id)));
}
