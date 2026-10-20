import { decryptToken, encryptToken } from "@/lib/crypto";
import type { Db, SubscriptionRow, UserRow } from "@/lib/db/types";
import type { HypGateway } from "@/lib/hyp/client";
import { CHARGE_RETRY_DAYS, MAX_CHARGE_FAILURES, PLANS, addOneMonth, isPaidPlan, type PaidPlan } from "./plans";

/**
 * Subscription state machine (PLAN §4):
 *   trial ──pay──▶ active ──charge ok──▶ active (next month)
 *   active ──charge fails──▶ active (retry day 1,3) ──3rd failure──▶ past_due ──pay/charge ok──▶ active
 *   active/past_due ──cancel──▶ cancelled (until next_charge_at) ──period ends──▶ trial plan (user_plan())
 */

const aad = (userId: string) => `${userId}:hyp`;

export interface ActivationInput {
  plan: PaidPlan;
  transId: string;
  amountIls: number;
  acode: string | null;
  token: string;
  tokef: string;
  invoiceUrl: string | null;
  raw: Record<string, unknown>;
}

/** After a verified first payment: store the encrypted token, activate, schedule the monthly charge job. */
export async function activateSubscription(db: Db, user: UserRow, input: ActivationInput, now: Date = new Date()): Promise<{ subscription: SubscriptionRow; firstTime: boolean }> {
  const payment = await db.insertPayment({ user_id: user.id, hyp_trans_id: input.transId, amount_ils: input.amountIls, ccode: "0", acode: input.acode, invoice_url: input.invoiceUrl, raw: input.raw });
  const previous = await db.getSubscription(user.id);
  const nextChargeAt = addOneMonth(now);
  const subscription = await db.upsertSubscription(user.id, {
    plan: input.plan,
    status: "active",
    started_at: previous?.started_at ?? now.toISOString(),
    next_charge_at: nextChargeAt.toISOString(),
    cancelled_at: null,
    charge_failures: 0,
    hyp_tokef: input.tokef,
    hyp_token_enc: encryptToken(input.token, { aad: aad(user.id) }),
  });
  await scheduleCharge(db, user.id, nextChargeAt);
  await db.addAudit({ user_id: user.id, action: "subscription.activate", target: input.plan, result: payment ? "ok" : "duplicate_payment" });
  return { subscription, firstTime: !previous || previous.status === "trial" };
}

export async function scheduleCharge(db: Db, userId: string, runAt: Date): Promise<void> {
  await db.cancelJobs(userId, "charge");
  await db.createJob({ kind: "charge", user_id: userId, run_at: runAt, payload: {}, dedupe_key: `charge:${userId}:${runAt.toISOString().slice(0, 10)}`, max_attempts: 1 });
}

export type ChargeOutcome =
  | { kind: "charged"; transId: string; amountIls: number; nextChargeAt: Date; invoiceUrl: string | null }
  | { kind: "retry"; failures: number; retryAt: Date; amountIls: number }
  | { kind: "past_due"; failures: number; amountIls: number }
  | { kind: "skipped"; reason: string };

/** One monthly charge for one user. Idempotent per due date through the payments unique key + job dedupe. */
export async function chargeSubscription(db: Db, hyp: HypGateway, user: UserRow, now: Date = new Date()): Promise<ChargeOutcome> {
  const sub = await db.getSubscription(user.id);
  if (!sub || !isPaidPlan(sub.plan) || !(sub.status === "active" || sub.status === "past_due")) return { kind: "skipped", reason: "not billable" };
  if (sub.cancelled_at) return { kind: "skipped", reason: "cancelled" };
  if (!sub.next_charge_at || Date.parse(sub.next_charge_at) > now.getTime() + 60_000) return { kind: "skipped", reason: "not due" };
  const secret = await db.getSubscriptionSecret(user.id);
  if (!secret?.hyp_token_enc || !secret.hyp_tokef) return { kind: "skipped", reason: "no token" };

  const amountIls = PLANS[sub.plan].priceIls;
  const dueDay = sub.next_charge_at.slice(0, 10);
  const token = decryptToken(secret.hyp_token_enc, { aad: aad(user.id) });
  const result = await hyp.chargeToken({ amount: amountIls, token, tokef: secret.hyp_tokef, email: user.email, clientName: user.name ?? undefined, info: `${PLANS[sub.plan].nameHe} — ${dueDay}`, order: `${user.id}:${sub.plan}:${dueDay}` });

  if (result.ok && result.transId) {
    const invoiceUrl = await hyp.invoiceUrl(result.transId).catch(() => null);
    await db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: amountIls, ccode: "0", acode: result.acode, invoice_url: invoiceUrl, raw: result.response });
    const nextChargeAt = addOneMonth(new Date(sub.next_charge_at));
    await db.upsertSubscription(user.id, { status: "active", next_charge_at: nextChargeAt.toISOString(), charge_failures: 0 });
    await scheduleCharge(db, user.id, nextChargeAt);
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId, result: "ok" });
    return { kind: "charged", transId: result.transId, amountIls, nextChargeAt, invoiceUrl };
  }

  const failures = sub.charge_failures + 1;
  if (result.transId) await db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: amountIls, ccode: result.ccode || "?", acode: null, invoice_url: null, raw: result.response });
  await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId ?? "", result: `failed:${result.ccode}` });
  if (failures >= MAX_CHARGE_FAILURES) {
    await db.upsertSubscription(user.id, { status: "past_due", charge_failures: failures });
    return { kind: "past_due", failures, amountIls };
  }
  const dueDate = new Date(sub.next_charge_at);
  const retryAt = new Date(dueDate.getTime() + CHARGE_RETRY_DAYS[failures]! * 86_400_000);
  await db.upsertSubscription(user.id, { charge_failures: failures });
  await scheduleCharge(db, user.id, retryAt);
  return { kind: "retry", failures, retryAt, amountIls };
}
