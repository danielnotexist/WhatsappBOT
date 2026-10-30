import { randomBytes } from "node:crypto";
import { connectCookieHeader, redirectSettingCookies, sealConnectPending } from "@/lib/auth/connect-cookie";
import { getSession } from "@/lib/auth/current-user";
import { entitlements } from "@/lib/billing/plans";
import { planGateFor, planGateUrl } from "@/lib/connections/plan-gate";
import { demoConnect } from "@/lib/auth/demo-connect";
import { oauthReturnUrl, parseReturnTo } from "@/lib/auth/oauth-return";
import { parseSsoFrom } from "@/lib/auth/sso";
import { gcopy } from "@/lib/copy/bot-google";
import { CONNECT_GUARD } from "@/lib/copy/connect-guard";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { EnvError, googleMocked, unavailable } from "@/lib/env";
import { getGoogleConfig } from "@/lib/google";
import { buildGoogleAuthorizeUrl, isGoogleFeature, pkcePair, scopesForRequest, type GoogleFeature, type RestrictedRead } from "@/lib/google/oauth";
import { startGoogleSignIn } from "@/lib/google/sso";
import { googleAccountOf, googleCapConfig, restrictedReadAccess, type GoogleCapConfig, type RestrictedReadAccess } from "@/lib/google/user-cap";
import { consumeConnectLink, verifyConnectLinkToken } from "@/lib/ms/connect-link";

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * GET /api/auth/google/start[?t=<one-time chat token>][&returnTo=onboarding|account][&feature=gmail_read|drive_read|tasks]
 *     /api/auth/google/start?intent=signin&from=start|login[&returnTo=…]
 * Who: a signed-in user (session cookie) or a one-time 30-minute link from the chat (same as Microsoft). The chat link
 * is burned here (lib/ms/connect-link.ts) and refused in a browser signed in to another account; the flow is bound to
 * this browser by a sealed cookie (lib/auth/connect-cookie.ts) that the callback requires. A plan refusal reached
 * through a chat link alone is a plain notice, never a pay link (the chat link is not a billing credential).
 * `intent=signin` without a session ("המשך עם Google" on /start and /login): Sign in with Google — the state and PKCE
 * verifier go into this browser's sealed cookie instead of a profile (lib/google/sso.ts, rules in lib/auth/sso.ts).
 * With a session the intent changes nothing: the signed-in user connects, exactly as below.
 * Stores state + PKCE verifier (+ returnTo / feature) on the user profile — works from any device — then
 * redirects to Google's consent screen. `feature=…` = incremental consent for that capability's scopes only
 * (include_granted_scopes): `gmail_read` (gmail.readonly) and `drive_read` (drive.readonly) are restricted and refused
 * when switched off (GOOGLE_GMAIL_READ_ENABLED / GOOGLE_DRIVE_READ_ENABLED=false) or when the unverified-app user cap
 * is full for this (new) Google account; `tasks` (sensitive) adds Google Tasks to a connection made before it joined
 * the base set. A plain connect adds gmail.readonly and drive.readonly while under the cap (lib/google/user-cap.ts);
 * the requested scopes and the cap decisions are stored with the state so the callback knows what was asked and why
 * (it re-checks what Google returns — keepGrantedRestrictedRead). The cap is decided for the account of the user's
 * existing Google connection (also a revoked one), and that same account is the login_hint, so the consent screen
 * opens on the account the decision was made for.
 * The plan comes first (lib/connections/plan-gate.ts): on a one-account plan (basic, the trial) Google cannot join an
 * active Microsoft 365 connection, and the pro-only consents (`drive_read`, `tasks`) are refused; both land on the
 * personal pay page with the reason. A plan without the full Drive read does not ask for drive.readonly on a plain
 * connect either.
 * DEMO_MODE=1 → no Google at all: lib/auth/demo-connect.ts writes a fixture connection and we land right away.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL || url.origin;
  const db = getDb();
  let userId: string | null = null;
  const sessionUserId = (await getSession())?.userId ?? null;
  const t = url.searchParams.get("t");
  if (t) {
    const link = verifyConnectLinkToken(t);
    if (!link || link.provider !== "google" || link.purpose !== "user") return text(gcopy["g.web.link_expired"](), 410);
    if (sessionUserId && sessionUserId !== link.userId && (await db.getUser(sessionUserId))) return text(CONNECT_GUARD.other_account, 409);
    if (!(await consumeConnectLink(db, link))) return text(CONNECT_GUARD.link_used, 410);
    userId = link.userId;
  } else {
    userId = sessionUserId;
    // "המשך עם Google" without a session: sign in / sign up and connect in one consent (lib/google/sso.ts)
    // (a session whose account is gone counts as none)
    if (url.searchParams.get("intent") === "signin" && !(userId && (await db.getUser(userId)))) return startGoogleSignIn(request, parseSsoFrom(url.searchParams.get("from")));
  }
  if (!userId) return Response.redirect(new URL("/start", appUrl).toString(), 303);
  const user = await db.getUser(userId);
  if (!user) return Response.redirect(new URL("/start", appUrl).toString(), 303);

  const featureParam = url.searchParams.get("feature");
  const feature = isGoogleFeature(featureParam) ? featureParam : null;
  const gate = await planGateFor(db, user.id, "google", feature);
  if (gate.reason) {
    // only a signed-in browser gets the personal pay link; a chat link alone gets the notice
    if (sessionUserId !== user.id) return text(gate.reason === "pro_feature" ? CONNECT_GUARD.plan_pro_feature : CONNECT_GUARD.plan_second_account, 403);
    return Response.redirect(planGateUrl(appUrl, user.id, gate.reason), 303);
  }
  const connections = await db.listConnections(user.id);
  const account = googleAccountOf(connections);
  let cfg;
  let scopes: string[];
  let gmail: RestrictedReadAccess;
  let drive: RestrictedReadAccess;
  try {
    const capCfg = googleCapConfig();
    gmail = await readAccessFor(db, account, "gmail_read", capCfg, feature === "gmail_read" || feature === "gmail_modify");
    drive = await readAccessFor(db, account, "drive_read", capCfg, feature === "drive_read");
    const refused = refusal(feature, gmail, drive);
    if (refused) return text(refused, 403);
    // DEMO_MODE without LIVE_GOOGLE: no Google — a fixture connection through the data layer, then the same landing as the callback
    if (isDemo() && googleMocked()) {
      const { notice } = await demoConnect(db, user, "google");
      return Response.redirect(oauthReturnUrl(appUrl, parseReturnTo(url.searchParams.get("returnTo")), "google", { ok: true, notice }), 303);
    }
    cfg = getGoogleConfig();
    // base connect (onboarding / reconnect): gmail.readonly and drive.readonly ride along while this account may still get them
    scopes = scopesForRequest(feature, { withGmailRead: gmail.allowed, withDriveRead: drive.allowed && entitlements(gate.plan).driveFullRead });
  } catch (e) {
    if (e instanceof EnvError) return text(unavailable("google:start", e), 503);
    throw e;
  }

  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const pendingOauth = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  await db.mergeUserProfile(user.id, {
    oauth_pending: { ...pendingOauth, google: { state, verifier, returnTo: parseReturnTo(url.searchParams.get("returnTo")), feature, scopes, gmail_read: gmail.reason, drive_read: drive.reason, via: t ? "chat" : "web", started_at: new Date().toISOString() } },
  });
  return redirectSettingCookies(buildGoogleAuthorizeUrl(cfg, { state, codeChallenge: challenge, scopes, loginHint: account }), [connectCookieHeader("google", sealConnectPending({ provider: "google", userId: user.id, state }))]);
}

