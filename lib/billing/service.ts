import { copy } from "@/lib/copy/bot";
import { billButtons, billCopy } from "@/lib/copy/bot-billing";
import type { UserRow } from "@/lib/db/types";
import { tokenLast4 } from "@/lib/hyp/codes";
import { formatHeshDesc } from "@/lib/hyp/sign";
import { accountPausedTemplate, cardUpdateNeededTemplate, paymentFailedTemplate } from "@/lib/wa/templates";
import type { BillingContext } from "./context";
import { cardLinkFor, createCardLinkToken } from "./links";
import { formatIls, vatOf } from "./money";
import { activePhone, deliver, isWindowOpen, sendInvoice } from "./notify";
import { payLinkFor } from "./pay-link";
import { PLANS, isPaidPlan, type PaidPlan } from "./plans";
import { activateSubscription, chargeSubscription, nextChargeRun, resumeAfterCardUpdate, saveCardToken, type ChargeOutcome } from "./subscription";
import { createRetryApproval, dayLabel } from "./whatsapp";

export type { BillingContext } from "./context";

/** Builds the HYP payment page for a user + plan (PLAN §4 SIGN params). `Order` carries user id + plan back to us. */
export async function startPayment(ctx: BillingContext, user: UserRow, plan: PaidPlan): Promise<string> {
  const price = PLANS[plan].priceIls;
  const [first, ...rest] = (user.name ?? "").trim().split(/\s+/);
  return ctx.hyp.createPaymentPage({
    Amount: price,
    Coin: 1,
    Order: `${user.id}:${plan}`,
    Info: `מנוי ${PLANS[plan].nameHe} — חודש ראשון`,
    Sign: true,
    MoreData: true,
    SendHesh: true,
    UTF8: true,
    UTF8out: true,
    PageLang: "HEB",
    email: user.email,
    ClientName: first || undefined,
    ClientLName: rest.join(" ") || undefined,
    heshDesc: formatHeshDesc([{ description: `מנוי ${PLANS[plan].nameHe} — חודש`, quantity: 1, price }]),
    Pritim: true,
  });
}

/**
 * The card-update page (from the [עדכון כרטיס] link): HYP J2 = card verification without a charge (success CCode=600),
 * `Order = <user>:card`; the redirect replaces the saved token (getToken with allowFalse=True). No invoice.
 */
export async function startCardUpdate(ctx: BillingContext, user: UserRow): Promise<string> {
  const [first, ...rest] = (user.name ?? "").trim().split(/\s+/);
  return ctx.hyp.createPaymentPage({
    Amount: 1,
    Coin: 1,
    J5: "J2",
    Order: `${user.id}:card`,
    Info: "עדכון כרטיס — אימות בלבד, ללא חיוב",
    Sign: true,
    MoreData: true,
    SendHesh: false,
    Tash: 1,
    UTF8: true,
    UTF8out: true,
    PageLang: "HEB",
    email: user.email,
    ClientName: first || undefined,
    ClientLName: rest.join(" ") || undefined,
  });
}

export type PaymentReturn =
  | { ok: true; userId: string; plan: PaidPlan; transId: string; firstTime: boolean; mode: "payment" | "card" }
  | { ok: false; reason: "invalid_signature" | "declined" | "bad_order" | "no_user" | "token_failed" | "no_subscription" | "charged_not_checked"; userId?: string; message: string; mode?: "payment" | "card" };

/**
 * The HYP success/error redirect (PLAN §4): VERIFY the whole query → parse Order → getToken → activate → notify in WhatsApp.
 * Idempotent: the same redirect twice activates once (payments.hyp_trans_id unique).
 */
