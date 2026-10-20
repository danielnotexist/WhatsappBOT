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

/** Retry schedule for a failed monthly charge: days 1, 3, 5 after the due date (PLAN §4). */
export const CHARGE_RETRY_DAYS = [1, 3, 5] as const;
export const MAX_CHARGE_FAILURES = CHARGE_RETRY_DAYS.length;

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
