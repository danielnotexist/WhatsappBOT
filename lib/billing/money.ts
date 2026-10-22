import { formatAmount } from "@/lib/hyp/sign";
import { PLANS, VAT_RATE, addOneMonth } from "./plans";

const DAY_MS = 86_400_000;

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

export interface UpgradeQuote {
  /** to pay now, VAT included */
  amountIls: number;
  vatIls: number;
  /** whole days left in the current cycle (rounded up), and the cycle's length */
  daysLeft: number;
  cycleDays: number;
  /** end of the current cycle = the next monthly charge, which will be the pro price */
  periodEnd: Date;
  nextAmountIls: number;
}

/** Below this the charge is not worth an invoice: a 1 ₪ minimum (HYP rejects tiny amounts with CCode 403). */
export const MIN_CHARGE_ILS = 1;

/**
 * basic → pro in the middle of a cycle: the price difference (299 − 99 = 200 ₪, VAT included) × the share of the
 * cycle that is left, by whole days (rounded up — today counts). The next monthly charge (periodEnd) is the full pro price.
 * Returns null when the cycle has already ended (the renewal is due — upgrade after it).
 */
export function quoteUpgrade(nextChargeAt: string | Date, now: Date): UpgradeQuote | null {
  const end = new Date(nextChargeAt);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  const start = subtractOneMonth(end);
  const cycleDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const daysLeft = Math.min(cycleDays, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  const diff = PLANS.pro.priceIls - PLANS.basic.priceIls;
  const amountIls = Math.max(MIN_CHARGE_ILS, round2((diff * daysLeft) / cycleDays));
  return { amountIls, vatIls: vatOf(amountIls), daysLeft, cycleDays, periodEnd: end, nextAmountIls: PLANS.pro.priceIls };
}

/** A full month of `plan` starting at `from` (renewal after a pause / an ended subscription). */
export function quoteMonth(plan: keyof typeof PLANS, from: Date): { amountIls: number; vatIls: number; periodEnd: Date } {
  const amountIls = PLANS[plan].priceIls;
  return { amountIls, vatIls: vatOf(amountIls), periodEnd: addOneMonth(from) };
}
