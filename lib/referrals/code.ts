import { randomInt } from "node:crypto";
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH, REFERRAL_CODE_RE, REFERRAL_COOKIE } from "./constants";

/**
 * The personal code of "חבר מביא חבר": 7 characters from an alphabet without look-alikes (no 0/O, 1/I/L) — easy to
 * read aloud and to type from a screenshot, 31^7 ≈ 27 billion codes. The database keeps it unique (referral_codes,
 * migration 0018); a collision is simply retried with a new one (Db.ensureReferralCode).
 */
export function generateReferralCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) out += REFERRAL_ALPHABET[rand(REFERRAL_ALPHABET.length)];
  return out;
}

/** A code as typed or carried in a URL / cookie: trimmed, upper-case, and only when it is one of ours. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

/** https://<site>/r/<code> */
export function referralLinkFor(appUrl: string, code: string): string {
  return new URL(`/r/${encodeURIComponent(code)}`, appUrl).toString();
}

/** The code from a Cookie request header (the sign-in route), or null. */
export function referralCodeFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === REFERRAL_COOKIE) {
      try {
        return normalizeReferralCode(decodeURIComponent(part.slice(i + 1).trim()));
      } catch {
        return null;
      }
    }
  }
  return null;
}
