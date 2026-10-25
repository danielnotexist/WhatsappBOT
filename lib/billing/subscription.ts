import { randomUUID } from "node:crypto";
import { ownerAlert } from "@/lib/admin/alerts";
import { trackServerEvent } from "@/lib/analytics/track";
import { chargeReason, renewalNext } from "@/lib/copy/owner-alerts";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { BillingApprovalRow, Db, SubscriptionRow, UserRow } from "@/lib/db/types";
import type { HypGateway } from "@/lib/hyp/client";
import { classifyHypFailure } from "@/lib/hyp/codes";
import { HypPreflightError } from "@/lib/hyp/sign";
import { REFERRAL_FREE_DAYS } from "@/lib/referrals/constants";
import { localDateOf } from "@/lib/time/zoned";
import { MAX_CHARGE_FAILURES, PAUSE_DAY, PLANS, addCycle, chargeAttemptAt, isPaidPlan, planNameHe, priceOf, renewalCycleOf, type BillingCycle, type PaidPlan } from "./plans";

/**
 * Subscription state machine (PLAN §4, docs/progress/hyp.md):
 *   trial ──pay (web)──▶ active ──charge ok──▶ active (next month, or next year on the annual cycle)
 *   active ──charge fails day 1──▶ active, nudge ──day 3 / 5 fail──▶ active, nudge ──day 7 fail──▶ past_due (paused)
 *   active ──"card" failure──▶ active (no automatic retry) ──day 7──▶ past_due
 *          └─card updated before day 7──▶ automatic attempts resume on the next attempt day (3 / 5 / 7)
 *   active / past_due ──[ניסיון חוזר] / card update + charge / web payment──▶ active
 *   active ──cancel──▶ cancelled (until next_charge_at) ──period ends──▶ trial plan (user_plan())
 *   pro ──downgrade──▶ scheduled_plan = basic ──next charge──▶ basic
 *   annual ──to monthly──▶ scheduled_cycle = monthly ──next charge──▶ monthly (no refund for the rest of the year)
 *   monthly ──to annual (the personal area)──▶ annual at once: a year from now, the unused month credited (one-tap.ts)
 * Both cycles renew the same way (one charge per period, the same retry days 1 / 3 / 5 / 7, the same pause); only
 * the period (a month / a year) and the price (lib/billing/plans.ts priceOf) differ.
 */

const DAY_MS = 86_400_000;
export const cardAad = (userId: string) => `${userId}:hyp`;

export interface ActivationInput {
  plan: PaidPlan;
  /** default monthly */
  cycle?: BillingCycle;
  transId: string;
  amountIls: number;
  acode: string | null;
  token: string;
  tokef: string;
  invoiceUrl: string | null;
  raw: Record<string, unknown>;
}

/** After a verified first payment: store the encrypted token, activate, schedule the charge job of the next period. */
export async function activateSubscription(
  db: Db,
  user: UserRow,
  input: ActivationInput,
  now: Date = new Date(),
): Promise<{ subscription: SubscriptionRow; firstTime: boolean; duplicate: boolean; paymentId: string | null }> {
  const cycle = input.cycle ?? "monthly";
  const payment = await db.insertPayment({ user_id: user.id, hyp_trans_id: input.transId, amount_ils: input.amountIls, ccode: "0", acode: input.acode, invoice_url: input.invoiceUrl, raw: input.raw, billing_cycle: cycle });
  const previous = await db.getSubscription(user.id);
  // the same redirect twice (a refresh / back button): already activated for this transaction — change nothing
  if (!payment && previous && previous.status !== "trial") return { subscription: previous, firstTime: false, duplicate: true, paymentId: null };
  const nextChargeAt = addCycle(now, cycle);
  const subscription = await db.upsertSubscription(user.id, {
    plan: input.plan,
    status: "active",
    started_at: previous?.started_at ?? now.toISOString(),
    next_charge_at: nextChargeAt.toISOString(),
    cancelled_at: null,
    charge_failures: 0,
    scheduled_plan: null,
    billing_cycle: cycle,
    scheduled_cycle: null,
    hyp_tokef: input.tokef,
    hyp_token_enc: encryptToken(input.token, { aad: cardAad(user.id) }),
  });
  await scheduleCharge(db, user.id, nextChargeAt);
  await db.addAudit({ user_id: user.id, action: "subscription.activate", target: cycle === "annual" ? `${input.plan}:annual` : input.plan, result: payment ? "ok" : "duplicate_payment" });
  const firstTime = !previous || previous.status === "trial";
  // the signup funnel's last step: the first real payment (lib/analytics), once per transaction
  if (payment && firstTime) trackServerEvent(db, "paid", user.id, now);
  return { subscription, firstTime, duplicate: !payment, paymentId: payment?.id ?? null };
}

