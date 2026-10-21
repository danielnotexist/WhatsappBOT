"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { consumeLoginToken } from "@/lib/auth/login-token";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/**
 * POST only: the token is burned here, never on GET — WhatsApp (and other apps) fetch links to build previews,
 * which would otherwise use up the one-time link before the person taps it.
 */
export async function loginWithTokenAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const result = await consumeLoginToken(getDb(), token);
  if (!result.ok) redirect(`/login/w/${encodeURIComponent(token)}?error=${result.reason}` as Route);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(result.userId), sessionCookieOptions());
  redirect("/account");
}
