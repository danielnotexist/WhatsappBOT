import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/current-user";
import { demoConnect } from "@/lib/auth/demo-connect";
import { oauthReturnUrl, parseReturnTo } from "@/lib/auth/oauth-return";
import { gcopy } from "@/lib/copy/bot-google";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { EnvError } from "@/lib/env";
import { getGoogleConfig } from "@/lib/google";
import { buildGoogleAuthorizeUrl, gmailReadEnabled, isGoogleFeature, pkcePair, scopesForRequest } from "@/lib/google/oauth";
import { verifyConnectLinkToken } from "@/lib/ms/connect-link";

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * GET /api/auth/google/start[?t=<one-time chat token>][&returnTo=onboarding|account][&feature=gmail_read]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat (same as Microsoft).
 * Stores state + PKCE verifier (+ returnTo / feature) on the user profile — works from any device — then
 * redirects to Google's consent screen. `feature` = incremental consent for a restricted scope; refused while
 * GOOGLE_GMAIL_READ_ENABLED=false (CASA not done).
 * DEMO_MODE=1 → no Google at all: lib/auth/demo-connect.ts writes a fixture connection and we land right away.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL || url.origin;
  const db = getDb();
  let userId: string | null = null;
  const t = url.searchParams.get("t");
  if (t) {
    const link = verifyConnectLinkToken(t);
    if (!link || link.provider !== "google") return text(gcopy["g.web.link_expired"](), 410);
    userId = link.userId;
  } else {
    userId = (await getSession())?.userId ?? null;
  }
  if (!userId) return Response.redirect(new URL("/start", appUrl).toString(), 303);
  const user = await db.getUser(userId);
  if (!user) return Response.redirect(new URL("/start", appUrl).toString(), 303);

  const featureParam = url.searchParams.get("feature");
  const feature = isGoogleFeature(featureParam) ? featureParam : null;
  let cfg;
  try {
    if (feature && !gmailReadEnabled()) return text(gcopy["g.web.feature_disabled"](), 403);
    // DEMO_MODE: no Google — a fixture connection through the data layer, then the same landing as the callback
    if (isDemo()) {
      const { notice } = await demoConnect(db, user, "google");
      return Response.redirect(oauthReturnUrl(appUrl, parseReturnTo(url.searchParams.get("returnTo")), "google", { ok: true, notice }), 303);
    }
    cfg = getGoogleConfig();
  } catch (e) {
    if (e instanceof EnvError) return text(e.message, 503);
    throw e;
  }

  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const existing = (await db.listConnections(user.id)).find((c) => c.provider === "google" && c.status !== "revoked");
  const pendingOauth = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  await db.mergeUserProfile(user.id, {
    oauth_pending: { ...pendingOauth, google: { state, verifier, returnTo: parseReturnTo(url.searchParams.get("returnTo")), feature, via: t ? "chat" : "web", started_at: new Date().toISOString() } },
  });
  return Response.redirect(buildGoogleAuthorizeUrl(cfg, { state, codeChallenge: challenge, scopes: scopesForRequest(feature), loginHint: existing?.account_email ?? null }), 303);
}
