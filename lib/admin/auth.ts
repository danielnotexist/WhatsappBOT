import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/current-user";
import { derivedKey } from "@/lib/auth/keys";
import { generateCode, hashCode } from "@/lib/auth/otp";
import { getDb } from "@/lib/db";
import type { Db, UserRow } from "@/lib/db/types";
import { DEMO_OTP_CODE } from "@/lib/demo";
import { adminEmails, dataMode, EnvError } from "@/lib/env";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { adminMailer, AdminMailUnavailableError } from "./mail";
import {
  ADMIN_CODE_COOKIE,
  ADMIN_CODE_TTL_SECONDS,
  ADMIN_COOKIE,
  ADMIN_GATE_COOKIE,
  ADMIN_TTL_SECONDS,
  adminCookieOptions,
  createAdminToken,
  createCodeToken,
  createGateToken,
  readCodeToken,
  verifyAdminToken,
} from "./tokens";

/**
 * Who opens /admin (round plan: owner-only panel). Three things, all checked on every page and every action:
 *   1. a valid session whose user's email is in ADMIN_EMAILS (lib/env.ts; default danielnotexist@gmail.com);
 *   2. the panel's own cookie, wb_admin (lib/admin/tokens.ts) — 12 hours, `/admin` only, httpOnly, SameSite=Strict;
 *   3. it is minted only after a real one-time code mailed to that address was typed (sendAdminCode / verifyAdminCode).
 * The demo signs anyone in as any email with 123456 (lib/demo.ts), so (1) alone never opens anything: the code goes to
 * the owner's real inbox, is never 123456, has 5 attempts and a rate limit. Anything missing → notFound(): the panel
 * does not exist for anyone else (proxy.ts already answers a real 404 before the page without the gate cookie).
 */

export const ADMIN_CODE_POLICY = {
  ttlMs: ADMIN_CODE_TTL_SECONDS * 1000,
  resendCooldownMs: 60_000,
  maxAttempts: 5,
  maxPerHour: 5,
  maxVerifiesPer15Min: 10,
} as const;

export const ADMIN_MESSAGES = {
  sent: "הקוד נשלח למייל. הוא תקף ל-10 דקות.",
  cooldown: "קוד נשלח לפני רגע. אפשר לבקש קוד חדש בעוד דקה.",
  too_many: "נשלחו יותר מדי קודים בשעה האחרונה. אפשר לנסות שוב מאוחר יותר.",
  mail_failed: "שליחת המייל נכשלה. אפשר לנסות שוב בעוד רגע.",
  no_code: "אין קוד פעיל. צריך לבקש קוד חדש.",
  expired: "הקוד פג תוקף. צריך לבקש קוד חדש.",
  invalid: "הקוד לא נכון.",
  too_many_attempts: "יותר מדי ניסיונות שגויים. צריך לבקש קוד חדש.",
  rate_limited: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.",
} as const;

export type AdminCodeResult = { ok: true; message?: string } | { ok: false; message: string };

/** The ADMIN_EMAILS list: fail closed (nobody is an owner) when it is malformed. */
export function isAdminEmail(email: string | null | undefined, source: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  try {
    return adminEmails(source).includes(email.trim().toLowerCase());
  } catch (e) {
    if (e instanceof EnvError) console.error("[admin]", e.message);
    return false;
  }
}

export type OwnerState = { state: "none" } | { state: "code"; user: UserRow; codeSent: boolean } | { state: "ok"; user: UserRow };

/** Where the request stands. Request-time (cookies): call inside Suspense / an action / a route handler. */
export async function ownerState(db: Db = getDb()): Promise<OwnerState> {
  const session = await getSession();
  if (!session) return { state: "none" };
  const user = await db.getUser(session.userId);
  if (!user || !isAdminEmail(user.email)) return { state: "none" };
  const store = await cookies();
  if (verifyAdminToken(store.get(ADMIN_COOKIE)?.value, user.id)) return { state: "ok", user };
  return { state: "code", user, codeSent: readCodeToken(store.get(ADMIN_CODE_COOKIE)?.value, user.id) !== null };
}

