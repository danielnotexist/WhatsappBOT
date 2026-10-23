/**
 * WhatsApp-native billing on top of HYP (owner decision 21.10.2026): one-tap upgrade / retry / renew with the saved
 * card token, invoices in chat, cancel and downgrade with confirmation.
 *
 * HARD RULE — never charge without an explicit button approval:
 *   an offer (amount shown, VAT included) creates a `billing_approvals` row bound to the linked number it was sent to;
 *   only a press of [approve] from that same number, by the account's owner, within 10 minutes (DB CHECK), claims it
 *   atomically (pending → processing). One approval → at most one HYP charge (claim + payments unique index), and
 *   never two open charges per user (unique index, shared with the monthly renewal). An expired press gets a fresh
 *   offer, not a charge. The amount charged is the amount that was shown, and only for the billing cycle it was priced
 *   for (a renewal in between makes the offer stale). The subscription is updated before the approval leaves
 *   `processing`, so the per-user charge lock is held until the new state is visible to the next charge.
 */
import { copy } from "@/lib/copy/bot";
import { OFFER_LABELS, billButtons, billCopy } from "@/lib/copy/bot-billing";
import type { BillingApprovalRow, UserRow } from "@/lib/db/types";
import { dayLabelHe, localDateOf } from "@/lib/time/zoned";
import type { ReplyButton } from "@/lib/wa/types";
import type { BillingContext } from "./context";
import { billingCommandOf } from "./commands";
import { cardLinkFor, invoiceLinkFor } from "./links";
import { formatIls, vatOf } from "./money";
import { activePhone, sendInvoice, shortDateHe } from "./notify";
import { executeClaimedCharge, finishApproval, quoteFor, savedCard, stateOf, type OfferKind, type Quote, type SavedCard } from "./one-tap";
import { payLinkFor } from "./pay-link";
import { PLANS, type PaidPlan } from "./plans";
import { nextChargeRun, renewalPlan, scheduleCharge } from "./subscription";

export type { OfferKind } from "./one-tap";

/** "יום ו׳ 20.11" (Israel time) */
export const dayLabel = (d: Date | string) => dayLabelHe(localDateOf(new Date(d)));

/** Reply inside the open window (the user just wrote or pressed) and store the outbound row. */
async function reply(ctx: BillingContext, user: UserRow, to: string, text: string, buttons?: ReplyButton[]): Promise<void> {
  if (buttons?.length) await ctx.wa.sendButtons(to, text, buttons);
  else await ctx.wa.sendText(to, text);
  await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: buttons?.length ? "button" : "text", text });
}

// ---------------------------------------------------------------------------------------------
// quotes and approvals
// ---------------------------------------------------------------------------------------------

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
          // staying on pro changes the next charge (299 instead of 99) — only from a press, like every change
          const a = await createApproval(ctx, user, to, "keep_pro", "pro", 0, { period_end: sub.next_charge_at });
          await reply(ctx, user, to, billCopy["bill.keep_pro_confirm"]({ periodEnd, amount: formatIls(PLANS.pro.priceIls) }), billButtons.offer(a.id, OFFER_LABELS.keep_pro.yes, OFFER_LABELS.keep_pro.no));
          return a;
        }
        await reply(ctx, user, to, billCopy["bill.already_pro"]());
        return null;
      }
      break;
    }
    case "keep_pro":
      return presentOffer(ctx, user, to, "upgrade", opts);
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
    else await reply(ctx, user, from, kind === "cancel" ? copy["bill.cancel_kept"]() : kind === "downgrade" ? billCopy["bill.downgrade_kept"]() : kind === "keep_pro" ? billCopy["bill.keep_pro_declined"]() : billCopy["bill.offer_declined"]());
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