export async function completePayment(ctx: BillingContext, redirectQuery: string): Promise<PaymentReturn> {
  const params = Object.fromEntries(new URLSearchParams(redirectQuery));
  const orderMatch = (params.Order ?? "").match(/^([0-9a-f-]{36}):(basic|pro|card)$/);
  if (!orderMatch) return { ok: false, reason: "bad_order", message: "ההפניה מ-HYP לא כוללת מזהה הזמנה תקין." };
  const userId = orderMatch[1]!;
  const user = await ctx.db.getUser(userId);
  if (!user) return { ok: false, reason: "no_user", userId, message: "החשבון לא נמצא." };
  if (orderMatch[2] === "card") return completeCardUpdate(ctx, user, redirectQuery, params);
  const plan = orderMatch[2] as PaidPlan;

  const verified = await ctx.hyp.verifyRedirect(redirectQuery);
  if (!verified.ok || params.CCode !== "0") {
    const declined = verified.ok || (params.CCode && params.CCode !== "0");
    const payLink = payLinkFor(ctx.appUrl, user.id);
    if (declined) await notify(ctx, user, copy["bill.payment_failed_initial"](payLink), { name: "trial_ended_payment", params: [user.name ?? ""], link: payLink });
    await ctx.db.addAudit({ user_id: user.id, action: "payment.return", target: params.Id ?? "", result: declined ? `declined:${params.CCode}` : "invalid_signature" });
    return declined
      ? { ok: false, reason: "declined", userId, message: "התשלום לא עבר. אפשר לנסות שוב, גם עם כרטיס אחר." }
      : { ok: false, reason: "invalid_signature", userId, message: "אימות התשלום נכשל. אם חויבת — נבדוק ונחזור אלייך." };
  }

  const transId = params.Id ?? "";
  let token: { token: string; tokef: string };
  try {
    token = await ctx.hyp.getToken(transId);
  } catch (e) {
    await ctx.db.addAudit({ user_id: user.id, action: "payment.token", target: transId, result: `failed: ${(e as Error).message}` });
    return { ok: false, reason: "token_failed", userId, message: "התשלום התקבל אבל שמירת אמצעי התשלום לחיובים הבאים נכשלה. נטפל בזה ידנית." };
  }
  const invoiceUrl = await ctx.hyp.invoiceUrl(transId).catch(() => null);
  const amountIls = Number(params.Amount ?? PLANS[plan].priceIls);
  const { firstTime, subscription, duplicate } = await activateSubscription(ctx.db, user, { plan, transId, amountIls, acode: params.ACode ?? null, token: token.token, tokef: token.tokef, invoiceUrl, raw: params }, ctx.now());
  if (duplicate) return { ok: true, userId, plan, transId, firstTime, mode: "payment" }; // already handled (and announced)

  const pendingInput = typeof user.profile.pending_input === "string" ? user.profile.pending_input : null;
  const text = pendingInput ? copy["bill.payment_success"](PLANS[plan].nameHe, "הקבלה נשלחה למייל.") : copy["bill.payment_success_no_pending"](PLANS[plan].nameHe, "הקבלה נשלחה למייל.");
  const where = await notify(ctx, user, text, { name: "payment_success", params: [PLANS[plan].nameHe, String(PLANS[plan].priceIls), "בעוד חודש"] });
  // the receipt in chat (inside the window: a document; the template above already says it was emailed)
  if (where?.windowOpen) await sendInvoice(ctx, user, { transId, amountIls, date: ctx.now(), plan, nextChargeAt: subscription.next_charge_at ? new Date(subscription.next_charge_at) : undefined }, where);
  return { ok: true, userId, plan, transId, firstTime, mode: "payment" };
}

/**
 * Card update (J2): VERIFY → CCode 600 → getToken(allowFalse) → replace the token. Never charges: when a renewal is
 * overdue, WhatsApp gets the one-tap retry offer (amount + [חיוב עכשיו] in the window; outside it the payment_failed /
 * account_paused template with [ניסיון חוזר]) — the charge needs the press. A renewal that was waiting for a card
 * update (a "card" failure) goes back to automatic attempts on the next attempt day, with the new card.
 */
