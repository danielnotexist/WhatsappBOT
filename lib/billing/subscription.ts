import { decryptToken, encryptToken } from "@/lib/crypto";
import type { Db, SubscriptionRow, UserRow } from "@/lib/db/types";
import type { HypGateway } from "@/lib/hyp/client";
import { classifyHypFailure } from "@/lib/hyp/codes";
import { HypPreflightError } from "@/lib/hyp/sign";
import { localDateOf } from "@/lib/time/zoned";
import { MAX_CHARGE_FAILURES, PAUSE_DAY, PLANS, addOneMonth, chargeAttemptAt, isPaidPlan, type PaidPlan } from "./plans";

/**
 * Subscription state machine (PLAN §4, docs/progress/hyp.md):
 *   trial ──pay (web)──▶ active ──charge ok──▶ active (next month)
 *   active ──charge fails day 1──▶ active, nudge ──day 3 / 5 fail──▶ active, nudge ──day 7 fail──▶ past_due (paused)
 *   active ──"card" failure──▶ active (no automatic retry) ──day 7──▶ past_due
 *   active / past_due ──[ניסיון חוזר] / card update + charge / web payment──▶ active
 *   active ──cancel──▶ cancelled (until next_charge_at) ──period ends──▶ trial plan (user_plan())
 *   pro ──downgrade──▶ scheduled_plan = basic ──next charge──▶ basic
 */

const DAY_MS = 86_400_000;
export const cardAad = (userId: string) => `${userId}:hyp`;

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
export async function activateSubscription(db: Db, user: UserRow, input: ActivationInput, now: Date = new Date()): Promise<{ subscription: SubscriptionRow; firstTime: boolean; duplicate: boolean }> {
  const payment = await db.insertPayment({ user_id: user.id, hyp_trans_id: input.transId, amount_ils: input.amountIls, ccode: "0", acode: input.acode, invoice_url: input.invoiceUrl, raw: input.raw });
  const previous = await db.getSubscription(user.id);
  // the same redirect twice (a refresh / back button): already activated for this transaction — change nothing
  if (!payment && previous && previous.status !== "trial") return { subscription: previous, firstTime: false, duplicate: true };
  const nextChargeAt = addOneMonth(now);
  const subscription = await db.upsertSubscription(user.id, {
    plan: input.plan,
    status: "active",
    started_at: previous?.started_at ?? now.toISOString(),
    next_charge_at: nextChargeAt.toISOString(),
    cancelled_at: null,
    charge_failures: 0,
    scheduled_plan: null,
    hyp_tokef: input.tokef,
    hyp_token_enc: encryptToken(input.token, { aad: cardAad(user.id) }),
  });
  await scheduleCharge(db, user.id, nextChargeAt);
  await db.addAudit({ user_id: user.id, action: "subscription.activate", target: input.plan, result: payment ? "ok" : "duplicate_payment" });
  return { subscription, firstTime: !previous || previous.status === "trial", duplicate: !payment };
}

/** Replaces the saved card (HYP J2 card check → getToken). The plan, dates and failure count stay as they are. */
export async function saveCardToken(db: Db, userId: string, token: string, tokef: string): Promise<void> {
  await db.upsertSubscription(userId, { hyp_tokef: tokef, hyp_token_enc: encryptToken(token, { aad: cardAad(userId) }) });
}

/** The saved card, decrypted (server only). null when there is none. */
export async function loadCardToken(db: Db, userId: string): Promise<{ token: string; tokef: string } | null> {
  const secret = await db.getSubscriptionSecret(userId);
  if (!secret?.hyp_token_enc || !secret.hyp_tokef) return null;
  return { token: decryptToken(secret.hyp_token_enc, { aad: cardAad(userId) }), tokef: secret.hyp_tokef };
}

/**
 * One queued `charge` job per user (older ones are cancelled). The plain key is per due date; a `tag` makes a
 * distinct key (retry after "busy", resume after cancel…), since jobs.dedupe_key is unique across every status.
 */
