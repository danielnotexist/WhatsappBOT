import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/current-user";
import { planGateFor, planGateUrl } from "@/lib/connections/plan-gate";
import { demoConnect } from "@/lib/auth/demo-connect";
import { oauthReturnUrl, parseReturnTo } from "@/lib/auth/oauth-return";
import { parseSsoFrom } from "@/lib/auth/sso";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { EnvError, msMocked } from "@/lib/env";
import { verifyConnectLinkToken } from "@/lib/ms/connect-link";
import { getMsConfig } from "@/lib/ms";
import { buildAdminConsentUrl, buildAuthorizeUrl, msAdminScopesFor, msScopesFor, pkcePair } from "@/lib/ms/oauth";
import { startMicrosoftSignIn } from "@/lib/ms/sso";
import { entitlements } from "@/lib/billing/plans";

/**
 * GET /api/auth/microsoft/start[?t=<one-time chat token>][&admin=1][&returnTo=onboarding]
 *     /api/auth/microsoft/start?intent=signin&from=start|login[&returnTo=…]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat.
 * `intent=signin` without a session ("המשך עם Microsoft" on /start and /login): Sign in with Microsoft — the state and
 * PKCE verifier go into this browser's sealed cookie instead of a profile (lib/ms/sso.ts, rules in lib/auth/sso.ts).
 * With a session the intent changes nothing: the signed-in user connects, exactly as below.
 * Stores state + PKCE verifier on the user profile (works from any device), then redirects to Microsoft.
 * `admin=1` → tenant-wide admin consent URL instead (PLAN §8 #2).
 * `returnTo=onboarding` → the callback lands on /start/ready (signup) instead of /account (lib/auth/oauth-return.ts).
 * The plan comes first (lib/connections/plan-gate.ts): on a one-account plan (basic, the trial) Microsoft 365 cannot
 * join an active Google connection; the refusal lands on the personal pay page with the reason. The admin consent
 * (`admin=1`, opened by the IT admin) grants the tenant and connects nothing, so it is not gated.
 * Pro (entitlements.meetingSummaries) also asks for the Teams transcript pair (MS_MEETING_SCOPES), in both the user's
 * and the admin's consent; when only that part needs an admin, the callback connects again without it.
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
    // "המשך עם Microsoft" without a session: sign in / sign up and connect in one consent (lib/ms/sso.ts)
    // (a session whose account is gone counts as none)
    if (url.searchParams.get("intent") === "signin" && !(userId && (await db.getUser(userId)))) return startMicrosoftSignIn(request, parseSsoFrom(url.searchParams.get("from")));
  }
  if (!userId) return Response.redirect(new URL("/start", process.env.APP_URL || url.origin).toString(), 303);
  const user = await db.getUser(userId);
  if (!user) return Response.redirect(new URL("/start", process.env.APP_URL || url.origin).toString(), 303);
  // where the callback lands: back into the signup flow or the personal area (fixed paths only — no open redirect)
  const returnTo = parseReturnTo(url.searchParams.get("returnTo"));
  const admin = url.searchParams.get("admin") === "1";
  const gate = await planGateFor(db, user.id, "microsoft");
  if (!admin && gate.reason) return Response.redirect(planGateUrl(process.env.APP_URL || url.origin, user.id, gate.reason), 303);
  // pro: the Teams meeting transcripts too (meeting summaries, lib/meetings) — in the user's consent and in the admin's
  const meetings = entitlements(gate.plan).meetingSummaries;

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
  await db.mergeUserProfile(user.id, { oauth_pending: { ...pendingOauth, microsoft: { state, verifier, admin, meetings, started_at: new Date().toISOString(), via: t ? "chat" : "web", returnTo } } });
  const dest = admin
    ? buildAdminConsentUrl(cfg, { state, redirectUri: cfg.redirectUri, tenant: url.searchParams.get("tenant") ?? "organizations", scopes: msAdminScopesFor({ meetings }) })
    : buildAuthorizeUrl(cfg, { state, codeChallenge: challenge, loginHint: user.email, scopes: msScopesFor({ meetings }) });
  return Response.redirect(dest, 303);
}
