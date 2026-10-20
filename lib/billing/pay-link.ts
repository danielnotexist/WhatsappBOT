import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";

/**
 * Personal payment link sent in WhatsApp: /pay/<token> where token = base64url(userId.exp).sig.
 * No session needed on the phone; 7 days validity; the page shows the plan choice and starts HYP.
 */
export const PAY_LINK_TTL_SECONDS = 7 * 24 * 3600;

export function createPayLinkToken(userId: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + (opts.ttlSeconds ?? PAY_LINK_TTL_SECONDS);
  const payload = Buffer.from(`${userId}.${exp}`).toString("base64url");
  return `${payload}.${hmac(key, `pay:${payload}`).toString("base64url")}`;
}

export function verifyPayLinkToken(token: string | undefined | null, opts: { key?: Buffer; now?: Date } = {}): { userId: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const key = opts.key ?? derivedKey("session");
  const expected = hmac(key, `pay:${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const m = decoded.match(/^([0-9a-f-]{36})\.(\d+)$/);
  if (!m) return null;
  if (Number(m[2]) * 1000 <= (opts.now ?? new Date()).getTime()) return null;
  return { userId: m[1]! };
}

export function payLinkFor(appUrl: string, userId: string): string {
  return new URL(`/pay/${createPayLinkToken(userId)}`, appUrl).toString();
}
