import { readCookie } from "./sso";

/**
 * The email code's browser binding (security round, area B): the send that mails a code sets wb_otp to a random
 * secret, and only a verify that carries it may try the code (auth_otps.challenge_hash, 0020 otp_check). A stranger who
 * knows the address can neither guess against it nor burn it with wrong guesses. 10 minutes, like the code; path
 * /api/auth/otp only (the send and verify routes), httpOnly, SameSite=Lax (the SSO callback sets it on a redirect).
 */
export const OTP_CHALLENGE_COOKIE = "wb_otp";
const PATH = "/api/auth/otp";
const MAX_AGE = 10 * 60;

export function otpChallengeCookieHeader(challenge: string, secure: boolean = process.env.NODE_ENV === "production"): string {
  return `${OTP_CHALLENGE_COOKIE}=${challenge}; Path=${PATH}; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The challenge this request carries (null when absent or not the shape we mint). */
export function otpChallengeFrom(headers: Headers): string | null {
  const v = readCookie(headers.get("cookie"), OTP_CHALLENGE_COOKIE);
  return v && /^[A-Za-z0-9_-]{32}$/.test(v) ? v : null;
}