/** Every admin page part, action and route: the owner with an open panel, or a 404. */
export async function requireOwner(db: Db = getDb()): Promise<UserRow> {
  const s = await ownerState(db);
  if (s.state !== "ok") notFound();
  return s.user;
}

/** The owner by email only (GET /admin/enter: before the code). null for anyone else. */
export async function recognisedOwner(db: Db = getDb()): Promise<UserRow | null> {
  const s = await ownerState(db);
  return s.state === "none" ? null : s.user;
}

/** The gate cookie for proxy.ts (set by GET /admin/enter for a recognised owner). */
export function gateCookie(userId: string): { name: string; value: string; options: ReturnType<typeof adminCookieOptions> } {
  return { name: ADMIN_GATE_COOKIE, value: createGateToken(userId), options: adminCookieOptions(ADMIN_TTL_SECONDS) };
}

/** The OTP row key of the admin code: never a normalised email, so it never meets the sign-in codes. */
const codeKey = (email: string) => `admin:${email}`;
const codeHash = (email: string, code: string) => hashCode(codeKey(email), code, derivedKey("admin"));

function newCode(): string {
  // the demo's fixed code is never an admin code, even by chance
  for (;;) {
    const code = generateCode();
    if (code !== DEMO_OTP_CODE) return code;
  }
}

async function ip(): Promise<string> {
  return clientIp(await headers());
}

