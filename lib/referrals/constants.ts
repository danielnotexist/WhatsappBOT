/**
 * "חבר מביא חבר" (round 3): the numbers, in one place. Dependency-free (proxy-safe, client-safe).
 */

/** One free month for each side = the next charge moves this many days (on the annual cycle too). */
export const REFERRAL_FREE_DAYS = 30;
/** A referrer earns at most this many free months in any 365 days; past it the friend still gets theirs. */
export const REFERRAL_CAP_PER_YEAR = 12;

/** The first-party cookie /r/<code> sets: the code, for the sign-up of this browser. */
export const REFERRAL_COOKIE = "alze_ref";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 3600;

/** Codes are upper-case, without the characters that look alike (0/O, 1/I/L). */
export const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 7;
export const REFERRAL_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,12}$/;
