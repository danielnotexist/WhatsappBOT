import { ownerAlert } from "@/lib/admin/alerts";
import { reportError } from "@/lib/errors/report";
import { copy } from "@/lib/copy/bot";
import { chargeReason } from "@/lib/copy/owner-alerts";
import { billButtons, billCopy, renewalWhatHe } from "@/lib/copy/bot-billing";
import type { UserRow } from "@/lib/db/types";
import { classifyHypFailure, tokenLast4 } from "@/lib/hyp/codes";
import { formatHeshDesc } from "@/lib/hyp/sign";
import { announceCredit, announceReward, rewardReferralAfterFirstPayment } from "@/lib/referrals/service";
import { accountPausedTemplate, cardUpdateNeededTemplate, paymentFailedTemplate, paymentSuccessTemplate, templateParam } from "@/lib/wa/templates";
import type { BillingContext } from "./context";
import { cardLinkFor, createCardLinkToken } from "./links";
import { formatIls, vatOf } from "./money";
import { activePhone, deliver, isWindowOpen, sendInvoice, shortDateHe } from "./notify";
import { payLinkFor } from "./pay-link";
import { PLANS, cycleOf, isBillingCycle, isPaidPlan, planNameHe, priceOf, renewalCycleOf, type BillingCycle, type PaidPlan } from "./plans";
import { activateSubscription, applyPendingCredit, chargeSubscription, loadCardToken, nextChargeRun, resumeAfterCardUpdate, saveCardToken, type ChargeOutcome } from "./subscription";
import { createRetryApproval, dayLabel } from "./whatsapp";

export type { BillingContext } from "./context";

/**
 * The HYP `Order` of a first payment: `<user>:<plan>` (monthly, as before 0018) or `<user>:<plan>:annual`. The
 * redirect carries it back signed (VERIFY), so the cycle cannot be changed on the way.
 */
export function paymentOrder(userId: string, plan: PaidPlan, cycle: BillingCycle): string {
  return cycle === "annual" ? `${userId}:${plan}:annual` : `${userId}:${plan}`;
}