/**
 * The user-cap decision for one restricted read (lib/google/user-cap.ts). Config errors surface (EnvError → 503 in
 * Hebrew). A ledger failure must not block a plain connect: it then simply goes without the read; an explicit request
 * for it reports "not available right now".
 */
async function readAccessFor(db: ReturnType<typeof getDb>, accountEmail: string | null, read: RestrictedRead, capCfg: GoogleCapConfig, explicit: boolean): Promise<RestrictedReadAccess> {
  try {
    return await restrictedReadAccess(db, accountEmail, read, capCfg);
  } catch (e) {
    console.error(`[google:start] user-cap check failed (${explicit ? `${read} request` : "base connect"}):`, (e as Error).message);
    return { allowed: false, reason: "disabled", count: null, cap: capCfg.cap };
  }
}

/** An explicit request for a restricted read this account may not have → the Hebrew line (403); otherwise null. */
function refusal(feature: GoogleFeature | null, gmail: RestrictedReadAccess, drive: RestrictedReadAccess): string | null {
  if (feature === "gmail_read" || feature === "gmail_modify") {
    if (gmail.reason === "disabled") return gcopy["g.web.feature_disabled"]();
    if (!gmail.allowed) return gcopy["g.web.gmail_read_cap_reached"]();
  }
  if (feature === "drive_read") {
    if (drive.reason === "disabled") return gcopy["g.web.drive_read_disabled"]();
    if (!drive.allowed) return gcopy["g.web.drive_read_cap_reached"]();
  }
  return null;
}
