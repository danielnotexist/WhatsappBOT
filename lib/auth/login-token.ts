import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { derivedKey, hmac } from "./keys";

/**
 * "Joined through WhatsApp? Sign in here" (round plan §3 row 7): the user writes "כניסה" to עלזה, the bot answers
 * with /login/w/<token>, and opening it signs the browser in.
 *
 * Same contract as the link token (lib/auth/link-token.ts): single use, short-lived (10 minutes), a fresh one per
 * request. The token is signed (HMAC, session sub-key) and carries the user id, the expiry and a random nonce; the
 * user's profile stores only a hash of the latest nonce, so a token works once and an older one stops working as
 * soon as a newer one is issued. No new table: it lives next to `oauth_pending` in the profile.
 */
export const LOGIN_TOKEN_TTL_MS = 10 * 60_000;
const PROFILE_KEY = "login_token";

const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");

export type LoginTokenResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "used" };

export async function issueLoginToken(db: Db, userId: string, opts: { now?: Date; key?: Buffer } = {}): Promise<{ token: string; expiresAt: Date }> {
  const now = opts.now ?? new Date();
  const key = opts.key ?? derivedKey("session");
  const nonce = randomBytes(18).toString("base64url");
  const exp = Math.floor((now.getTime() + LOGIN_TOKEN_TTL_MS) / 1000);
  const payload = Buffer.from(`${userId}.${exp}.${nonce}`).toString("base64url");
  const sig = hmac(key, `login:${payload}`).toString("base64url");
  await db.mergeUserProfile(userId, { [PROFILE_KEY]: { nonce_hash: sha256(nonce), exp } });
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000) };
}

/** Signature + expiry only (no db, nothing consumed) — for rendering the confirm page. */
export function peekLoginToken(token: string, opts: { now?: Date; key?: Buffer } = {}): { userId: string; exp: number; nonce: string } | "invalid" | "expired" {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return "invalid";
  const key = opts.key ?? derivedKey("session");
  const expected = hmac(key, `login:${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const m = Buffer.from(payload, "base64url").toString("utf8").match(/^([0-9a-f-]{36})\.(\d+)\.([A-Za-z0-9_-]{16,})$/);
  if (!m) return "invalid";
  const exp = Number(m[2]);
  if (exp * 1000 <= (opts.now ?? new Date()).getTime()) return "expired";
  return { userId: m[1]!, exp, nonce: m[3]! };
}

/** Verifies and burns the token. Returns the user id to start a session for. */
export async function consumeLoginToken(db: Db, token: string, opts: { now?: Date; key?: Buffer } = {}): Promise<LoginTokenResult> {
  const peek = peekLoginToken(token, opts);
  if (peek === "invalid" || peek === "expired") return { ok: false, reason: peek };
  const user = await db.getUser(peek.userId);
  if (!user) return { ok: false, reason: "invalid" };
  const stored = user.profile[PROFILE_KEY] as { nonce_hash?: string; exp?: number } | null | undefined;
  if (!stored?.nonce_hash || stored.nonce_hash !== sha256(peek.nonce)) return { ok: false, reason: "used" };
  await db.mergeUserProfile(user.id, { [PROFILE_KEY]: null });
  await db.addAudit({ user_id: user.id, action: "auth.login_whatsapp", result: "ok" });
  return { ok: true, userId: user.id };
}
