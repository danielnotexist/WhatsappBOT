import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Db, SignupSource } from "@/lib/db/types";
import type { Mailer } from "@/lib/mail/types";
import type { RateLimiter } from "@/lib/rate-limit";
import { derivedKey, hmac } from "./keys";
import { signInVerifiedEmail } from "./sign-in";

/**
 * Policy (PLAN §1): 6 digits, 10 minutes, resend after 60s, 5 wrong attempts, 5 codes per hour per email — per requester
 * (IP, IPv6 /64) so a stranger cannot use up the owner's hour, with a per-mailbox backstop of 10 and a global hourly
 * ceiling that keeps the mail quota for real sign-ins. All in one SQL step (0020 otp_issue / otp_check).
 */
export const OTP_POLICY = {
  digits: 6,
  ttlMs: 10 * 60_000,
  resendCooldownMs: 60_000,
  maxAttempts: 5,
  maxPerHourPerEmail: 5,
  maxPerHourPerMailbox: 10,
  maxPerHourGlobal: 150,
  maxSendsPerIpPerHour: 20,
  maxVerifiesPerIpPerHour: 60,
} as const;

export type OtpSendResult =
  /** `challenge`: the browser-bound secret for the wb_otp cookie (lib/auth/otp-challenge.ts) — never in a response body */
  | { ok: true; cooldownSeconds: number; challenge?: string }
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

/**
 * The local part is RFC 5322 atext (dots between): no ':' etc. — so a sign-in address can never be an internal key like
 * the admin code's `admin:<email>` (lib/admin/auth.ts).
 */
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[^\s@:]+\.[^\s@:]{2,}$/;

/** lowercase + trim, as the DB CHECK constraint requires; null when not an email. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * The mailbox an address delivers to, for the send caps: no "+tag", and for Gmail no dots (and googlemail → gmail),
 * so dana+1@, dana+2@ and d.ana@gmail.com share one budget. Only for counting — the code goes to the address as typed.
 */
export function mailboxKey(email: string): string {
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/** Who asks, for the per-requester cooldown and cap: an HMAC of the IP (never the IP itself). */
export function requesterKey(ip: string, key: Buffer = derivedKey("otp")): string {
  return hmac(key, `requester:${ip}`).toString("base64url").slice(0, 32);
}

/** The challenge cookie's value → what auth_otps.challenge_hash stores. */
export function challengeHash(challenge: string): string {
  return createHash("sha256").update(`otp-challenge:${challenge}`).digest("base64url");
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
  /** verify: the wb_otp cookie of this browser (set by the send that mailed the code) */
  challenge?: string | null;
  /** where this browser first came from (lib/admin/source.ts, the alze_src cookie) — kept on a user created now */
  signupSource?: SignupSource | null;
  /** a friend's code from /r/<code> (the alze_ref cookie, lib/referrals) — attached to a user created now */
  referralCode?: string | null;
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

  const code = generateCode();
  const challenge = randomBytes(24).toString("base64url");
  const issued = await deps.db.issueOtp({
    email,
    mailbox: mailboxKey(email),
    requester: requesterKey(ip, deps.otpKey),
    challengeHash: challengeHash(challenge),
    codeHash: hashCode(email, code, deps.otpKey),
    expiresAt: new Date(now.getTime() + OTP_POLICY.ttlMs),
    cooldownMs: OTP_POLICY.resendCooldownMs,
    maxPerRequester: OTP_POLICY.maxPerHourPerEmail,
    maxPerMailbox: OTP_POLICY.maxPerHourPerMailbox,
    maxGlobal: OTP_POLICY.maxPerHourGlobal,
    now,
  });
  if (issued.status === "cooldown") return { ok: false, code: "cooldown", message: OTP_MESSAGES.cooldown, retryAfterSeconds: issued.retryAfterSeconds };
  if (issued.status === "too_many") return { ok: false, code: "too_many", message: OTP_MESSAGES.too_many, retryAfterSeconds: issued.retryAfterSeconds };
  if (issued.status === "busy") {
    console.error("[otp] the global hourly ceiling of sign-in codes was reached");
    return { ok: false, code: "rate_limited", message: OTP_MESSAGES.rate_limited, retryAfterSeconds: issued.retryAfterSeconds };
  }
  try {
    await deps.mailer.sendOtp({ to: email, code, ttlMinutes: OTP_POLICY.ttlMs / 60_000 });
  } catch (e) {
    console.error("[otp] mail failed:", (e as Error).message);
    return { ok: false, code: "mail_failed", message: OTP_MESSAGES.mail_failed };
  }
  return { ok: true, cooldownSeconds: OTP_POLICY.resendCooldownMs / 1000, challenge };
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

  // only the browser that asked for the code may try it (the wb_otp cookie): a stranger's guesses never burn it
  if (!deps.challenge) return { ok: false, code: "no_code", message: OTP_MESSAGES.no_code };
  const checked = await deps.db.checkOtp({
    email,
    challengeHash: challengeHash(deps.challenge),
    // a malformed code is still checked (and counted): its hash never matches a 6-digit code
    codeHash: hashCode(email, code, deps.otpKey),
    maxAttempts: OTP_POLICY.maxAttempts,
    now,
  });
  switch (checked.status) {
    case "ok":
      return signIn(deps, email);
    case "no_code":
      return { ok: false, code: "no_code", message: OTP_MESSAGES.no_code };
    case "expired":
      return { ok: false, code: "expired", message: OTP_MESSAGES.expired };
    case "too_many_attempts":
      return { ok: false, code: "too_many_attempts", message: OTP_MESSAGES.too_many_attempts, attemptsLeft: 0 };
    default:
      return { ok: false, code: "invalid_code", message: OTP_MESSAGES.invalid_code, attemptsLeft: checked.attemptsLeft };
  }
}

/** The code checked out: the shared sign-in (lib/auth/sign-in.ts) — signup or login, audited, source, referral, alerts. */
async function signIn(deps: OtpDeps, email: string): Promise<OtpVerifyResult> {
  const { user, isNewUser } = await signInVerifiedEmail(deps, email, "otp");
  return { ok: true, userId: user.id, isNewUser, email };
}