/**
 * After a successful charge: the user's free months waiting in "חבר מביא חבר" (lib/referrals) go onto the subscription
 * now that it can take them (SQL referral_apply_credit — atomic), and the charge job moves with next_charge_at.
 * Never throws: a failure leaves the credit pending for the next charge. Returns the new next charge when it moved.
 */
export async function applyPendingCredit(db: Db, userId: string, now: Date): Promise<{ applied: number; nextChargeAt: Date | null }> {
  try {
    const r = await db.applyReferralCredit(userId, REFERRAL_FREE_DAYS);
    if (!r.applied || !r.nextChargeAt) return { applied: 0, nextChargeAt: null };
    const sub = await db.getSubscription(userId);
    if (sub?.status === "active") {
      const run = nextChargeRun(sub, now);
      if (run) await scheduleCharge(db, userId, run, `credit:${Date.parse(r.nextChargeAt)}`);
    }
    await db.addAudit({ user_id: userId, action: "referral.credit_applied", target: String(r.applied), result: `next=${r.nextChargeAt}` });
    return { applied: r.applied, nextChargeAt: new Date(r.nextChargeAt) };
  } catch (e) {
    console.error(`[billing] the referral credit of ${userId} was not applied:`, (e as Error).message);
    return { applied: 0, nextChargeAt: null };
  }
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
 * The queued job of the same key (if any) was just cancelled, so a key that was used before must never leave the
 * subscription without a job: it gets a unique suffix; if even that fails, this throws.
 */
export async function scheduleCharge(db: Db, userId: string, runAt: Date, tag?: string): Promise<void> {
  await db.cancelJobs(userId, "charge");
  const key = tag ? `charge:${userId}:${runAt.toISOString().slice(0, 16)}:${tag}` : `charge:${userId}:${runAt.toISOString().slice(0, 10)}`;
  const job = { kind: "charge" as const, user_id: userId, run_at: runAt, payload: tag ? { tag } : {}, max_attempts: 1 };
  if (await db.createJob({ ...job, dedupe_key: key })) return;
  if (await db.createJob({ ...job, dedupe_key: `${key}:${randomUUID()}` })) return;
  throw new Error(`[billing] could not queue the charge job of ${userId} at ${runAt.toISOString()}`);
}

/** When the next charge job of this subscription should run (used when a cancelled subscription is resumed). */
export function nextChargeRun(sub: Pick<SubscriptionRow, "next_charge_at" | "charge_failures">, now: Date): Date | null {
  if (!sub.next_charge_at) return null;
  const due = new Date(sub.next_charge_at);
  const at = sub.charge_failures <= 0 ? due : chargeAttemptAt(due, sub.charge_failures);
  return at.getTime() < now.getTime() ? new Date(now.getTime() + 60_000) : at;
}

/** The plan the next charge is for: a scheduled downgrade takes effect at that charge. */
export function renewalPlan(sub: Pick<SubscriptionRow, "plan" | "scheduled_plan">): PaidPlan | null {
  const p = sub.scheduled_plan ?? sub.plan;
  return isPaidPlan(p) ? p : null;
}

const dm = (d: Date) => {
  const l = localDateOf(d);
  return `${l.day}.${l.month}.${l.year}`;
};

/** The invoice line of a renewal: "מנוי פרו — 20.11.2026–20.12.2026" / "מנוי פרו שנתי — 20.11.2026–20.11.2027". */
export function renewalItem(plan: PaidPlan, from: Date, to: Date, cycle: BillingCycle = "monthly"): string {
  return `מנוי ${planNameHe(plan, cycle)} — ${dm(from)}–${dm(to)}`;
}

/** "חיוב חודשי" / "חיוב שנתי" — the stage of a renewal in the owner's alert. */
export const renewalStageHe = (cycle: BillingCycle) => (cycle === "annual" ? "חיוב שנתי" : "חיוב חודשי");

export type ChargeOutcome =
  | { kind: "charged"; transId: string; amountIls: number; plan: PaidPlan; cycle: BillingCycle; nextChargeAt: Date }
  | { kind: "retry"; failures: number; retryAt: Date; amountIls: number; ccode: string }
  | { kind: "card_invalid"; amountIls: number; pauseAt: Date; ccode: string }
  | { kind: "paused"; failures: number; amountIls: number }
  | { kind: "config_error"; ccode: string; retryAt: Date }
  | { kind: "skipped"; reason: string };

/** Why the monthly charge job has nothing to do right now (null = it should charge, or pause after a "card" failure). */
function notDue(sub: SubscriptionRow | null, now: Date): string | null {
  if (!sub || !isPaidPlan(sub.plan) || !(sub.status === "active" || sub.status === "past_due")) return "not billable";
  if (sub.cancelled_at) return "cancelled";
  if (sub.status === "past_due") return "paused";
  if (!sub.next_charge_at || Date.parse(sub.next_charge_at) > now.getTime() + 60_000) return "not due";
  // waiting for a card update after a "card" failure: nothing until the pause on day 7
  const pauseAt = chargeAttemptAt(new Date(sub.next_charge_at), MAX_CHARGE_FAILURES - 1);
  if (sub.charge_failures >= MAX_CHARGE_FAILURES && now.getTime() + 60_000 < pauseAt.getTime()) return "waiting for a card update";
  return null;
}

/**
 * One monthly charge attempt for one user (the `charge` job). Idempotent per due date through the payments unique key
 * and the job dedupe; never concurrent with a WhatsApp one-tap charge of the same user.
 *
 * Everything that decides or changes the subscription runs under the per-user charge lock (a `renewal` row in
 * billing_approvals, status processing): the subscription is read again after the lock is taken, and the lock is
 * released only after the subscription reflects this attempt — so a one-tap charge never sees a stale cycle.
 */
export async function chargeSubscription(db: Db, hyp: HypGateway, user: UserRow, now: Date = new Date()): Promise<ChargeOutcome> {
  const before = await db.getSubscription(user.id);
  const early = notDue(before, now);
  if (early) return { kind: "skipped", reason: early };
  if (!(await loadCardToken(db, user.id))) return { kind: "skipped", reason: "no token" };

  const lockPlan = renewalPlan(before!)!;
  const lockCycle = renewalCycleOf(before);
  const lock = await db.openRenewalCharge({
    user_id: user.id,
    plan: lockPlan,
    amount_ils: priceOf(lockPlan, lockCycle),
    billing_cycle: lockCycle,
    details: { due: before!.next_charge_at, attempt: before!.charge_failures + 1, cycle: lockCycle },
  });
  if (!lock) {
    // a one-tap charge from WhatsApp is in flight (or its outcome is unknown) — never charge in parallel
    await scheduleCharge(db, user.id, new Date(now.getTime() + 15 * 60_000), "busy");
    return { kind: "skipped", reason: "another charge is open" };
  }
  const release = (patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error">>) => db.updateBillingApproval(lock.id, patch, ["processing"]);

  let sub: SubscriptionRow;
  let card: { token: string; tokef: string };
  try {
    // under the lock: a one-tap charge may have settled this cycle (or a downgrade changed the plan) since the read above
    const fresh = await db.getSubscription(user.id);
    const late = notDue(fresh, now);
    if (late) {
      await release({ status: "failed", error: `not charged: ${late}` });
      return { kind: "skipped", reason: late };
    }
    sub = fresh!;
    if (renewalPlan(sub) !== lockPlan || renewalCycleOf(sub) !== lockCycle) {
      await release({ status: "failed", error: "not charged: the plan changed" });
      await scheduleCharge(db, user.id, new Date(now.getTime() + 60_000), "replan");
      return { kind: "skipped", reason: "the plan changed" };
    }
    // the card as it is now (a card update may have landed since the check above)
    const current = await loadCardToken(db, user.id);
    if (!current) {
      await release({ status: "failed", error: "not charged: no token" });
      return { kind: "skipped", reason: "no token" };
    }
    card = current;
  } catch (e) {
    await release({ status: "failed", error: `not charged: ${(e as Error).message.slice(0, 200)}` }).catch(() => null);
    throw e;
  }

  const plan = lockPlan;
  const cycle = lockCycle;
  const stage = renewalStageHe(cycle);
  const amountIls = priceOf(plan, cycle);
  const due = new Date(sub.next_charge_at!);
  const pauseAt = chargeAttemptAt(due, MAX_CHARGE_FAILURES - 1);

  // the last day after a "card" failure without a card update: pause (nothing is charged)
  if (sub.charge_failures >= MAX_CHARGE_FAILURES) {
    const out = await pause(db, user.id, sub.charge_failures, amountIls);
    await release({ status: "failed", error: "not charged: paused (no card update)" });
    ownerAlert({ type: "payment_failed", userId: user.id, email: user.email, name: user.name, amountIls, reason: `${stage}: הכרטיס לא עודכן אחרי חיוב שנדחה, והחשבון הושהה.`, ref: lock.id }, { db });
    return out;
  }

  const nextChargeAt = addCycle(due, cycle);
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
      items: [{ description: renewalItem(plan, due, nextChargeAt, cycle), quantity: 1, price: amountIls }],
    });
  } catch (e) {
    if (e instanceof HypPreflightError) {
      // nothing was sent (gateway not configured / invalid request): release the lock, the job reports the error
      await release({ status: "failed", error: e.message.slice(0, 300) });
      throw e;
    }
    // No answer: the charge may or may not have happened. The lock stays "unknown" and blocks every further charge
    // of this user until someone reconciles it in the HYP portal (Order = lock id) — docs/hyp-setup.md.
    await release({ status: "unknown", error: (e as Error).message.slice(0, 300) });
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: lock.id, result: "unknown" });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls, reason: `${stage}: לא התקבלה תשובה מ-HYP.`, ref: lock.id }, { db });
    throw e;
  }

  if (result.ok && !result.transId) {
    // approved without a transaction id: it cannot be matched to a receipt or told apart from a decline — never retry
    // automatically; "unknown" blocks further charges until reconciled in the HYP portal (Order = lock id)
    await release({ status: "unknown", ccode: result.ccode || "0", error: "approved without a transaction id" });
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: lock.id, result: "unknown:no_trans_id" });
    ownerAlert({ type: "charge_unknown", userId: user.id, email: user.email, name: user.name, amountIls, reason: `${stage}: HYP אישר בלי מספר עסקה.`, ref: lock.id }, { db });
    throw new Error(`HYP approved the renewal charge ${lock.id} without a transaction id — reconcile manually (docs/hyp-setup.md §7)`);
  }

  if (result.transId) {
    await db.insertPayment({ user_id: user.id, hyp_trans_id: result.transId, amount_ils: amountIls, ccode: result.ok ? "0" : result.ccode || "?", acode: result.acode, invoice_url: null, raw: result.response, approval_id: lock.id, billing_cycle: cycle });
  }

  if (result.ok && result.transId) {
    // state first, lock last: a one-tap press that claims right after the release already sees the new cycle
    await db.upsertSubscription(user.id, { status: "active", plan, scheduled_plan: null, billing_cycle: cycle, scheduled_cycle: null, next_charge_at: nextChargeAt.toISOString(), charge_failures: 0 });
    // a downgrade that takes effect now also lowers this calendar month's quota (an upgrade raises it at once)
    if (PLANS[plan].messages < (isPaidPlan(sub.plan) ? PLANS[sub.plan].messages : 0)) await db.lowerUsageLimit(user.id, PLANS[plan].messages);
    await scheduleCharge(db, user.id, nextChargeAt);
    await release({ status: "succeeded", hyp_trans_id: result.transId, ccode: "0" });
    const changed = [plan !== sub.plan ? `plan=${plan}` : null, cycle !== (sub.billing_cycle ?? "monthly") ? `cycle=${cycle}` : null].filter(Boolean).join(",");
    await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId, result: changed ? `ok:${changed}` : "ok" });
    // a free month waiting for this charge (a referral reward while the renewal was failing) moves the next one
    const credit = await applyPendingCredit(db, user.id, now);
    return { kind: "charged", transId: result.transId, amountIls, plan, cycle, nextChargeAt: credit.nextChargeAt ?? nextChargeAt };
  }

  const ccode = result.ccode || "?";
  const failureKind = classifyHypFailure(ccode);
  const outcome = await applyFailure(db, user.id, sub, { ccode, failureKind, amountIls, due, pauseAt, now });
  await release({ status: "failed", hyp_trans_id: result.transId, ccode: result.ccode || null });
  await db.addAudit({ user_id: user.id, action: "subscription.charge", target: result.transId ?? lock.id, result: `failed:${ccode}:${failureKind}` });
  ownerAlert({ type: "payment_failed", userId: user.id, email: user.email, name: user.name, amountIls, reason: chargeReason(stage, failureKind, ccode, renewalNext(outcome)), ref: lock.id }, { db });
  return outcome;
}