async function executeApproval(ctx: BillingContext, user: UserRow, to: string, a: BillingApprovalRow, waMessageId: string): Promise<void> {
  const now = ctx.now();
  const st = stateOf(await ctx.db.getSubscription(user.id), now);
  const sub = st.sub;
  const audit = (result: string, action = `billing.approve.${a.kind}`) => ctx.db.addAudit({ user_id: user.id, action, target: a.id, approved_by_msg_id: waMessageId, result });
  const stale = async (why: string) => {
    await finishApproval(ctx, a, { status: "failed", error: `stale: ${why}` });
    await audit(`stale:${why}`);
    await reply(ctx, user, to, billCopy["bill.offer_stale"]());
  };
  const periodEnd = sub?.next_charge_at ? dayLabel(sub.next_charge_at) : "סוף התקופה";

  if (a.kind === "cancel") {
    if (!sub || !st.paid || st.cancelled) return stale("not cancellable");
    await ctx.db.cancelSubscription(user.id);
    if (sub.scheduled_plan) await ctx.db.upsertSubscription(user.id, { scheduled_plan: null });
    await ctx.db.cancelJobs(user.id, "charge");
    await finishApproval(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.cancel");
    await reply(ctx, user, to, copy["bill.cancelled"](st.periodOver ? dayLabel(now) : periodEnd));
    return;
  }
  if (a.kind === "downgrade") {
    if (!sub || sub.plan !== "pro" || st.cancelled) return stale("not a pro plan");
    await ctx.db.upsertSubscription(user.id, { scheduled_plan: "basic" });
    await finishApproval(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.downgrade_scheduled");
    await reply(ctx, user, to, billCopy["bill.downgrade_scheduled"](periodEnd));
    return;
  }
  if (a.kind === "keep_pro") {
    if (!sub || sub.plan !== "pro" || sub.scheduled_plan !== "basic" || st.cancelled) return stale("no downgrade scheduled");
    await ctx.db.upsertSubscription(user.id, { scheduled_plan: null });
    await finishApproval(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.downgrade_cleared");
    await reply(ctx, user, to, billCopy["bill.downgrade_cleared"]());
    return;
  }
  if (a.kind === "resume") {
    if (!sub || !st.cancelled || st.periodOver) return stale("not resumable");
    await ctx.db.upsertSubscription(user.id, { status: "active", cancelled_at: null });
    const run = nextChargeRun(sub, now);
    // a key of its own per resume: cancel → resume → cancel → resume in one cycle must still leave a queued job
    if (run) await scheduleCharge(ctx.db, user.id, run, `resume:${a.id}`);
    await finishApproval(ctx, a, { status: "succeeded" });
    await audit("ok", "subscription.resume");
    await reply(ctx, user, to, billCopy["bill.resumed"]({ periodEnd, amount: formatIls(PLANS[renewalPlan(sub) ?? "basic"].priceIls) }));
    return;
  }

  // ---- charges: upgrade / retry / renew — the shared charge code (lib/billing/one-tap.ts), then the chat reply ----
  const out = await executeClaimedCharge(ctx, user, a, waMessageId);
  switch (out.kind) {
    case "stale":
      await reply(ctx, user, to, billCopy["bill.offer_stale"]());
      return;
    case "no_card":
      await reply(ctx, user, to, billCopy["bill.no_saved_card"](payLinkFor(ctx.appUrl, user.id)));
      return;
    case "card_expired":
      await reply(ctx, user, to, billCopy["bill.card_expired"](out.last4), billButtons.card);
      return;
    case "preflight":
      await reply(ctx, user, to, billCopy["bill.charge_failed_config"]());
      return;
    case "unknown":
      await reply(ctx, user, to, billCopy["bill.charge_unknown"]());
      return;
    case "failed": {
      if (out.failure === "card") {
        await reply(ctx, user, to, billCopy["bill.charge_failed_card"](out.ccode), billButtons.card);
      } else if (out.failure === "config") {
        await reply(ctx, user, to, billCopy["bill.charge_failed_config"]());
      } else {
        // a fresh approval (new 10 minutes, re-quoted) behind [ניסיון חוזר]
        const fresh = await ctx.db.getSubscription(user.id);
        const q = quoteFor(a.kind as OfferKind, stateOf(fresh, ctx.now()), ctx.now(), out.last4);
        const again = q ? await createApproval(ctx, user, to, a.kind as OfferKind, q.plan, q.amountIls, q.details) : null;
        const amount = formatIls(q?.amountIls ?? a.amount_ils);
        const text = out.failure === "temporary" ? billCopy["bill.charge_failed_temporary"](amount) : billCopy["bill.charge_failed_declined"]({ code: out.ccode, amount });
        await reply(ctx, user, to, text, again ? billButtons.retryOrCard(again.id) : billButtons.card);
      }
      return;
    }
    case "charged": {
      const amount = formatIls(out.amountIls);
      const nextDate = dayLabel(out.nextChargeAt);
      const text =
        a.kind === "upgrade"
          ? billCopy["bill.upgrade_done"]({ amount, nextAmount: formatIls(PLANS.pro.priceIls), nextDate, resendHint: out.resendHint })
          : a.kind === "renew"
            ? billCopy["bill.renewed"]({ plan: PLANS[a.plan].nameHe, amount, nextDate })
            : billCopy["bill.charge_ok_resumed"]({ amount, nextDate });
      await reply(ctx, user, to, text);
      await sendInvoice(ctx, user, { transId: out.transId, amountIls: out.amountIls, date: now, plan: out.plan, nextChargeAt: out.nextChargeAt }, { phone: to, windowOpen: true });
      return;
    }
  }
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
    case "refund": {
      // Refunds are manual (docs/hyp-setup.md §8): the request is recorded and the operator is alerted (the error log),
      // who answers by email — the reply promises nothing more than that.
      const lastCharge = (await ctx.db.listPayments(user.id, 30)).find((p) => p.ccode === "0");
      await ctx.db.addAudit({ user_id: user.id, action: "billing.refund_request", target: lastCharge?.hyp_trans_id ?? null, result: "manual" });
      console.error(`[billing] refund request from user ${user.id} (last charge: ${lastCharge?.hyp_trans_id ?? "none"}) — handle it in the HYP portal and answer by email (docs/hyp-setup.md §8)`);
      await reply(ctx, user, to, billCopy["bill.refund_request"]());
      break;
    }
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
 * The basic plan's 750 messages are used up. Every message gets an answer: the one-tap upgrade offer (prorated, VAT
 * shown) at most once per 6 hours and a one-line note in between (no new approval); without a usable card (or while
 * the cycle is being renewed) the message with the payment link, as before. The latest message that hit the limit is
 * kept (pending_input), and the upgrade reply says it can be sent again.
 */
export async function handlePlanLimit(ctx: BillingContext, user: UserRow, to: string, text: string): Promise<void> {
  const now = ctx.now();
  await ctx.db.mergeUserProfile(user.id, { pending_input: text });
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const resetDate = `${reset.getUTCDate()}.${reset.getUTCMonth() + 1}`;
  const card = await savedCard(ctx, user.id);
  const sub = await ctx.db.getSubscription(user.id);
  const quotable = card && !card.expired && sub && quoteFor("upgrade", stateOf(sub, now), now, card.last4);
  if (!quotable) {
    await reply(ctx, user, to, copy["bill.plan_limit_reached"](resetDate, payLinkFor(ctx.appUrl, user.id)));
    return;
  }
  const last = typeof user.profile.limit_offer_at === "string" ? Date.parse(user.profile.limit_offer_at) : 0;
  if (now.getTime() - last < LIMIT_OFFER_EVERY_MS) {
    await reply(ctx, user, to, billCopy["bill.limit_reminder"](resetDate));
    return;
  }
  const offer = await presentOffer(ctx, user, to, "upgrade", { lead: billCopy["bill.limit_lead"](resetDate) });
  // only once the offer went out: a failed send leaves the next message to try again
  if (offer) await ctx.db.mergeUserProfile(user.id, { limit_offer_at: now.toISOString() });
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