async function completeCardUpdate(ctx: BillingContext, user: UserRow, redirectQuery: string, params: Record<string, string>): Promise<PaymentReturn> {
  const sub = await ctx.db.getSubscription(user.id);
  if (!sub || !isPaidPlan(sub.plan)) return { ok: false, reason: "no_subscription", userId: user.id, message: "אין מנוי פעיל לעדכון כרטיס.", mode: "card" };
  const verified = await ctx.hyp.verifyRedirect(redirectQuery);
  const transId = params.Id ?? "";
  if (verified.ok && params.CCode === "0") {
    // The page is a J2 check (success = 600). CCode 0 is a real 1 ₪ charge: the terminal is not set up for J2. Nothing
    // is saved; the operator refunds it by hand (no payments row and no receipt exist for it).
    console.error(`[billing] card update ${transId} of user ${user.id} returned CCode 0 — a real 1 ₪ charge, not a J2 check. Refund it in the HYP portal and enable J2 on the terminal (docs/hyp-setup.md §1, §8)`);
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: "charged_not_checked" });
    await deliver(ctx, user, { text: billCopy["bill.card_update_charged"]() });
    return { ok: false, reason: "charged_not_checked", userId: user.id, message: "הכרטיס לא עודכן בגלל תקלה בהגדרות התשלום אצלנו. אם הופיע חיוב של 1 ₪ — הוא יבוטל.", mode: "card" };
  }
  if (!verified.ok || params.CCode !== "600") {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: verified.ok ? `declined:${params.CCode}` : "invalid_signature" });
    await deliver(ctx, user, { text: billCopy["bill.card_update_failed"](cardLinkFor(ctx.appUrl, user.id)) });
    return verified.ok
      ? { ok: false, reason: "declined", userId: user.id, message: "הכרטיס לא אומת. אפשר לנסות שוב, גם עם כרטיס אחר.", mode: "card" }
      : { ok: false, reason: "invalid_signature", userId: user.id, message: "אימות הכרטיס נכשל. הכרטיס הקודם נשאר.", mode: "card" };
  }
  let token: { token: string; tokef: string };
  try {
    token = await ctx.hyp.getToken(transId, { allowFalse: true });
  } catch (e) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: `token_failed: ${(e as Error).message}` });
    return { ok: false, reason: "token_failed", userId: user.id, message: "הכרטיס אומת אבל שמירתו נכשלה. הכרטיס הקודם נשאר — נטפל בזה.", mode: "card" };
  }
  await saveCardToken(ctx.db, user.id, token.token, token.tokef);
  // a renewal that waited for a new card: automatic attempts resume (otherwise day 7 would pause without trying it)
  const resumedAt = await resumeAfterCardUpdate(ctx.db, user.id, ctx.now());
  await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: resumedAt ? `ok:next_attempt=${resumedAt.toISOString()}` : "ok" });

  const text = billCopy["bill.card_updated"](tokenLast4(token.token) ?? "????");
  const fresh = (await ctx.db.getSubscription(user.id)) ?? sub;
  const overdue = fresh.status === "past_due" || (fresh.status === "active" && !fresh.cancelled_at && fresh.charge_failures > 0);
  const phone = overdue ? await activePhone(ctx, user.id) : null;
  const approval = phone ? await createRetryApproval(ctx, user, phone) : null;
  if (approval) {
    const windowOpen = await isWindowOpen(ctx, user.id);
    const amount = formatIls(approval.amount_ils);
    const offer = billCopy["bill.retry_offer"]({ amount, vat: formatIls(vatOf(approval.amount_ils)), last4: String(approval.details.last4 ?? "") });
    const cardToken = createCardLinkToken(user.id);
    const nextTry = nextChargeRun(fresh, ctx.now());
    // outside the window the user (who just left the HYP page) still gets [ניסיון חוזר]: the matching template
    const template =
      fresh.status === "past_due" || !nextTry
        ? accountPausedTemplate({ amount, approvalId: approval.id, cardToken })
        : paymentFailedTemplate({ amount, nextTry: dayLabel(nextTry), approvalId: approval.id, cardToken });
    await deliver(ctx, user, { text: `${text}\n\n${offer}`, buttons: billButtons.offer(approval.id, "חיוב עכשיו"), template }, { phone: phone!, windowOpen });
  } else {
    await deliver(ctx, user, { text });
  }
  return { ok: true, userId: user.id, plan: sub.plan as PaidPlan, transId, firstTime: false, mode: "card" };
}

/**
 * The monthly charge job for one user, with the WhatsApp messages (owner decision 21.10.2026): the receipt after a
 * successful charge; nudges with [ניסיון חוזר] [עדכון כרטיס] after the day 1 / 3 / 5 failures; a card-update request
 * after a "card" failure; the pause notice after day 7. Outside the 24-hour window → the matching template.
 */