/** The subscription after a declined monthly charge (runs while the charge lock is still held). */
async function applyFailure(
  db: Db,
  userId: string,
  sub: SubscriptionRow,
  f: { ccode: string; failureKind: ReturnType<typeof classifyHypFailure>; amountIls: number; due: Date; pauseAt: Date; now: Date },
): Promise<ChargeOutcome> {
  const { ccode, failureKind, amountIls, due, pauseAt, now } = f;
  if (failureKind === "config") {
    // our terminal / request is wrong (901 tokens off, 902 PassP, 400 items…): not the customer's failure
    console.error(`[billing] HYP configuration error ${ccode} on a monthly charge — see docs/hyp-setup.md`);
    const retryAt = new Date(now.getTime() + DAY_MS);
    await scheduleCharge(db, userId, retryAt, "config");
    return { kind: "config_error", ccode, retryAt };
  }
  if (failureKind === "card") {
    if (now.getTime() + 60_000 >= pauseAt.getTime()) return pause(db, userId, MAX_CHARGE_FAILURES, amountIls);
    await db.upsertSubscription(userId, { charge_failures: MAX_CHARGE_FAILURES });
    await scheduleCharge(db, userId, pauseAt, "pause");
    return { kind: "card_invalid", amountIls, pauseAt, ccode };
  }
  const failures = sub.charge_failures + 1;
  if (failures >= MAX_CHARGE_FAILURES) return pause(db, userId, failures, amountIls);
  let retryAt = chargeAttemptAt(due, failures);
  if (retryAt.getTime() <= now.getTime()) retryAt = new Date(now.getTime() + 3_600_000); // the job ran late
  await db.upsertSubscription(userId, { charge_failures: failures });
  await scheduleCharge(db, userId, retryAt);
  return { kind: "retry", failures, retryAt, amountIls, ccode };
}

