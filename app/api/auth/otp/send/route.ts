import { otpChallengeCookieHeader } from "@/lib/auth/otp-challenge";
import { sendOtpForRequest } from "@/lib/auth/otp-service";
import { EnvError, unavailable } from "@/lib/env";
import { refuseCrossSitePost } from "@/lib/same-origin";

/**
 * POST /api/auth/otp/send  { email }
 * 200 { ok: true, cooldownSeconds } · 400/429 { ok: false, code, message } (Hebrew message for the UI).
 * Same-origin JSON only (lib/same-origin.ts). A code that was sent comes with the wb_otp cookie: only this browser
 * may try it (lib/auth/otp-challenge.ts).
 * The response is identical whether or not the email is registered (no account enumeration).
 */
export async function POST(request: Request) {
  const refused = refuseCrossSitePost(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  try {
    const result = await sendOtpForRequest(body.email, request.headers);
    const status = result.ok ? 200 : result.code === "invalid_email" ? 400 : result.code === "mail_failed" ? 502 : 429;
    const headers = new Headers({ "cache-control": "no-store" });
    if (!result.ok && result.retryAfterSeconds) headers.set("retry-after", String(result.retryAfterSeconds));
    if (result.ok) {
      const { challenge, ...pub } = result;
      if (challenge) headers.append("set-cookie", otpChallengeCookieHeader(challenge));
      return Response.json(pub, { status, headers });
    }
    return Response.json(result, { status, headers });
  } catch (e) {
    if (e instanceof EnvError) {
      return Response.json({ ok: false, code: "server_config", message: unavailable("otp:send", e) }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    throw e;
  }
}
