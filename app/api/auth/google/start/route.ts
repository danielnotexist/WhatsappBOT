import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/current-user";
import { demoConnect } from "@/lib/auth/demo-connect";
import { oauthReturnUrl, parseReturnTo } from "@/lib/auth/oauth-return";
import { gcopy } from "@/lib/copy/bot-google";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { EnvError, googleMocked } from "@/lib/env";
import { getGoogleConfig } from "@/lib/google";
import { buildGoogleAuthorizeUrl, isGoogleFeature, pkcePair, scopesForRequest } from "@/lib/google/oauth";
import { gmailReadAccess, googleAccountOf, googleCapConfig, type GmailReadAccess } from "@/lib/google/user-cap";
import { verifyConnectLinkToken } from "@/lib/ms/connect-link";

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * GET /api/auth/google/start[?t=<one-time chat token>][&returnTo=onboarding|account][&feature=gmail_read]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat (same as Microsoft).
 * Stores state + PKCE verifier (+ returnTo / feature) on the user profile — works from any device — then
 * redirects to Google's consent screen. `feature=gmail_read` = incremental consent for gmail.readonly only
 * (include_granted_scopes); refused when GOOGLE_GMAIL_READ_ENABLED=false or when the unverified-app user cap is
 * full for this (new) Google account. A plain connect adds gmail.readonly while under the cap
 * (lib/google/user-cap.ts); the requested scopes and the cap decision are stored with the state so the callback
 * knows what was asked and why (it re-checks what Google returns — keepGrantedGmailRead). The cap is decided for
 * the account of the user's existing Google connection (also a revoked one), and that same account is the
 * login_hint, so the consent screen opens on the account the decision was made for.
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
  const connections = await db.listConnections(user.id);
  const account = googleAccountOf(connections);
  let cfg;
  let scopes: string[];
  let access: GmailReadAccess;
  try {
    access = await gmailAccessFor(db, account, Boolean(feature));
    if (feature && access.reason === "disabled") return text(gcopy["g.web.feature_disabled"](), 403);
    if (feature && !access.allowed) return text(gcopy["g.web.gmail_read_cap_reached"](), 403);
    // DEMO_MODE without LIVE_GOOGLE: no Google — a fixture connection through the data layer, then the same landing as the callback
    if (isDemo() && googleMocked()) {
      const { notice } = await demoConnect(db, user, "google");
      return Response.redirect(oauthReturnUrl(appUrl, parseReturnTo(url.searchParams.get("returnTo")), "google", { ok: true, notice }), 303);
    }
    cfg = getGoogleConfig();
    // base connect (onboarding / reconnect): gmail.readonly rides along while this account may still get it
    scopes = scopesForRequest(feature, { withGmailRead: access.allowed });
  } catch (e) {
    if (e instanceof EnvError) return text(e.message, 503);
    throw e;
  }

  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const pendingOauth = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  await db.mergeUserProfile(user.id, {
    oauth_pending: { ...pendingOauth, google: { state, verifier, returnTo: parseReturnTo(url.searchParams.get("returnTo")), feature, scopes, gmail_read: access.reason, via: t ? "chat" : "web", started_at: new Date().toISOString() } },
  });
  return Response.redirect(buildGoogleAuthorizeUrl(cfg, { state, codeChallenge: challenge, scopes, loginHint: account }), 303);
}

/**
 * The user-cap decision (lib/google/user-cap.ts). Config errors surface (EnvError → 503 in Hebrew). A ledger
 * failure must not block a plain connect: it then simply goes without gmail.readonly; an explicit Gmail-read
 * request reports "not available right now".
 */
async function gmailAccessFor(db: ReturnType<typeof getDb>, accountEmail: string | null, explicit: boolean): Promise<GmailReadAccess> {
  const capCfg = googleCapConfig();
  try {
    return await gmailReadAccess(db, accountEmail, capCfg);
  } catch (e) {
    console.error(`[google:start] user-cap check failed (${explicit ? "gmail_read request" : "base connect"}):`, (e as Error).message);
    return { allowed: false, reason: "disabled", count: null, cap: capCfg.cap };
  }
}
