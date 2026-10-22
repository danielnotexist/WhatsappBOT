import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";

/**
 * Signed links sent in WhatsApp (same scheme as pay-link.ts, separate purposes so one never opens another):
 *   /pay/card/<token>  — a fresh HYP card-update page (J2 check + getToken), 7 days
 *   /invoice/<token>   — the invoice PDF of one of the user's transactions, 90 days
 * token = base64url("<userId>.<extra>.<exp>").sig — no session needed on the phone.
 */
type Purpose = "card" | "inv";

const TTL: Record<Purpose, number> = { card: 7 * 24 * 3600, inv: 90 * 24 * 3600 };

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
