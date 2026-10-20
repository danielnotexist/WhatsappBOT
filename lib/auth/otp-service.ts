import "server-only";
import { getDb } from "@/lib/db";
import { getMailer } from "@/lib/mail";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { sendOtp, verifyOtp, type OtpSendResult, type OtpVerifyResult } from "./otp";

/** Wires the OTP logic to the process-wide db / mailer / limiter. Used by the route handlers and the server actions. */
export async function sendOtpForRequest(email: unknown, headers: Headers): Promise<OtpSendResult> {
  return sendOtp({ db: getDb(), mailer: getMailer(), limiter: getRateLimiter() }, email, clientIp(headers));
}

export async function verifyOtpForRequest(email: unknown, code: unknown, headers: Headers): Promise<OtpVerifyResult> {
  return verifyOtp({ db: getDb(), mailer: getMailer(), limiter: getRateLimiter() }, email, code, clientIp(headers));
}
