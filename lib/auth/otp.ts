import { randomInt, timingSafeEqual } from "node:crypto";
import { touchLastSeen } from "@/lib/admin/activity";
import { ownerAlert } from "@/lib/admin/alerts";
import type { Db, SignupSource } from "@/lib/db/types";
import type { Mailer } from "@/lib/mail/types";
import type { RateLimiter } from "@/lib/rate-limit";
import { derivedKey, hmac } from "./keys";

/** Policy (PLAN §1): 6 digits, 10 minutes, resend after 60s, 5 wrong attempts, 5 codes per hour per email. */
export const OTP_POLICY = {
  digits: 6,
  ttlMs: 10 * 60_000,
  resendCooldownMs: 60_000,
  maxAttempts: 5,
  maxPerHourPerEmail: 5,
  maxSendsPerIpPerHour: 20,
  maxVerifiesPerIpPerHour: 60,
} as const;

export type OtpSendResult =
  | { ok: true; cooldownSeconds: number }
  | { ok: false; code: "invalid_email" | "cooldown" | "too_many" | "rate_limited" | "mail_failed"; message: string; retryAfterSeconds?: number };

export type OtpVerifyResult =
  | { ok: true; userId: string; isNewUser: boolean; email: string }
  | { ok: false; code: "invalid_email" | "invalid_code" | "expired" | "no_code" | "too_many_attempts" | "rate_limited"; message: string; attemptsLeft?: number };

export const OTP_MESSAGES = {
  invalid_email: "כתובת המייל לא נראית תקינה.",
  cooldown: "שלחנו קוד לפני רגע. אפשר לבקש קוד חדש בעוד דקה.",
  too_many: "נשלחו יותר מדי קודים לכתובת הזו. אפשר לנסות שוב בעוד שעה.",
  rate_limited: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.",
  mail_failed: "לא הצלחנו לשלוח את המייל כרגע. אפשר לנסות שוב בעוד רגע.",
  invalid_code: "הקוד לא נכון.",
  expired: "הקוד פג תוקף. אפשר לבקש קוד חדש.",
  no_code: "לא נמצא קוד פעיל לכתובת הזו. אפשר לבקש קוד חדש.",
  too_many_attempts: "יותר מדי ניסיונות שגויים. אפשר לבקש קוד חדש.",
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** lowercase + trim, as the DB CHECK constraint requires; null when not an email. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function generateCode(digits: number = OTP_POLICY.digits): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, "0");
}

/** HMAC-SHA256(email + code) with the OTP sub-key — the code itself is never stored. */
export function hashCode(email: string, code: string, key: Buffer = derivedKey("otp")): string {
  return hmac(key, `${email}:${code}`).toString("base64url");
}

export function codeMatches(email: string, code: string, storedHash: string, key?: Buffer): boolean {
  const a = Buffer.from(hashCode(email, code, key));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface OtpDeps {
  db: Db;
  mailer: Mailer;
  limiter: RateLimiter;
  now?: () => Date;
  otpKey?: Buffer;
  /**
   * DEMO_MODE only (lib/demo.ts DEMO_OTP_CODE): this code signs in any email, statelessly — nothing is stored or
   * mailed, so it works on whichever serverless instance answers. The per-IP limits (and a per-email send limit in
   * the limiter) still apply.
   */
  fixedCode?: string;
  /** where this browser first came from (lib/admin/source.ts, the alze_src cookie) — kept on a user created now */
  signupSource?: SignupSource | null;
}

export async function sendOtp(deps: OtpDeps, rawEmail: unknown, ip: string): Promise<OtpSendResult> {
  const now = deps.now?.() ?? new Date();
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, code: "invalid_email", message: OTP_MESSAGES.invalid_email };
  if (!deps.limiter.hit(`otp:send:ip:${ip}`, OTP_POLICY.maxSendsPerIpPerHour, 3_600_000, now.getTime())) {
    return { ok: false, code: "rate_limited", message: OTP_MESSAGES.rate_limited, retryAfterSeconds: 600 };
  }
  if (deps.fixedCode) {
    if (!deps.limiter.hit(`otp:send:email:${email}`, OTP_POLICY.maxPerHourPerEmail, 3_600_000, now.getTime())) {
      return { ok: false, code: "too_many", message: OTP_MESSAGES.too_many, retryAfterSeconds: 3600 };
    }
    return { ok: true, cooldownSeconds: OTP_POLICY.resendCooldownMs / 1000 };
  }

  const latest = await deps.db.latestOtp(email);
  if (latest) {
    const sinceMs = now.getTime() - Date.parse(latest.created_at);
    if (sinceMs < OTP_POLICY.resendCooldownMs) {
      const retry = Math.ceil((OTP_POLICY.resendCooldownMs - sinceMs) / 1000);
      return { ok: false, code: "cooldown", message: OTP_MESSAGES.cooldown, retryAfterSeconds: retry };
    }
  }
  const sentLastHour = await deps.db.countOtpsSince(email, new Date(now.getTime() - 3_600_000));
  if (sentLastHour >= OTP_POLICY.maxPerHourPerEmail) {
    return { ok: false, code: "too_many", message: OTP_MESSAGES.too_many, retryAfterSeconds: 3600 };
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_POLICY.ttlMs);
  // Invalidate the previous code: a new request supersedes it (one active code per email).
  if (latest) await deps.db.markOtpUsed(latest.id);
  await deps.db.createOtp(email, hashCode(email, code, deps.otpKey), expiresAt);
  try {
    await deps.mailer.sendOtp({ to: email, code, ttlMinutes: OTP_POLICY.ttlMs / 60_000 });
  } catch (e) {
    console.error("[otp] mail failed:", (e as Error).message);
    return { ok: false, code: "mail_failed", message: OTP_MESSAGES.mail_failed };
  }
  return { ok: true, cooldownSeconds: OTP_POLICY.resendCooldownMs / 1000 };
}