export async function scheduleCharge(db: Db, userId: string, runAt: Date, tag?: string): Promise<void> {
  await db.cancelJobs(userId, "charge");
  const key = tag ? `charge:${userId}:${runAt.toISOString().slice(0, 16)}:${tag}` : `charge:${userId}:${runAt.toISOString().slice(0, 10)}`;
  await db.createJob({ kind: "charge", user_id: userId, run_at: runAt, payload: tag ? { tag } : {}, dedupe_key: key, max_attempts: 1 });
}

/** When the next charge job of this subscription should run (used when a cancelled subscription is resumed). */
export function nextChargeRun(sub: Pick<SubscriptionRow, "next_charge_at" | "charge_failures">, now: Date): Date | null {
  if (!sub.next_charge_at) return null;
  const due = new Date(sub.next_charge_at);
  const at = sub.charge_failures <= 0 ? due : chargeAttemptAt(due, sub.charge_failures);
  return at.getTime() < now.getTime() ? new Date(now.getTime() + 60_000) : at;
}

/** The plan the next monthly charge is for: a scheduled downgrade takes effect at that charge. */
export function renewalPlan(sub: Pick<SubscriptionRow, "plan" | "scheduled_plan">): PaidPlan | null {
  const p = sub.scheduled_plan ?? sub.plan;
  return isPaidPlan(p) ? p : null;
}

const dm = (d: Date) => {
  const l = localDateOf(d);
  return `${l.day}.${l.month}.${l.year}`;
};

/** The invoice line of a monthly charge: "מנוי פרו — 20.11.2026–20.12.2026". */
export function renewalItem(plan: PaidPlan, from: Date, to: Date): string {
  return `מנוי ${PLANS[plan].nameHe} — ${dm(from)}–${dm(to)}`;
}

export type ChargeOutcome =
  | { kind: "charged"; transId: string; amountIls: number; plan: PaidPlan; nextChargeAt: Date; invoiceUrl: string | null }
  | { kind: "retry"; failures: number; retryAt: Date; amountIls: number; ccode: string }
  | { kind: "card_invalid"; amountIls: number; pauseAt: Date; ccode: string }
  | { kind: "paused"; failures: number; amountIls: number }
  | { kind: "config_error"; ccode: string; retryAt: Date }
  | { kind: "skipped"; reason: string };

/**
 * One monthly charge attempt for one user (the `charge` job). Idempotent per due date through the payments unique key
 * and the job dedupe; never concurrent with a WhatsApp one-tap charge of the same user (the `renewal` lock row).
 */
