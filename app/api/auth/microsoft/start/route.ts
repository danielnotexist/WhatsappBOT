import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/current-user";
import { planGateFor, planGateUrl } from "@/lib/connections/plan-gate";
import { demoConnect } from "@/lib/auth/demo-connect";
import { oauthReturnUrl, parseReturnTo } from "@/lib/auth/oauth-return";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { EnvError, msMocked } from "@/lib/env";
import { verifyConnectLinkToken } from "@/lib/ms/connect-link";
import { getMsConfig } from "@/lib/ms";
import { buildAdminConsentUrl, buildAuthorizeUrl, pkcePair } from "@/lib/ms/oauth";

/**
 * GET /api/auth/microsoft/start[?t=<one-time chat token>][&admin=1][&returnTo=onboarding]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat.
 * Stores state + PKCE verifier on the user profile (works from any device), then redirects to Microsoft.
 * `admin=1` → tenant-wide admin consent URL instead (PLAN §8 #2).
 * `returnTo=onboarding` → the callback lands on /start/ready (signup) instead of /account (lib/auth/oauth-return.ts).
 * The plan comes first (lib/connections/plan-gate.ts): on a one-account plan (basic, the trial) Microsoft 365 cannot
 * join an active Google connection; the refusal lands on the personal pay page with the reason. The admin consent
 * (`admin=1`, opened by the IT admin) grants the tenant and connects nothing, so it is not gated.
 * DEMO_MODE=1 → no Microsoft at all: lib/auth/demo-connect.ts writes a fixture connection and we land right away.
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
  // where the callback lands: back into the signup flow or the personal area (fixed paths only — no open redirect)
  const returnTo = parseReturnTo(url.searchParams.get("returnTo"));
  const admin = url.searchParams.get("admin") === "1";
  if (!admin) {
    const gate = await planGateFor(db, user.id, "microsoft");
    if (gate.reason) return Response.redirect(planGateUrl(process.env.APP_URL || url.origin, user.id, gate.reason), 303);
  }

  // DEMO_MODE without LIVE_MS: no Microsoft — a fixture connection through the data layer, then the same landing as the callback
  if (isDemo() && msMocked()) {
    const { notice } = await demoConnect(db, user, "microsoft");
    return Response.redirect(oauthReturnUrl(process.env.APP_URL || url.origin, returnTo, "microsoft", { ok: true, notice }), 303);
  }

  let cfg;
  try {
    cfg = getMsConfig();
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const pendingOauth = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  await db.mergeUserProfile(user.id, { oauth_pending: { ...pendingOauth, microsoft: { state, verifier, admin, started_at: new Date().toISOString(), via: t ? "chat" : "web", returnTo } } });
  const dest = admin
    ? buildAdminConsentUrl(cfg, { state, redirectUri: cfg.redirectUri, tenant: url.searchParams.get("tenant") ?? "organizations" })
    : buildAuthorizeUrl(cfg, { state, codeChallenge: challenge, loginHint: user.email });
  return Response.redirect(dest, 303);
}
