import type { SubscriptionRow } from "@/lib/db/types";

/** Pricing decided after the plan (PROGRESS.md): 99 ₪ / 750 messages, 299 ₪ / fair use 3,000. Prices include VAT. */
export type PaidPlan = "basic" | "pro";
/** The plan in force right now (mirrors SQL `user_plan`): a paid plan, or the trial. */
export type EffectivePlan = "trial" | PaidPlan;

export interface PlanSpec {
  priceIls: number;
  messages: number;
  nameHe: string;
  /** custom agents the user may create (SQL `agent_custom_limit` — docs/design/agents.md §2.2) */
  customAgents: number;
  /** the three built-in agents (מזכירה / מתמחה / מנהלת חשבונות), editable and switchable */
  builtinAgents: boolean;
}

export const PLANS: Record<PaidPlan, PlanSpec> = {
  basic: { priceIls: 99, messages: 750, nameHe: "בסיסי", customAgents: 1, builtinAgents: false },
  pro: { priceIls: 299, messages: 3000, nameHe: "פרו", customAgents: 3, builtinAgents: true },
};

export const TRIAL_MESSAGES = 10;
/** Trial: the built-ins as they are (no editing), no custom agents (docs/design/agents.md §0.3). */
export const TRIAL_CUSTOM_AGENTS = 0;
export const TRIAL_BUILTIN_AGENTS = true;
export const VAT_RATE = 0.18;

export function isPaidPlan(p: unknown): p is PaidPlan {
  return p === "basic" || p === "pro";
}

/** Whether the subscription currently grants a paid plan (cancelled plans run until the end of the paid period). */
export function paidPlanOf(sub: Pick<SubscriptionRow, "plan" | "status" | "next_charge_at"> | null, now: Date): PaidPlan | null {
  if (!sub || !isPaidPlan(sub.plan)) return null;
  if (sub.status === "active" || sub.status === "past_due") return sub.plan;
  if (sub.status === "cancelled" && sub.next_charge_at && Date.parse(sub.next_charge_at) > now.getTime()) return sub.plan;
  return null;
}

/** The plan in force — the TypeScript twin of SQL `public.user_plan` (0003). */
export function effectivePlan(sub: Pick<SubscriptionRow, "plan" | "status" | "next_charge_at"> | null, now: Date): EffectivePlan {
  return paidPlanOf(sub, now) ?? "trial";
}

/** Custom agents allowed on a plan: 0 / 1 / 3 (= SQL `agent_custom_limit`). */
export function customAgentLimit(plan: EffectivePlan): number {
  return plan === "trial" ? TRIAL_CUSTOM_AGENTS : PLANS[plan].customAgents;
}

/** Whether the built-in agents are available on a plan (trial: as they are; basic: no; pro: yes, editable). */
export function builtinAgentsIncluded(plan: EffectivePlan): boolean {
  return plan === "trial" ? TRIAL_BUILTIN_AGENTS : PLANS[plan].builtinAgents;
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
