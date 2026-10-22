/**
 * HYP Pay status codes (developers.hyp.co.il/pay/reference/response-status-codes) grouped by what we do next
 * after a failed `action=soft` token charge:
 *
 *  - `card`      — the saved card cannot be charged (blocked / stolen / invalid / expired / bad token). Never retry the
 *                  same token automatically (card-network "do not retry" category); ask for a card update.
 *  - `declined`  — the issuer declined this time (e.g. limit). Retry later on the schedule; the user may try now.
 *  - `temporary` — communication / processing error. Safe to retry soon.
 *  - `config`    — our terminal setup or request is wrong (tokens not enabled 901/996, wrong PassP 902, items sum 400…).
 *                  Not the customer's fault: no customer nudge, alert the operator (docs/hyp-setup.md).
 *
 * Success codes are not failures: 0 (charged), 600 (J2 card check), 700 (J5 authorization), 800 (postponed).
 */
export type HypFailureKind = "card" | "declined" | "temporary" | "config";

export const HYP_SUCCESS_CODES = ["0", "600", "700", "800"] as const;

const CARD = new Set([1, 2, 5, 6, 7, 8, 12, 14, 15, 26, 343, 416, 420, 429, 440, 447, 456, 990, 997]);
const TEMPORARY = new Set([9, 431, 509, 598, 599, 999]);
const CONFIG = new Set([16, 17, 400, 401, 402, 403, 417, 418, 901, 902, 903, 904, 996]);

export function classifyHypFailure(ccode: string | number | null | undefined): HypFailureKind {
  const code = typeof ccode === "number" ? ccode : /^\d+$/.test(String(ccode ?? "").trim()) ? Number(String(ccode).trim()) : NaN;
  if (Number.isNaN(code)) return "temporary";
  if (CARD.has(code)) return "card";
  if (TEMPORARY.has(code) || (code >= 551 && code <= 567)) return "temporary";
  if (CONFIG.has(code) || (code >= 300 && code <= 385)) return "config";
  return "declined";
}

/** Card expiry check before charging a token: `tokef` is YYMM; a card is valid through the end of that month. */
export function tokefExpired(tokef: string | null | undefined, now: Date): boolean {
  const m = (tokef ?? "").match(/^(\d{2})(\d{2})$/);
  if (!m) return true;
  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return true;
  const endOfMonth = Date.UTC(year, month, 1); // first moment of the following month (UTC)
  return now.getTime() >= endOfMonth;
}

/** Last four digits of the card — a HYP token always ends with the card's last four digits. */
export function tokenLast4(token: string | null | undefined): string | null {
  const m = (token ?? "").match(/(\d{4})$/);
  return m ? m[1]! : null;
}
