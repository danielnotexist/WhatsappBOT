import "server-only";
import { sourceFromCookieHeader } from "@/lib/admin/source";
import { getDb } from "@/lib/db";
import { DEMO_OTP_CODE, isDemo } from "@/lib/demo";
import { getMailer } from "@/lib/mail";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { referralCodeFromCookieHeader } from "@/lib/referrals/code";
import { sendOtp, verifyOtp, type OtpDeps, type OtpSendResult, type OtpVerifyResult } from "./otp";

/**
 * Wires the OTP logic to the process-wide db / mailer / limiter. Used by the route handlers and the server actions.
 * DEMO_MODE=1: the fixed code DEMO_OTP_CODE (lib/demo.ts) for every email — nothing stored, nothing mailed.
 */
function deps(headers?: Headers): OtpDeps {
  return {
    db: getDb(),
    mailer: getMailer(),
    limiter: getRateLimiter(),
    fixedCode: isDemo() ? DEMO_OTP_CODE : undefined,
    // the first-visit source of this browser (proxy.ts), kept on a user created by this sign-in
    signupSource: headers ? sourceFromCookieHeader(headers.get("cookie")) : null,
    // a friend's link opened in this browser (/r/<code>), attached to a user created by this sign-in
    referralCode: headers ? referralCodeFromCookieHeader(headers.get("cookie")) : null,
  };
}

export async function sendOtpForRequest(email: unknown, headers: Headers): Promise<OtpSendResult> {
  return sendOtp(deps(), email, clientIp(headers));
}

export async function verifyOtpForRequest(email: unknown, code: unknown, headers: Headers): Promise<OtpVerifyResult> {
  return verifyOtp(deps(headers), email, code, clientIp(headers));
}
