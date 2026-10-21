import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "./keys";

/**
 * Stateless signed session: `v1.<userId>.<expiresAtSeconds>.<hmac>` in an httpOnly cookie.
 * Signed with the "session" sub-key of TOKEN_ENC_KEY. 30 days; nothing to store or look up.
 *
 * Demo on the memory store only (DEMO_MODE=1 without Supabase, lib/demo.ts): `v2.<userId>.<exp>.<base64url(email)>.<hmac>`
 * — the email rides along so a serverless instance whose in-memory db never saw the user can recreate it
 * (lib/auth/current-user.ts). The claim is only ever acted on in the demo.
 */
export const SESSION_COOKIE = "wb_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

export interface Session {
  userId: string;
  expiresAt: Date;
  /** v2 (demo) tokens only */
  email?: string;
}

/** same shape as lib/auth/otp.ts normalizeEmail (lowercased there before it is signed) */
const EMAIL_CLAIM = /^[^\s@A-Z]+@[^\s@A-Z]+\.[^\s@A-Z]{2,}$/;

function sign(payload: string, key: Buffer): string {
  return hmac(key, payload).toString("base64url");
}

/** `email` (demo only) adds the email claim → a v2 token. */
export function createSessionToken(userId: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number; email?: string } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const now = opts.now ?? new Date();
  const exp = Math.floor(now.getTime() / 1000) + (opts.ttlSeconds ?? SESSION_TTL_SECONDS);
  const payload = opts.email ? `v2.${userId}.${exp}.${Buffer.from(opts.email).toString("base64url")}` : `v1.${userId}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined | null, opts: { key?: Buffer; now?: Date } = {}): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  const v1 = parts.length === 4 && parts[0] === "v1";
  const v2 = parts.length === 5 && parts[0] === "v2";
  if (!v1 && !v2) return null;
  const [, userId, expStr] = parts as [string, string, string];
  const emailPart = v2 ? parts[3]! : null;
  const sig = parts.at(-1)!;
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^\d+$/.test(expStr)) return null;
  if (emailPart !== null && !/^[A-Za-z0-9_-]{1,400}$/.test(emailPart)) return null;
  const key = opts.key ?? derivedKey("session");
  const expected = Buffer.from(sign(parts.slice(0, -1).join("."), key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const expiresAt = new Date(Number(expStr) * 1000);
  if (expiresAt.getTime() <= (opts.now ?? new Date()).getTime()) return null;
  if (emailPart === null) return { userId, expiresAt };
  const email = Buffer.from(emailPart, "base64url").toString("utf8");
  if (email.length > 254 || !EMAIL_CLAIM.test(email)) return null;
  return { userId, expiresAt, email };
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
