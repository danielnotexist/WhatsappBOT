import { sendOtpForRequest } from "@/lib/auth/otp-service";
import { EnvError, unavailable } from "@/lib/env";

/**
 * POST /api/auth/otp/send  { email }
 * 200 { ok: true, cooldownSeconds } · 400/429 { ok: false, code, message } (Hebrew message for the UI).
 * The response is identical whether or not the email is registered (no account enumeration).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  try {
    const result = await sendOtpForRequest(body.email, request.headers);
    const status = result.ok ? 200 : result.code === "invalid_email" ? 400 : result.code === "mail_failed" ? 502 : 429;
    return Response.json(result, {
      status,
      headers: {
        "cache-control": "no-store",
        ...(!result.ok && result.retryAfterSeconds ? { "retry-after": String(result.retryAfterSeconds) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof EnvError) {
      return Response.json({ ok: false, code: "server_config", message: unavailable("otp:send", e) }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    throw e;
  }
}