/** Builds the HYP payment page for a user + plan + cycle (PLAN §4 SIGN params). `Order` carries user id + plan (+ cycle) back to us. */
export async function startPayment(ctx: BillingContext, user: UserRow, plan: PaidPlan, cycle: BillingCycle = "monthly"): Promise<string> {
  const price = priceOf(plan, cycle);
  const annual = cycle === "annual";
  const [first, ...rest] = (user.name ?? "").trim().split(/\s+/);
  return ctx.hyp.createPaymentPage({
    Amount: price,
    Coin: 1,
    Order: paymentOrder(user.id, plan, cycle),
    Info: annual ? `מנוי ${planNameHe(plan, "annual")} — שנה ראשונה` : `מנוי ${PLANS[plan].nameHe} — חודש ראשון`,
    Sign: true,
    MoreData: true,
    SendHesh: true,
    UTF8: true,
    UTF8out: true,
    PageLang: "HEB",
    email: user.email,
    ClientName: first || undefined,
    ClientLName: rest.join(" ") || undefined,
    heshDesc: formatHeshDesc([{ description: annual ? `מנוי ${planNameHe(plan, "annual")} — שנה` : `מנוי ${PLANS[plan].nameHe} — חודש`, quantity: 1, price }]),
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
  | { ok: true; userId: string; plan: PaidPlan; cycle?: BillingCycle; transId: string; firstTime: boolean; mode: "payment" | "card" }
  | { ok: false; reason: "invalid_signature" | "declined" | "bad_order" | "no_user" | "token_failed" | "no_subscription" | "charged_not_checked" | "amount_mismatch"; userId?: string; message: string; mode?: "payment" | "card" };

const INVALID_SIGNATURE: PaymentReturn = { ok: false, reason: "invalid_signature", message: "אימות התשלום נכשל. אם חויבת - נבדוק ונחזור אלייך." };

/**
 * The HYP success/error redirect (PLAN §4): parse Order → VERIFY the whole query → (CCode 0) check the amount against
 * the plan and cycle of the Order → getToken → activate → notify in WhatsApp. Nothing is sent, written or alerted for
 * a redirect HYP did not sign: the query is the attacker's until VERIFY says otherwise (and its Amount is never
 * echoed — alerts carry our own price). Idempotent: the same redirect twice activates once (payments.hyp_trans_id
 * unique); a repeat after a failed getToken saves the card then.
 */
export async function completePayment(ctx: BillingContext, redirectQuery: string): Promise<PaymentReturn> {
  const params = Object.fromEntries(new URLSearchParams(redirectQuery));
  const orderMatch = (params.Order ?? "").match(/^([0-9a-f-]{36}):(basic|pro|card)(?::(monthly|annual))?$/);
  if (!orderMatch) return { ok: false, reason: "bad_order", message: "ההפניה מ-HYP לא כוללת מזהה הזמנה תקין." };
  const userId = orderMatch[1]!;
  if (orderMatch[2] === "card" && orderMatch[3]) return { ok: false, reason: "bad_order", userId, message: "ההפניה מ-HYP לא כוללת מזהה הזמנה תקין.", mode: "card" };

  // VERIFY first: before the account is even looked up, and before any message, audit row or alert
  const verified = await ctx.hyp.verifyRedirect(redirectQuery);
  if (!verified.ok) {
    console.warn(`[billing] /api/pay/return: an unsigned redirect for Order ${orderMatch[2]} was refused`);
    return orderMatch[2] === "card" ? { ok: false, reason: "invalid_signature", message: "אימות הכרטיס נכשל. הכרטיס הקודם נשאר.", mode: "card" } : INVALID_SIGNATURE;
  }

  const user = await ctx.db.getUser(userId);
  if (!user) {
    // signed by HYP for an account that is gone (deleted between the page and the payment): a real charge nobody serves
    if (orderMatch[2] !== "card" && params.CCode === "0") {
      const plan = orderMatch[2] as PaidPlan;
      const cycle: BillingCycle = isBillingCycle(orderMatch[3]) ? orderMatch[3] : "monthly";
      console.error(`[billing] payment ${params.Id ?? "?"} for a missing account ${userId} — refund it in the HYP portal`);
      ownerAlert({ type: "charge_unknown", userId, amountIls: priceOf(plan, cycle), reason: "תשלום ראשון עבר בדף התשלום, אבל החשבון לא נמצא. צריך לבדוק בפורטל HYP ולהחזיר.", ref: `first:${params.Id ?? userId}` }, { db: ctx.db });
      await reportError("billing.return", new Error(`a verified payment ${params.Id ?? "?"} for a missing account`), { db: ctx.db, context: { transId: params.Id ?? "", stage: "no_user" } });
    }
    return { ok: false, reason: "no_user", userId, message: "החשבון לא נמצא." };
  }
  if (orderMatch[2] === "card") return completeCardUpdate(ctx, user, params);
  const plan = orderMatch[2] as PaidPlan;
  const requestedCycle: BillingCycle = isBillingCycle(orderMatch[3]) ? orderMatch[3] : "monthly";

  if (params.CCode !== "0") {
    // a decline HYP signed: the result page says so; the chat gets the retry link, the owner our price (never the query's)
    const payLink = payLinkFor(ctx.appUrl, user.id);
    await notify(ctx, user, copy["bill.payment_failed_initial"](payLink), { name: "trial_ended_payment", params: [templateParam((user.name ?? "").trim() || "לך", 60)], link: payLink });
    await ctx.db.addAudit({ user_id: user.id, action: "payment.return", target: params.Id ?? "", result: `declined:${params.CCode ?? ""}` });
    ownerAlert({ type: "payment_failed", userId: user.id, email: user.email, name: user.name, amountIls: priceOf(plan, requestedCycle), reason: chargeReason(`תשלום ראשון בדף התשלום (${planNameHe(plan, requestedCycle)})`, classifyHypFailure(params.CCode ?? ""), params.CCode || null), ref: `first:${params.Id || `${user.id}:${ctx.now().getTime()}`}` }, { db: ctx.db });
    return { ok: false, reason: "declined", userId, message: "התשלום לא עבר. אפשר לנסות שוב, גם עם כרטיס אחר." };
  }

  const transId = params.Id ?? "";
  // the amount HYP signed must pay for the plan and cycle of the Order — for every plan and cycle. HYP signs the amount
  // into the page at SIGN, so a mismatch means a bug on our side: an annual Order paid at least the monthly price is
  // activated monthly (as before); anything less activates nothing and goes to the owner.
  const amountIls = Number(params.Amount);
  const covers = (c: BillingCycle) => Number.isFinite(amountIls) && amountIls + 0.005 >= priceOf(plan, c);
  const cycle: BillingCycle | null = covers(requestedCycle) ? requestedCycle : requestedCycle === "annual" && covers("monthly") ? "monthly" : null;
  if (cycle !== requestedCycle) {
    console.error(`[billing] payment ${transId} of ${user.id}: Order ${plan}:${requestedCycle} but the amount is ${params.Amount ?? "missing"} — ${cycle ? `activated ${cycle}` : "not activated"}; check it in the HYP portal`);
    await ctx.db.addAudit({ user_id: user.id, action: "payment.amount_mismatch", target: transId, result: `${requestedCycle}:${Number.isFinite(amountIls) ? amountIls : "?"}` });
  }
  if (!cycle) {
    // the money was taken: record it (once — hyp_trans_id is unique), activate nothing, tell the owner
    await ctx.db.insertPayment({ user_id: user.id, hyp_trans_id: transId, amount_ils: Number.isFinite(amountIls) ? amountIls : 0, ccode: "0", acode: params.ACode ?? null, invoice_url: null, raw: params, billing_cycle: requestedCycle });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: priceOf(plan, requestedCycle), reason: `תשלום ראשון (${planNameHe(plan, requestedCycle)}) עבר בסכום נמוך מהמחיר, והמנוי לא הופעל. צריך לבדוק בפורטל HYP.`, ref: `first:${transId}` }, { db: ctx.db });
    return { ok: false, reason: "amount_mismatch", userId, message: "התשלום התקבל אבל הסכום לא תואם למסלול. נבדוק ונחזור אלייך." };
  }

  // the card for the next charges: a failure does not take away the period that was paid — it is activated anyway,
  // the owner is told (the renewal has no card until it is fixed), and a repeat of this redirect tries again
  let token: { token: string; tokef: string } | null = null;
  try {
    token = await ctx.hyp.getToken(transId);
  } catch (e) {
    await ctx.db.addAudit({ user_id: user.id, action: "payment.token", target: transId, result: `failed: ${(e as Error).message}` });
    await reportError("billing.return", e, { userId: user.id, db: ctx.db, context: { transId, stage: "get_token" } });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: priceOf(plan, cycle), reason: `תשלום ראשון (${planNameHe(plan, cycle)}) עבר והמנוי הופעל, אבל שמירת הכרטיס לחיובים הבאים נכשלה. החיוב הבא לא יתבצע עד שהכרטיס יעודכן.`, ref: `first-token:${transId}` }, { db: ctx.db });
  }
  const invoiceUrl = await ctx.hyp.invoiceUrl(transId).catch(() => null);
  const now = ctx.now();
  const { firstTime, subscription, duplicate, paymentId, overlapped } = await activateSubscription(ctx.db, user, { plan, cycle, transId, amountIls, acode: params.ACode ?? null, token: token?.token ?? null, tokef: token?.tokef ?? null, invoiceUrl, raw: params }, now);
  if (duplicate) {
    // already handled (and announced); a card that could not be saved the first time is saved now
    if (token && !(await loadCardToken(ctx.db, user.id))) await saveCardToken(ctx.db, user.id, token.token, token.tokef);
    return { ok: true, userId, plan, cycle: cycleOf(subscription), transId, firstTime, mode: "payment" };
  }
  if (overlapped) {
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: priceOf(plan, cycle), reason: `תשלום ראשון (${planNameHe(plan, cycle)}) עבר על מנוי שכבר היה משולם. התקופה הוארכה מסוף התקופה הקודמת; אם הלקוח לא התכוון - להחזיר בפורטל HYP.`, ref: `first-overlap:${transId}` }, { db: ctx.db });
  }

  // "חבר מביא חבר": the friend's first real payment rewards both sides (once — referral_reward() is atomic), and the
  // payer's own free months waiting for a paid subscription go onto it now
  const reward = firstTime ? await rewardReferralAfterFirstPayment(ctx, user, paymentId) : { kind: "none" as const };
  const credit = await applyPendingCredit(ctx.db, user.id, now);
  const fresh = (await ctx.db.getSubscription(user.id)) ?? subscription;
  const nextChargeAt = fresh.next_charge_at ? new Date(fresh.next_charge_at) : undefined;

  const pendingInput = typeof user.profile.pending_input === "string" ? user.profile.pending_input : null;
  const name = planNameHe(plan, cycle);
  const text = pendingInput ? copy["bill.payment_success"](name, "הקבלה נשלחה למייל.") : copy["bill.payment_success_no_pending"](name, "הקבלה נשלחה למייל.");
  const template = cycle === "annual" ? paymentSuccessTemplate({ plan: PLANS[plan].nameHe, amount: formatIls(priceOf(plan, cycle)), nextCharge: nextChargeAt ? shortDateHe(nextChargeAt) : "בעוד שנה", annual: true }) : { name: "payment_success", params: [PLANS[plan].nameHe, String(PLANS[plan].priceIls), "בעוד חודש"], buttons: [] };
  const where = await deliver(ctx, user, { text, template });
  // the receipt in chat (inside the window: a document; the template above already says it was emailed)
  if (where?.windowOpen) await sendInvoice(ctx, user, { transId, amountIls, date: now, plan, nextChargeAt, cycle }, where);
  await announceReward(ctx, user, reward);
  if (credit.nextChargeAt) await announceCredit(ctx, user, credit.nextChargeAt);
  return { ok: true, userId, plan, cycle, transId, firstTime, mode: "payment" };
}