/**
 * A new card while the renewal waits for one (after a "card" failure there are no automatic attempts and the account
 * is paused on day 7): the attempts whose day has passed count as failed, and the next regular attempt (day 3 / 5 / 7)
 * charges the new card. Returns when it runs; null when the subscription is not waiting for a card.
 */
export async function resumeAfterCardUpdate(db: Db, userId: string, now: Date): Promise<Date | null> {
  const sub = await db.getSubscription(userId);
  if (!sub || sub.status !== "active" || sub.cancelled_at || sub.charge_failures < MAX_CHARGE_FAILURES || !sub.next_charge_at) return null;
  const due = new Date(sub.next_charge_at);
  let attempt = 1; // the attempt on day 1 is the one that failed
  while (attempt < MAX_CHARGE_FAILURES - 1 && chargeAttemptAt(due, attempt).getTime() <= now.getTime()) attempt++;
  const slot = chargeAttemptAt(due, attempt);
  const runAt = slot.getTime() <= now.getTime() ? new Date(now.getTime() + 60_000) : slot;
  await db.upsertSubscription(userId, { charge_failures: attempt });
  await scheduleCharge(db, userId, runAt, "card");
  await db.addAudit({ user_id: userId, action: "subscription.card_wait_ended", result: `attempt ${attempt + 1} at ${runAt.toISOString()}` });
  return runAt;
}

async function pause(db: Db, userId: string, failures: number, amountIls: number): Promise<ChargeOutcome> {
  await db.upsertSubscription(userId, { status: "past_due", charge_failures: failures });
  await db.cancelJobs(userId, "charge");
  await db.addAudit({ user_id: userId, action: "subscription.pause", result: `after day ${PAUSE_DAY}` });
  return { kind: "paused", failures, amountIls };
}