/** Mails a fresh one-time code to the owner and sets the challenge cookie. The caller has a recognised owner. */
export async function sendAdminCode(user: UserRow, db: Db = getDb(), now: Date = new Date()): Promise<AdminCodeResult> {
  if (!isAdminEmail(user.email)) notFound();
  const limiter = getRateLimiter();
  const t = now.getTime();
  if (!limiter.hit(`admin:send:ip:${await ip()}`, 10, 3_600_000, t)) return { ok: false, message: ADMIN_MESSAGES.rate_limited };
  let mailer;
  try {
    mailer = adminMailer();
  } catch (e) {
    if (e instanceof AdminMailUnavailableError || e instanceof EnvError) {
      console.error("[admin] code not sent:", e.message);
      return { ok: false, message: e.message };
    }
    throw e;
  }
  if (!limiter.hit(`admin:send:user:${user.id}`, ADMIN_CODE_POLICY.maxPerHour, 3_600_000, t)) return { ok: false, message: ADMIN_MESSAGES.too_many };
  const key = codeKey(user.email);
  const code = newCode();
  // 0020 otp_issue: the cooldown, the hourly cap, the old code superseded and the insert — one locked step
  const issued = await db.issueOtp({
    email: key,
    mailbox: key,
    requester: "admin",
    challengeHash: null,
    codeHash: codeHash(user.email, code),
    expiresAt: new Date(t + ADMIN_CODE_POLICY.ttlMs),
    cooldownMs: ADMIN_CODE_POLICY.resendCooldownMs,
    maxPerRequester: ADMIN_CODE_POLICY.maxPerHour,
    maxPerMailbox: ADMIN_CODE_POLICY.maxPerHour,
    maxGlobal: null,
    now,
  });
  if (issued.status === "cooldown") return { ok: false, message: ADMIN_MESSAGES.cooldown };
  if (issued.status !== "ok") return { ok: false, message: ADMIN_MESSAGES.too_many };
  try {
    await mailer.sendOtp({ to: user.email, code, ttlMinutes: ADMIN_CODE_POLICY.ttlMs / 60_000, purpose: "admin" });
  } catch (e) {
    console.error("[admin] code mail failed:", (e as Error).message);
    return { ok: false, message: ADMIN_MESSAGES.mail_failed };
  }
  (await cookies()).set(ADMIN_CODE_COOKIE, createCodeToken(user.id, code, { now }), adminCookieOptions(ADMIN_CODE_TTL_SECONDS));
  await db.addAudit({ user_id: user.id, action: "admin.code_sent", target: user.email, result: "ok" });
  return { ok: true, message: ADMIN_MESSAGES.sent };
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Checks a typed code. Right → the panel cookie (wb_admin), the challenge is spent. The stored code (auth_otps) is the
 * authority: 5 wrong attempts and it is gone. On the in-memory store a serverless instance may not have seen the code
 * (another one mailed it) — only there the challenge cookie's MAC decides, under the per-user rate limit.
 */
export async function verifyAdminCode(user: UserRow, rawCode: unknown, db: Db = getDb(), now: Date = new Date()): Promise<AdminCodeResult> {
  if (!isAdminEmail(user.email)) notFound();
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  const t = now.getTime();
  const limiter = getRateLimiter();
  if (!limiter.hit(`admin:verify:user:${user.id}`, ADMIN_CODE_POLICY.maxVerifiesPer15Min, 15 * 60_000, t) || !limiter.hit(`admin:verify:ip:${await ip()}`, 30, 3_600_000, t)) {
    return { ok: false, message: ADMIN_MESSAGES.rate_limited };
  }
  const store = await cookies();
  const challenge = readCodeToken(store.get(ADMIN_CODE_COOKIE)?.value, user.id, { now });
  if (!challenge) return { ok: false, message: ADMIN_MESSAGES.no_code };
  // never the demo's sign-in code, whatever the store says
  if (code.length !== 6 || sameText(code, DEMO_OTP_CODE)) return failAttempt(db, user, ADMIN_MESSAGES.invalid);

  // 0020 otp_check: the stored code is checked against its locked row — parallel guesses are each counted
  const checked = await db.checkOtp({ email: codeKey(user.email), challengeHash: null, codeHash: codeHash(user.email, code), maxAttempts: ADMIN_CODE_POLICY.maxAttempts, now });
  if (checked.status === "expired") return { ok: false, message: ADMIN_MESSAGES.expired };
  if (checked.status === "too_many_attempts") {
    store.delete({ name: ADMIN_CODE_COOKIE, path: "/admin" });
    return failAttempt(db, user, ADMIN_MESSAGES.too_many_attempts);
  }
  if (checked.status === "invalid") return failAttempt(db, user, ADMIN_MESSAGES.invalid);
  if (checked.status === "no_code") {
    // a persistent store that has no live code: it was used, expired or blocked — the cookie alone opens nothing
    if (dataMode() !== "memory") return { ok: false, message: ADMIN_MESSAGES.no_code };
    if (!limiter.hit(`admin:verify:challenge:${challenge.exp}:${user.id}`, ADMIN_CODE_POLICY.maxAttempts, ADMIN_CODE_POLICY.ttlMs, t)) {
      return { ok: false, message: ADMIN_MESSAGES.too_many_attempts };
    }
    if (!challenge.matches(code)) return failAttempt(db, user, ADMIN_MESSAGES.invalid);
  }

  store.delete({ name: ADMIN_CODE_COOKIE, path: "/admin" });
  store.set(ADMIN_COOKIE, createAdminToken(user.id, { now }), adminCookieOptions(ADMIN_TTL_SECONDS));
  await db.addAudit({ user_id: user.id, action: "admin.login", target: user.email, result: "ok" });
  return { ok: true };
}

async function failAttempt(db: Db, user: UserRow, message: string): Promise<AdminCodeResult> {
  await db.addAudit({ user_id: user.id, action: "admin.login", target: user.email, result: "error:invalid_code" });
  return { ok: false, message };
}

/** Closes the panel (the session stays). */
export async function closeAdmin(): Promise<void> {
  const store = await cookies();
  for (const name of [ADMIN_COOKIE, ADMIN_GATE_COOKIE, ADMIN_CODE_COOKIE]) store.delete({ name, path: "/admin" });
}
