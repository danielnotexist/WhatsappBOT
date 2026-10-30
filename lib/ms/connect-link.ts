import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac, signedTokenParts } from "@/lib/auth/keys";

/** One-time 30-minute link sent in chat: /api/auth/microsoft/start?t=<token> (PLAN §1 "חיבור מהשיחה"). */
export const CONNECT_LINK_TTL_SECONDS = 30 * 60;

export function createConnectLinkToken(userId: string, provider: "microsoft" | "google", opts: { key?: Buffer; now?: Date } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + CONNECT_LINK_TTL_SECONDS;
  const payload = Buffer.from(`${userId}.${provider}.${exp}`).toString("base64url");
  return `${payload}.${hmac(key, `connect:${payload}`).toString("base64url")}`;
}

export function verifyConnectLinkToken(token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): { userId: string; provider: "microsoft" | "google" } | null {
  const parts = signedTokenParts(token);
  if (!parts) return null;
  const { payload, sig } = parts;
  const key = opts.key ?? derivedKey("session");
  const expected = hmac(key, `connect:${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const m = Buffer.from(payload, "base64url").toString("utf8").match(/^([0-9a-f-]{36})\.(microsoft|google)\.(\d+)$/);
  if (!m || Number(m[3]) * 1000 <= (opts.now ?? new Date()).getTime()) return null;
  return { userId: m[1]!, provider: m[2] as "microsoft" | "google" };
}
