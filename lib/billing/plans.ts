/** Pricing decided after the plan (PROGRESS.md): 99 ₪ / 750 messages, 299 ₪ / fair use 3,000. Prices include VAT. */
export type PaidPlan = "basic" | "pro";

export const PLANS: Record<PaidPlan, { priceIls: number; messages: number; nameHe: string }> = {
  basic: { priceIls: 99, messages: 750, nameHe: "בסיסי" },
  pro: { priceIls: 299, messages: 3000, nameHe: "פרו" },
};

export const TRIAL_MESSAGES = 10;
export const VAT_RATE = 0.18;

export function isPaidPlan(p: unknown): p is PaidPlan {
  return p === "basic" || p === "pro";
}

/**
 * Monthly renewal attempts by day, day 1 = the due date (PLAN §4 + the owner's decision of 21.10.2026):
 * the charge on day 1 and automatic retries on days 3, 5 and 7. A WhatsApp nudge with [ניסיון חוזר] [עדכון כרטיס]
 * follows the day 1 / 3 / 5 failures; after the day-7 failure the account is paused gracefully (past_due).
 * A "card" failure (blocked / invalid token) is never retried automatically — the account waits for a card update
 * and is paused on day 7.
 */
export const CHARGE_RETRY_DAYS = [1, 3, 5, 7] as const;
export const MAX_CHARGE_FAILURES = CHARGE_RETRY_DAYS.length;
export const PAUSE_DAY = CHARGE_RETRY_DAYS[CHARGE_RETRY_DAYS.length - 1];

/** When attempt number `attempt` (0 = the due-date charge) of the cycle due at `due` runs. */
export function chargeAttemptAt(due: Date, attempt: number): Date {
  const day = CHARGE_RETRY_DAYS[Math.min(attempt, CHARGE_RETRY_DAYS.length - 1)]!;
  return new Date(due.getTime() + (day - 1) * 86_400_000);
}

/** Next monthly due date: same day next month, clamped to the month's length. */
export function addOneMonth(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}