export async function runChargeJob(ctx: BillingContext, userId: string): Promise<ChargeOutcome> {
  const user = await ctx.db.getUser(userId);
  if (!user) return { kind: "skipped", reason: "no user" };
  const outcome = await chargeSubscription(ctx.db, ctx.hyp, user, ctx.now());
  const cardToken = () => createCardLinkToken(user.id);

  if (outcome.kind === "charged") {
    const where = await deliver(ctx, user, { text: billCopy["bill.renewal_charged"]({ plan: PLANS[outcome.plan].nameHe, amount: formatIls(outcome.amountIls), nextDate: dayLabel(outcome.nextChargeAt) }) });
    // in the window: the text above + the document; outside: the payment_receipt template (link behind a button)
    await sendInvoice(ctx, user, { transId: outcome.transId, amountIls: outcome.amountIls, date: ctx.now(), plan: outcome.plan, nextChargeAt: outcome.nextChargeAt }, where ?? undefined);
  } else if (outcome.kind === "retry") {
    const amount = formatIls(outcome.amountIls);
    const nextTry = dayLabel(outcome.retryAt);
    const text =
      outcome.failures === 1
        ? billCopy["bill.renewal_failed_day1"]({ amount, nextTry })
        : outcome.failures === 2
          ? billCopy["bill.renewal_failed_day3"]({ amount, nextTry })
          : billCopy["bill.renewal_failed_day5"]({ amount, lastTry: nextTry });
    await nudge(ctx, user, text, (approvalId) => paymentFailedTemplate({ amount, nextTry, approvalId, cardToken: cardToken() }));
  } else if (outcome.kind === "card_invalid") {
    const amount = formatIls(outcome.amountIls);
    const until = dayLabel(outcome.pauseAt);
    await deliver(ctx, user, { text: billCopy["bill.renewal_card_invalid"]({ amount, until, code: outcome.ccode }), buttons: billButtons.card, template: cardUpdateNeededTemplate({ amount, until, cardToken: cardToken() }) });
  } else if (outcome.kind === "paused") {
    const amount = formatIls(outcome.amountIls);
    await nudge(ctx, user, billCopy["bill.renewal_paused"](amount), (approvalId) => accountPausedTemplate({ amount, approvalId, cardToken: cardToken() }));
  }
  return outcome;
}

/** A renewal nudge: a fresh 10-minute retry approval behind [ניסיון חוזר] (in-window button or template quick reply). */
async function nudge(ctx: BillingContext, user: UserRow, text: string, template: (approvalId: string | null) => ReturnType<typeof paymentFailedTemplate>): Promise<void> {
  const phone = await activePhone(ctx, user.id);
  if (!phone) return;
  const windowOpen = await isWindowOpen(ctx, user.id);
  const approval = await createRetryApproval(ctx, user, phone);
  await deliver(ctx, user, { text, buttons: approval ? billButtons.retryOrCard(approval.id) : billButtons.card, template: template(approval?.id ?? null) }, { phone, windowOpen });
}

/** Monthly limit reached on the basic plan (PLAN §4) — the text version (the pipeline sends the one-tap offer). */
export function planLimitMessage(ctx: BillingContext, user: UserRow, plan: string): string {
  const now = ctx.now();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (!isPaidPlan(plan)) return copy["bill.trial_ended"](user.name, payLinkFor(ctx.appUrl, user.id));
  return copy["bill.plan_limit_reached"](formatDateHe(reset), payLinkFor(ctx.appUrl, user.id));
}

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export function formatDateHe(d: Date): string {
  return `יום ${DAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

/**
 * Text inside the 24-hour window, otherwise the approved UTILITY template (docs/copy/wa-templates.md). Never throws.
 * `link` — a /pay/<token> URL whose token becomes the template's URL-button suffix.
 */
async function notify(ctx: BillingContext, user: UserRow, text: string, template: { name: string; params: string[]; link?: string }) {
  const buttons = template.link ? [{ index: 0, subType: "url" as const, text: template.link.split("/").pop() ?? "" }] : [];
  return deliver(ctx, user, { text, template: { name: template.name, params: template.params, buttons } });
}