export async function verifyOtp(deps: OtpDeps, rawEmail: unknown, rawCode: unknown, ip: string): Promise<OtpVerifyResult> {
  const now = deps.now?.() ?? new Date();
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, code: "invalid_email", message: OTP_MESSAGES.invalid_email };
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (!deps.limiter.hit(`otp:verify:ip:${ip}`, OTP_POLICY.maxVerifiesPerIpPerHour, 3_600_000, now.getTime())) {
    return { ok: false, code: "rate_limited", message: OTP_MESSAGES.rate_limited };
  }
  if (deps.fixedCode) {
    const a = Buffer.from(code);
    const b = Buffer.from(deps.fixedCode);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: "invalid_code", message: OTP_MESSAGES.invalid_code };
    return signIn(deps, email);
  }

  const latest = await deps.db.latestOtp(email);
  if (!latest) return { ok: false, code: "no_code", message: OTP_MESSAGES.no_code };
  if (Date.parse(latest.expires_at) <= now.getTime()) {
    await deps.db.markOtpUsed(latest.id);
    return { ok: false, code: "expired", message: OTP_MESSAGES.expired };
  }
  if (latest.attempts >= OTP_POLICY.maxAttempts) {
    return { ok: false, code: "too_many_attempts", message: OTP_MESSAGES.too_many_attempts };
  }
  if (code.length !== OTP_POLICY.digits || !codeMatches(email, code, latest.code_hash, deps.otpKey)) {
    const attempts = await deps.db.incrementOtpAttempts(latest.id);
    const left = Math.max(OTP_POLICY.maxAttempts - attempts, 0);
    if (left === 0) {
      await deps.db.markOtpUsed(latest.id);
      return { ok: false, code: "too_many_attempts", message: OTP_MESSAGES.too_many_attempts, attemptsLeft: 0 };
    }
    return { ok: false, code: "invalid_code", message: OTP_MESSAGES.invalid_code, attemptsLeft: left };
  }

  await deps.db.markOtpUsed(latest.id);
  return signIn(deps, email);
}

/**
 * The code checked out: the existing user (login) or a new one (signup), audited either way. A new user keeps the
 * browser's first-visit source and the owner is told (lib/admin/alerts.ts, after the response); both mark "last seen".
 * Those are best effort (the admin panel's data): a failure there never fails the sign-in.
 */
async function signIn(deps: OtpDeps, email: string): Promise<OtpVerifyResult> {
  const db = deps.db;
  let user = await db.findUserByEmail(email);
  let isNewUser = false;
  if (!user) {
    user = await db.createUser(email);
    isNewUser = true;
    await db.addAudit({ user_id: user.id, action: "signup", target: email, result: "ok" });
    if (deps.signupSource) {
      await db.setSignupSource(user.id, deps.signupSource).catch((e: unknown) => console.warn("[otp] signup source not recorded:", (e as Error).message));
    }
    ownerAlert({ type: "signup", userId: user.id, email, name: user.name, business: user.business_name, source: deps.signupSource ?? null }, { db });
  } else {
    await db.addAudit({ user_id: user.id, action: "login", target: email, result: "ok" });
  }
  await touchLastSeen(db, user.id, deps.now?.() ?? new Date());
  return { ok: true, userId: user.id, isNewUser, email };
}
