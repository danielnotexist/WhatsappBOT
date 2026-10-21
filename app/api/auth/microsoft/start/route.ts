import { randomBytes } from "node:crypto";
import { parseReturnTo } from "@/lib/auth/oauth-return";
import { getSession } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { EnvError } from "@/lib/env";
import { verifyConnectLinkToken } from "@/lib/ms/connect-link";
import { getMsConfig } from "@/lib/ms";
import { buildAdminConsentUrl, buildAuthorizeUrl, pkcePair } from "@/lib/ms/oauth";

/**
 * GET /api/auth/microsoft/start[?t=<one-time chat token>][&admin=1][&returnTo=onboarding]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat.
 * Stores state + PKCE verifier on the user profile (works from any device), then redirects to Microsoft.
 * `admin=1` → tenant-wide admin consent URL instead (PLAN §8 #2).
 * `returnTo=onboarding` → the callback lands on /start/ready (signup) instead of /account (lib/auth/oauth-return.ts).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = getDb();
  let userId: string | null = null;
  const t = url.searchParams.get("t");
  if (t) {
    const link = verifyConnectLinkToken(t);
    if (!link || link.provider !== "microsoft") return new Response("הקישור לא בתוקף (הוא עובד 30 דקות ופעם אחת). אפשר לבקש קישור חדש בשיחה.", { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } });
    userId = link.userId;
  } else {
    userId = (await getSession())?.userId ?? null;
  }
  if (!userId) return Response.redirect(new URL("/start", process.env.APP_URL || url.origin).toString(), 303);
  const user = await db.getUser(userId);
  if (!user) return Response.redirect(new URL("/start", process.env.APP_URL || url.origin).toString(), 303);

  let cfg;
  try {
    cfg = getMsConfig();
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const admin = url.searchParams.get("admin") === "1";
  // where the callback lands: back into the signup flow or the personal area (fixed paths only — no open redirect)
  const returnTo = parseReturnTo(url.searchParams.get("returnTo"));
  const pendingOauth = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  await db.mergeUserProfile(user.id, { oauth_pending: { ...pendingOauth, microsoft: { state, verifier, admin, started_at: new Date().toISOString(), via: t ? "chat" : "web", returnTo } } });
  const dest = admin
    ? buildAdminConsentUrl(cfg, { state, redirectUri: cfg.redirectUri, tenant: url.searchParams.get("tenant") ?? "organizations" })
    : buildAuthorizeUrl(cfg, { state, codeChallenge: challenge, loginHint: user.email });
  return Response.redirect(dest, 303);
}
