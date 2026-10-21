import { cookies } from "next/headers";
import { verifyOtpForRequest } from "@/lib/auth/otp-service";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { EnvError } from "@/lib/env";

/**
 * POST /api/auth/otp/verify  { email, code, updates? }
 * 200 { ok: true, isNewUser, next } + httpOnly session cookie · 400/401/429 { ok: false, code, message, attemptsLeft? }.
 * `updates: true` records the opt-in to "עדכונים וטיפים" (off by default — Israeli anti-spam law, §30A) with a timestamp.
 */
export async function POST(request: Request) {
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
    store.set(SESSION_COOKIE, createSessionToken(result.userId), sessionCookieOptions());
    return Response.json(
      { ok: true, isNewUser: result.isNewUser, next: result.isNewUser ? "/start/connect" : "/account" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof EnvError) {
      return Response.json({ ok: false, code: "server_config", message: e.message, missing: e.missing }, { status: 503 });
    }
    throw e;
  }
}
