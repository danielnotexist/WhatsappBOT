import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";

/**
 * Signed links sent in WhatsApp (same scheme as pay-link.ts, separate purposes so one never opens another):
 *   /pay/card/<token>  — a fresh HYP card-update page (J2 check + getToken), 7 days
 *   /invoice/<token>   — the invoice PDF of one of the user's transactions, 90 days
 *   upgrade offer      — the hidden field of [לשדרג עכשיו] on /pay/<token>: the single-use nonce + the amount and the
 *                        billing cycle that were shown, 10 minutes (like a WhatsApp approval)
 * token = base64url("<userId>.<extra>.<exp>").sig — no session needed on the phone.
 */
type Purpose = "card" | "inv" | "upg";

/** How long the upgrade price shown on the pay page can be accepted — the WhatsApp approval's 10 minutes. */
export const UPGRADE_OFFER_TTL_SECONDS = 10 * 60;

const TTL: Record<Purpose, number> = { card: 7 * 24 * 3600, inv: 90 * 24 * 3600, upg: UPGRADE_OFFER_TTL_SECONDS };

function sign(purpose: Purpose, userId: string, extra: string, opts: { key?: Buffer; now?: Date } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + TTL[purpose];
  const payload = Buffer.from(`${userId}.${extra}.${exp}`).toString("base64url");
  return `${payload}.${hmac(key, `${purpose}:${payload}`).toString("base64url")}`;
}

function verify(purpose: Purpose, token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): { userId: string; extra: string } | null {
  if (!token) return null;
  const [payload, sig, ...rest] = token.split(".");
  if (!payload || !sig || rest.length) return null;
  const key = opts.key ?? derivedKey("session");
  const expected = hmac(key, `${purpose}:${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const m = Buffer.from(payload, "base64url").toString("utf8").match(/^([0-9a-f-]{36})\.([0-9A-Za-z_-]*)\.(\d+)$/);
  if (!m) return null;
  if (Number(m[3]) * 1000 <= (opts.now ?? new Date()).getTime()) return null;
  return { userId: m[1]!, extra: m[2]! };
}

export function createCardLinkToken(userId: string, opts: { key?: Buffer; now?: Date } = {}): string {
  return sign("card", userId, "", opts);
}
export function verifyCardLinkToken(token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): { userId: string } | null {
  const v = verify("card", token, opts);
  return v ? { userId: v.userId } : null;
}
export function cardLinkFor(appUrl: string, userId: string): string {
  return new URL(`/pay/card/${createCardLinkToken(userId)}`, appUrl).toString();
}

export function createInvoiceToken(userId: string, transId: string, opts: { key?: Buffer; now?: Date } = {}): string {
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(transId)) throw new Error("invalid transaction id");
  return sign("inv", userId, transId, opts);
}
export function verifyInvoiceToken(token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): { userId: string; transId: string } | null {
  const v = verify("inv", token, opts);
  return v && v.extra ? { userId: v.userId, transId: v.extra } : null;
}
export function invoiceLinkFor(appUrl: string, userId: string, transId: string): string {
  return new URL(`/invoice/${createInvoiceToken(userId, transId)}`, appUrl).toString();
}

/** What the pay page showed next to [לשדרג עכשיו]: charged exactly as shown, for that billing cycle only. */
export interface UpgradeOfferTerms {
  /** single-use: becomes the approval id, so a replayed form cannot open a second charge */
  nonce: string;
  amountIls: number;
  /** the end of the billing cycle the price was computed for (next_charge_at) */
  periodEnd: Date;
  daysLeft: number;
}

const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createUpgradeOfferToken(userId: string, terms: UpgradeOfferTerms, opts: { key?: Buffer; now?: Date } = {}): string {
  const cents = Math.round(terms.amountIls * 100);
  if (!NONCE.test(terms.nonce) || !(cents > 0) || !Number.isFinite(terms.periodEnd.getTime()) || !(terms.daysLeft > 0)) throw new Error("invalid upgrade offer");
  return sign("upg", userId, `${terms.nonce}_${cents}_${terms.periodEnd.getTime()}_${Math.trunc(terms.daysLeft)}`, opts);
}

export function verifyUpgradeOfferToken(token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): ({ userId: string } & UpgradeOfferTerms) | null {
  const v = verify("upg", token, opts);
  const m = v?.extra.match(/^([0-9a-f-]{36})_(\d{1,9})_(\d{1,15})_(\d{1,3})$/);
  if (!v || !m || !NONCE.test(m[1]!)) return null;
  return { userId: v.userId, nonce: m[1]!, amountIls: Number(m[2]) / 100, periodEnd: new Date(Number(m[3])), daysLeft: Number(m[4]) };
}