export async function chargeSubscription(db: Db, hyp: HypGateway, user: UserRow, now: Date = new Date()): Promise<ChargeOutcome> {
  const sub = await db.getSubscription(user.id);
  if (!sub || !isPaidPlan(sub.plan) || !(sub.status === "active" || sub.status === "past_due")) return { kind: "skipped", reason: "not billable" };
  if (sub.cancelled_at) return { kind: "skipped", reason: "cancelled" };
  if (sub.status === "past_due") return { kind: "skipped", reason: "paused" };
  if (!sub.next_charge_at || Date.parse(sub.next_charge_at) > now.getTime() + 60_000) return { kind: "skipped", reason: "not due" };
  const plan = renewalPlan(sub)!;
  const amountIls = PLANS[plan].priceIls;
  const due = new Date(sub.next_charge_at);
  const pauseAt = chargeAttemptAt(due, MAX_CHARGE_FAILURES - 1);

  // Waiting for a card update after a "card" failure (or the job of the last day): pause on day 7.
  if (sub.charge_failures >= MAX_CHARGE_FAILURES) {
    if (now.getTime() + 60_000 < pauseAt.getTime()) return { kind: "skipped", reason: "waiting for a card update" };
    return pause(db, user.id, sub.charge_failures, amountIls);
  }

  const card = await loadCardToken(db, user.id);
  if (!card) return { kind: "skipped", reason: "no token" };

  const lock = await db.openRenewalCharge({ user_id: user.id, plan, amount_ils: amountIls, details: { due: sub.next_charge_at, attempt: sub.charge_failures + 1 } });
  if (!lock) {
    // a one-tap charge from WhatsApp is in flight (or its outcome is unknown) — never charge in parallel
    await scheduleCharge(db, user.id, new Date(now.getTime() + 15 * 60_000), "busy");
    return { kind: "skipped", reason: "another charge is open" };
  }

  const nextChargeAt = addOneMonth(due);
  const [first, ...rest] = (user.name ?? "").trim().split(/\s+/);
  let result;
  try {
    result = await hyp.chargeToken({
      amount: amountIls,
      token: card.token,
      tokef: card.tokef,
      email: user.email,
      clientName: first || undefined,
      clientLName: rest.join(" ") || undefined,
      info: `renewal:${lock.id}`,
      order: lock.id,
      items: [{ description: renewalItem(plan, due, nextChargeAt), quantity: 1, price: amountIls }],
    });
  } catch (e) {
    if (e instanceof HypPreflightError) {
      // nothing was sent (gateway not configured / invalid request): release the lock, the job reports the error
      await db.updateBillingApproval(lock.id, { status: "failed", error: e.message.slice(0, 300) }, ["processing"]);
      throw e;
    }
    // No answer: the charge may or may not have happened. The lock stays "unknown" and blocks every further charge
    // of this user until someone reconciles it in the HYP portal (Order = lock id) — docs/hyp-setup.md.
    await db.updateBillingApproval(lock.id, { status: "unknown", error: (e as Error).message.slice(0, 300) }, ["processing"]);
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: lock.id, result: "unknown" });
    throw e;
  }

  if (result.transId) {
    await db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: amountIls, ccode: result.ok ? "0" : result.ccode || "?", acode: result.acode, invoice_url: null, raw: result.response, approval_id: lock.id });
  }
  await db.updateBillingApproval(lock.id, { status: result.ok ? "succeeded" : "failed", hyp_trans_id: result.transId, ccode: result.ccode || null }, ["processing"]);

  if (result.ok && result.transId) {
    const invoiceUrl = await hyp.invoiceUrl(result.transId).catch(() => null);
    await db.upsertSubscription(user.id, { status: "active", plan, scheduled_plan: null, next_charge_at: nextChargeAt.toISOString(), charge_failures: 0 });
    await scheduleCharge(db, user.id, nextChargeAt);
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId, result: plan === sub.plan ? "ok" : `ok:plan=${plan}` });
    return { kind: "charged", transId: result.transId, amountIls, plan, nextChargeAt, invoiceUrl };
  }

  const ccode = result.ccode || "?";
  const failureKind = classifyHypFailure(ccode);
  await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId ?? lock.id, result: `failed:${ccode}:${failureKind}` });

  if (failureKind === "config") {
    // our terminal / request is wrong (901 tokens off, 902 PassP, 400 items…): not the customer's failure
    console.error(`[billing] HYP configuration error ${ccode} on a monthly charge — see docs/hyp-setup.md`);
    const retryAt = new Date(now.getTime() + DAY_MS);
    await scheduleCharge(db, user.id, retryAt, "config");
    return { kind: "config_error", ccode, retryAt };
  }
  if (failureKind === "card") {
    if (now.getTime() + 60_000 >= pauseAt.getTime()) return pause(db, user.id, MAX_CHARGE_FAILURES, amountIls);
    await db.upsertSubscription(user.id, { charge_failures: MAX_CHARGE_FAILURES });
    await scheduleCharge(db, user.id, pauseAt, "pause");
    return { kind: "card_invalid", amountIls, pauseAt, ccode };
  }
  const failures = sub.charge_failures + 1;
  if (failures >= MAX_CHARGE_FAILURES) return pause(db, user.id, failures, amountIls);
  let retryAt = chargeAttemptAt(due, failures);
  if (retryAt.getTime() <= now.getTime()) retryAt = new Date(now.getTime() + 3_600_000); // the job ran late
  await db.upsertSubscription(user.id, { charge_failures: failures });
  await scheduleCharge(db, user.id, retryAt);
  return { kind: "retry", failures, retryAt, amountIls, ccode };
}

async function pause(db: Db, userId: string, failures: number, amountIls: number): Promise<ChargeOutcome> {
  await db.upsertSubscription(userId, { status: "past_due", charge_failures: failures });
  await db.cancelJobs(userId, "charge");
  await db.addAudit({ user_id: userId, action: "subscription.pause", result: `after day ${PAUSE_DAY}` });
  return { kind: "paused", failures, amountIls };
}
