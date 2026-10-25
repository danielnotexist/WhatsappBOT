/**
 * The billing cycle picked on the price list (components/brand/landing/plan-cycle.tsx), remembered for the payment
 * page of this browser (app/pay/[token]/page.tsx opens on it). A first-party preference — never a price, never
 * trusted for an amount: the price always comes from lib/billing/plans.ts. Client-safe and dependency-free.
 */
export const CYCLE_COOKIE = "alze_cycle";
export const CYCLE_COOKIE_MAX_AGE = 30 * 24 * 3600;