/**
 * Card update (J2): VERIFY → CCode 600 → getToken(allowFalse) → replace the token. Never charges: when a renewal is
 * overdue, WhatsApp gets the one-tap retry offer (amount + [חיוב עכשיו] in the window; outside it the payment_failed /
 * account_paused template with [ניסיון חוזר]) — the charge needs the press. A renewal that was waiting for a card
 * update (a "card" failure) goes back to automatic attempts on the next attempt day, with the new card.
 */
async function completeCardUpdate(ctx: BillingContext, user: UserRow, params: Record<string, string>): Promise<PaymentReturn> {
  // the redirect was verified by completePayment (an unsigned one never gets here)
  const sub = await ctx.db.getSubscription(user.id);
  const transId = params.Id ?? "";
  if (params.CCode === "0") {
    // The page is a J2 check (success = 600). CCode 0 is a real 1 ₪ charge: the terminal is not set up for J2. Nothing
    // is saved; the operator refunds it by hand (no payments row and no receipt exist for it).
    console.error(`[billing] card update ${transId} of user ${user.id} returned CCode 0 — a real 1 ₪ charge, not a J2 check. Refund it in the HYP portal and enable J2 on the terminal (docs/hyp-setup.md §1, §8)`);
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: "charged_not_checked" });
    await deliver(ctx, user, { text: billCopy["bill.card_update_charged"]() });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls: 1, reason: "עדכון כרטיס חויב ב-1 ₪ במקום בדיקת J2. צריך להחזיר בפורטל HYP ולהפעיל J2 במסוף.", ref: `card:${transId}` }, { db: ctx.db });
    return { ok: false, reason: "charged_not_checked", userId: user.id, message: "הכרטיס לא עודכן בגלל תקלה בהגדרות התשלום אצלנו. אם הופיע חיוב של 1 ₪ - הוא יבוטל.", mode: "card" };
  }
  if (!sub || !isPaidPlan(sub.plan)) return { ok: false, reason: "no_subscription", userId: user.id, message: "אין מנוי פעיל לעדכון כרטיס.", mode: "card" };
  if (params.CCode !== "600") {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: `declined:${params.CCode ?? ""}` });
    await deliver(ctx, user, { text: billCopy["bill.card_update_failed"](cardLinkFor(ctx.appUrl, user.id)) });
    return { ok: false, reason: "declined", userId: user.id, message: "הכרטיס לא אומת. אפשר לנסות שוב, גם עם כרטיס אחר.", mode: "card" };
  }
  let token: { token: string; tokef: string };
  try {
    token = await ctx.hyp.getToken(transId, { allowFalse: true });
  } catch (e) {
    await ctx.db.addAudit({ user_id: user.id, action: "billing.card_update", target: transId, result: `token_failed: ${(e as Error).message}` });
    return { ok: false, reason: "token_failed", userId: user.id, message: "הכרטיס אומת אבל שמירתו נכשלה. הכרטיס הקודם נשאר - נטפל בזה.", mode: "card" };
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
    const annual = approval.billing_cycle === "annual";
    const offer = billCopy["bill.retry_offer"]({ amount, vat: formatIls(vatOf(approval.amount_ils)), last4: String(approval.details.last4 ?? ""), what: renewalWhatHe(annual) });
    const cardToken = createCardLinkToken(user.id);
    const nextTry = nextChargeRun(fresh, ctx.now());
    // outside the window the user (who just left the HYP page) still gets [ניסיון חוזר]: the matching template
    const template =
      fresh.status === "past_due" || !nextTry
        ? accountPausedTemplate({ amount, approvalId: approval.id, cardToken, annual })
        : paymentFailedTemplate({ amount, nextTry: dayLabel(nextTry), approvalId: approval.id, cardToken, annual });
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
  // the failures are of the renewal in force — its cycle names the charge ("החיוב השנתי") and picks the template
  const annual = outcome.kind === "charged" ? outcome.cycle === "annual" : outcome.kind === "skipped" ? false : renewalCycleOf(await ctx.db.getSubscription(user.id)) === "annual";
  const what = renewalWhatHe(annual);

  if (outcome.kind === "charged") {
    const where = await deliver(ctx, user, { text: billCopy["bill.renewal_charged"]({ plan: planNameHe(outcome.plan, outcome.cycle), amount: formatIls(outcome.amountIls), nextDate: dayLabel(outcome.nextChargeAt), what }) });
    // in the window: the text above + the document; outside: the payment_receipt template (link behind a button)
    await sendInvoice(ctx, user, { transId: outcome.transId, amountIls: outcome.amountIls, date: ctx.now(), plan: outcome.plan, nextChargeAt: outcome.nextChargeAt, cycle: outcome.cycle }, where ?? undefined);
  } else if (outcome.kind === "retry") {
    const amount = formatIls(outcome.amountIls);
    const nextTry = dayLabel(outcome.retryAt);
    const text =
      outcome.failures === 1
        ? billCopy["bill.renewal_failed_day1"]({ amount, nextTry, what })
        : outcome.failures === 2
          ? billCopy["bill.renewal_failed_day3"]({ amount, nextTry })
          : billCopy["bill.renewal_failed_day5"]({ amount, lastTry: nextTry });
    await nudge(ctx, user, text, (approvalId) => paymentFailedTemplate({ amount, nextTry, approvalId, cardToken: cardToken(), annual }));
  } else if (outcome.kind === "card_invalid") {
    const amount = formatIls(outcome.amountIls);
    const until = dayLabel(outcome.pauseAt);
    await deliver(ctx, user, { text: billCopy["bill.renewal_card_invalid"]({ amount, until, code: outcome.ccode, what }), buttons: billButtons.card, template: cardUpdateNeededTemplate({ amount, until, cardToken: cardToken(), annual }) });
  } else if (outcome.kind === "paused") {
    const amount = formatIls(outcome.amountIls);
    await nudge(ctx, user, billCopy["bill.renewal_paused"](amount, what), (approvalId) => accountPausedTemplate({ amount, approvalId, cardToken: cardToken(), annual }));
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
