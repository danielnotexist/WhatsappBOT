import { cookies } from "next/headers";
import { demoSessionClaims } from "@/lib/auth/demo-user";
import { OTP_CHALLENGE_COOKIE } from "@/lib/auth/otp-challenge";
import { verifyOtpForRequest } from "@/lib/auth/otp-service";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { EnvError, unavailable } from "@/lib/env";
import { refuseCrossSitePost } from "@/lib/same-origin";

/**
 * POST /api/auth/otp/verify  { email, code, updates? }
 * 200 { ok: true, isNewUser, next } + httpOnly session cookie · 400/401/429 { ok: false, code, message, attemptsLeft? }.
 * Same-origin JSON only (lib/same-origin.ts refuseCrossSitePost: no login CSRF), and only the browser holding the
 * wb_otp cookie of the send may try the code (lib/auth/otp-challenge.ts).
 * `updates: true` records the opt-in to "עדכונים וטיפים" (the toggle is on by default, Daniel 21.10; it can be turned off before sending) with a timestamp.
 */
export async function POST(request: Request) {
  const refused = refuseCrossSitePost(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; code?: unknown; updates?: unknown };
  try {
    const result = await verifyOtpForRequest(body.email, body.code, request.headers);
    if (!result.ok) {
      const status = result.code === "invalid_email" ? 400 : result.code === "rate_limited" ? 429 : 401;
      return Response.json(result, { status, headers: { "cache-control": "no-store" } });
    }
    if (body.updates === true) {
      await getDb().mergeUserProfile(result.userId, { marketing_opt_in: { value: true, at: new Date().toISOString(), source: "signup_form" } });
    }
    const store = await cookies();
    store.delete({ name: OTP_CHALLENGE_COOKIE, path: "/api/auth/otp" }); // the code is spent
    // demo on the memory store: the email rides in the session so any serverless instance can recreate the user
    store.set(SESSION_COOKIE, createSessionToken(result.userId, demoSessionClaims(result.email)), sessionCookieOptions());
    return Response.json(
      { ok: true, isNewUser: result.isNewUser, next: result.isNewUser ? "/start/connect" : "/account" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof EnvError) {
      return Response.json({ ok: false, code: "server_config", message: unavailable("otp:verify", e) }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    throw e;
  }
}
