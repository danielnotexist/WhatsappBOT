"use server";

import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendOtpForRequest, verifyOtpForRequest } from "@/lib/auth/otp-service";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { EnvError } from "@/lib/env";

/** Builds a typed route with a query string (typedRoutes rejects template strings). */
function to(path: "/start" | "/start/code", params: Record<string, string | undefined>): Route {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return (s ? `${path}?${s}` : path) as Route;
}

/** Step 1: email → code sent → /start/code */
export async function requestCodeAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  try {
    const result = await sendOtpForRequest(email, await headers());
    if (!result.ok) redirect(to("/start", { email, error: result.message }));
    redirect(to("/start/code", { email: email.trim().toLowerCase() }));
  } catch (e) {
    if (e instanceof EnvError) redirect(to("/start", { email, error: e.message }));
    throw e;
  }
}

/** Step 2: code → session cookie → /start/connect (new) or /account (returning) */
export async function verifyCodeAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  try {
    const result = await verifyOtpForRequest(email, code, await headers());
    if (!result.ok) {
      const dest = result.code === "expired" || result.code === "no_code" || result.code === "too_many_attempts" ? "/start" : "/start/code";
      redirect(to(dest, { email, error: result.message }));
    }
    const store = await cookies();
    store.set(SESSION_COOKIE, createSessionToken(result.userId), sessionCookieOptions());
    redirect(result.isNewUser ? "/start/connect" : "/account");
  } catch (e) {
    if (e instanceof EnvError) redirect(to("/start", { email, error: e.message }));
    throw e;
  }
}
