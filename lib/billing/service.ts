import type { Db, UserRow } from "@/lib/db/types";
import type { HypGateway } from "@/lib/hyp/client";
import type { WaSender } from "@/lib/wa/sender";
import { copy } from "@/lib/copy/bot";
import { payLinkFor } from "./pay-link";
import { PLANS, isPaidPlan, type PaidPlan } from "./plans";
import { activateSubscription, chargeSubscription, type ChargeOutcome } from "./subscription";

export interface BillingContext {
  db: Db;
  hyp: HypGateway;
  wa: WaSender;
  appUrl: string;
  now: () => Date;
}

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
    heshDesc: `[0~מנוי ${PLANS[plan].nameHe} — חודש~1~${price}]`,
    Pritim: true,
  });
}

export type PaymentReturn =
  | { ok: true; userId: string; plan: PaidPlan; transId: string; firstTime: boolean }
  | { ok: false; reason: "invalid_signature" | "declined" | "bad_order" | "no_user" | "token_failed"; userId?: string; message: string };

/**
 * The HYP success/error redirect (PLAN §4): VERIFY the whole query → parse Order → getToken → activate → notify in WhatsApp.
 * Idempotent: the same redirect twice activates once (payments.hyp_trans_id unique).
 */
export async function completePayment(ctx: BillingContext, redirectQuery: string): Promise<PaymentReturn> {
  const params = Object.fromEntries(new URLSearchParams(redirectQuery));
  const orderMatch = (params.Order ?? "").match(/^([0-9a-f-]{36}):(basic|pro)$/);
  if (!orderMatch) return { ok: false, reason: "bad_order", message: "ההפניה מ-HYP לא כוללת מזהה הזמנה תקין." };
  const userId = orderMatch[1]!;
  const plan = orderMatch[2] as PaidPlan;
  const user = await ctx.db.getUser(userId);
  if (!user) return { ok: false, reason: "no_user", userId, message: "החשבון לא נמצא." };

  const verified = await ctx.hyp.verifyRedirect(redirectQuery);
  if (!verified.ok) {
    const declined = params.CCode && params.CCode !== "0";
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
  const { firstTime } = await activateSubscription(ctx.db, user, { plan, transId, amountIls: Number(params.Amount ?? PLANS[plan].priceIls), acode: params.ACode ?? null, token: token.token, tokef: token.tokef, invoiceUrl, raw: params }, ctx.now());

  const pendingInput = typeof user.profile.pending_input === "string" ? user.profile.pending_input : null;
  const text = pendingInput ? copy["bill.payment_success"](PLANS[plan].nameHe, "חשבונית נשלחה למייל.") : copy["bill.payment_success_no_pending"](PLANS[plan].nameHe, "חשבונית נשלחה למייל.");
  await notify(ctx, user, text, { name: "payment_success", params: [PLANS[plan].nameHe, String(PLANS[plan].priceIls), "בעוד חודש"] });
  return { ok: true, userId, plan, transId, firstTime };
}

/** The monthly charge job for one user, with the WhatsApp messages of PLAN §4 (days 1/3/5). */
export async function runChargeJob(ctx: BillingContext, userId: string): Promise<ChargeOutcome> {
  const user = await ctx.db.getUser(userId);
  if (!user) return { kind: "skipped", reason: "no user" };
  const outcome = await chargeSubscription(ctx.db, ctx.hyp, user, ctx.now());
  const updateLink = payLinkFor(ctx.appUrl, user.id);
  if (outcome.kind === "retry") {
    const text = outcome.failures === 1 ? copy["bill.past_due_day1"](String(outcome.amountIls), updateLink) : copy["bill.past_due_day3"](updateLink);
    await notify(ctx, user, text, { name: "payment_failed", params: [String(outcome.amountIls), formatDateHe(outcome.retryAt)], link: updateLink });
  } else if (outcome.kind === "past_due") {
    await notify(ctx, user, copy["bill.past_due_day5"](updateLink), { name: "payment_failed", params: [String(outcome.amountIls), "אחרי עדכון הכרטיס"], link: updateLink });
  }
  return outcome;
}

/** Monthly limit reached on the basic plan (PLAN §4) — rendered by the inbound pipeline. */
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
 * Sends to the user's linked WhatsApp number: free text inside the 24-hour window (last inbound message),
 * otherwise the approved UTILITY template (docs/copy/wa-templates.md). Never throws.
 */
async function notify(ctx: BillingContext, user: UserRow, text: string, template: { name: string; params: string[]; link?: string }): Promise<void> {
  try {
    const phone = (await ctx.db.listWaIdentities(user.id)).find((w) => w.status === "active")?.phone_e164;
    if (!phone) return;
    const recent = await ctx.db.recentMessages(user.id, 20);
    const lastInbound = [...recent].reverse().find((m) => m.direction === "in");
    const windowOpen = lastInbound ? ctx.now().getTime() - Date.parse(lastInbound.created_at) < 24 * 3_600_000 : false;
    if (windowOpen) {
      await ctx.wa.sendText(phone, text);
    } else {
      const buttons = template.link ? [{ index: 0, subType: "url" as const, text: template.link.split("/").pop() ?? "" }] : [];
      await ctx.wa.sendTemplate(phone, template.name, template.params.map((t) => ({ type: "text" as const, text: t })), buttons);
    }
    await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: windowOpen ? "text" : "template", text });
  } catch (e) {
    console.error("[billing] notify failed:", (e as Error).message);
  }
}
