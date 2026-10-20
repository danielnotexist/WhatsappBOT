import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "./keys";

/**
 * Stateless signed session: `v1.<userId>.<expiresAtSeconds>.<hmac>` in an httpOnly cookie.
 * Signed with the "session" sub-key of TOKEN_ENC_KEY. 30 days; nothing to store or look up.
 */
export const SESSION_COOKIE = "wb_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

export interface Session {
  userId: string;
  expiresAt: Date;
}

function sign(payload: string, key: Buffer): string {
  return hmac(key, payload).toString("base64url");
}

export function createSessionToken(userId: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const now = opts.now ?? new Date();
  const exp = Math.floor(now.getTime() / 1000) + (opts.ttlSeconds ?? SESSION_TTL_SECONDS);
  const payload = `v1.${userId}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined | null, opts: { key?: Buffer; now?: Date } = {}): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, userId, expStr, sig] = parts as [string, string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^\d+$/.test(expStr)) return null;
  const key = opts.key ?? derivedKey("session");
  const expected = Buffer.from(sign(`v1.${userId}.${expStr}`, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const expiresAt = new Date(Number(expStr) * 1000);
  if (expiresAt.getTime() <= (opts.now ?? new Date()).getTime()) return null;
  return { userId, expiresAt };
}

/** Cookie attributes shared by the route handler and server actions. */
export function sessionCookieOptions(secure: boolean = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
