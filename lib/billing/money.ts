import { formatAmount } from "@/lib/hyp/sign";
import { PLANS, VAT_RATE, addCycle, addOneMonth, addOneYear, priceOf, type BillingCycle, type PaidPlan } from "./plans";

export const DAY_MS = 86_400_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The VAT part of a VAT-inclusive amount (our prices include VAT): 99 → 15.1. */
export function vatOf(grossIls: number): number {
  return round2(grossIls - grossIls / (1 + VAT_RATE));
}

/** "99" / "129.03" — the way amounts are shown in chat and sent to HYP. */
export const formatIls = formatAmount;

/** One month before `d` — the start of the billing cycle that ends at `d` (inverse of addOneMonth, clamped). */
export function subtractOneMonth(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() - 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/** One year before `d` — the start of the annual cycle that ends at `d` (inverse of addOneYear, clamped: 29.2 → 28.2). */
export function subtractOneYear(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCFullYear(out.getUTCFullYear() - 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export function subtractCycle(d: Date, cycle: BillingCycle): Date {
  return cycle === "annual" ? subtractOneYear(d) : subtractOneMonth(d);
}

/**
 * The proration of the cycle that ends at `end` (the next charge): its length in days, and the whole days left until
 * it ends — rounded up (today counts) and never more than the cycle. The one helper behind every prorated amount: the
 * upgrade to pro and the credit of a switch to the annual cycle. A free month (a referral reward) pushes `end` beyond
 * one full cycle: `extraMs` is that part — never priced, never credited, kept as it is.
 */
export function prorate(end: Date, now: Date, cycle: BillingCycle): { daysLeft: number; cycleDays: number; extraMs: number } | null {
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  const start = subtractCycle(end, cycle);
  const cycleMs = end.getTime() - start.getTime();
  const cycleDays = Math.max(1, Math.round(cycleMs / DAY_MS));
  const leftMs = end.getTime() - now.getTime();
  const daysLeft = Math.min(cycleDays, Math.ceil(leftMs / DAY_MS));
  return { daysLeft, cycleDays, extraMs: Math.max(0, leftMs - cycleMs) };
}

export interface UpgradeQuote {
  /** to pay now, VAT included */
  amountIls: number;
  vatIls: number;
  /** whole days left in the current cycle (rounded up), and the cycle's length */
  daysLeft: number;
  cycleDays: number;
  /** end of the current cycle = the next charge, which will be the pro price of the cycle */
  periodEnd: Date;
  nextAmountIls: number;
}

/** Below this the charge is not worth an invoice: a 1 ₪ minimum (HYP rejects tiny amounts with CCode 403). */
export const MIN_CHARGE_ILS = 1;

/**
 * basic → pro in the middle of a cycle: the price difference of the cycle (monthly 299 − 99 = 200 ₪; annual
 * 2,990 − 990 = 2,000 ₪; VAT included) × the share of the cycle that is left, by whole days (rounded up — today
 * counts). The period end stays; the next charge (periodEnd) is the full pro price of `nextCycle` (the cycle of the
 * renewal — monthly when an annual plan is set to move to monthly). Returns null when the cycle has already ended
 * (the renewal is due — upgrade after it).
 */
export function quoteUpgrade(nextChargeAt: string | Date, now: Date, cycle: BillingCycle = "monthly", nextCycle: BillingCycle = cycle): UpgradeQuote | null {
  const end = new Date(nextChargeAt);
  const p = prorate(end, now, cycle);
  if (!p) return null;
  const diff = priceOf("pro", cycle) - priceOf("basic", cycle);
  const amountIls = Math.max(MIN_CHARGE_ILS, round2((diff * p.daysLeft) / p.cycleDays));
  return { amountIls, vatIls: vatOf(amountIls), daysLeft: p.daysLeft, cycleDays: p.cycleDays, periodEnd: end, nextAmountIls: priceOf("pro", nextCycle) };
}

export interface AnnualSwitchQuote {
  /** to pay now: the annual price less the credit, VAT included */
  amountIls: number;
  vatIls: number;
  annualPriceIls: number;
  /** the unused part of the current monthly cycle, VAT included */
  creditIls: number;
  daysLeft: number;
  cycleDays: number;
  /** the end of the current monthly cycle (the offer is priced for it) */
  periodEnd: Date;
  /** the end of the new annual cycle: a year from now, plus any free days beyond the paid month (a referral reward) */
  newPeriodEnd: Date;
}

/**
 * monthly → annual (from /account): the annual cycle starts now; the unused part of the current monthly cycle — the
 * same proration as the upgrade (whole days left, rounded up, over the cycle's days) × the monthly price — is credited
 * against the first annual charge. Days beyond one paid month (a free month already granted) carry over to the end of
 * the new year. null when the cycle has already ended.
 */
export function quoteAnnualSwitch(plan: PaidPlan, nextChargeAt: string | Date, now: Date): AnnualSwitchQuote | null {
  const end = new Date(nextChargeAt);
  const p = prorate(end, now, "monthly");
  if (!p) return null;
  const annual = priceOf(plan, "annual");
  const creditIls = round2((priceOf(plan, "monthly") * p.daysLeft) / p.cycleDays);
  const amountIls = Math.max(MIN_CHARGE_ILS, round2(annual - creditIls));
  const newPeriodEnd = new Date(addOneYear(now).getTime() + p.extraMs);
  return { amountIls, vatIls: vatOf(amountIls), annualPriceIls: annual, creditIls, daysLeft: p.daysLeft, cycleDays: p.cycleDays, periodEnd: end, newPeriodEnd };
}

/** A full period of `plan` on `cycle` starting at `from` (a renewal after a pause / an ended subscription). */
export function quotePeriod(plan: PaidPlan, cycle: BillingCycle, from: Date): { amountIls: number; vatIls: number; periodEnd: Date } {
  const amountIls = priceOf(plan, cycle);
  return { amountIls, vatIls: vatOf(amountIls), periodEnd: addCycle(from, cycle) };
}

/** A full month of `plan` starting at `from` (kept for the monthly callers). */
export function quoteMonth(plan: keyof typeof PLANS, from: Date): { amountIls: number; vatIls: number; periodEnd: Date } {
  const amountIls = PLANS[plan].priceIls;
  return { amountIls, vatIls: vatOf(amountIls), periodEnd: addOneMonth(from) };
}
