import { reportError } from "@/lib/errors/report";
import { connectCookieMatches, withConnectCookieCleared } from "@/lib/auth/connect-cookie";
import { getSession } from "@/lib/auth/current-user";
import { normalizeEmail } from "@/lib/auth/otp";
import { CONNECT_GUARD } from "@/lib/copy/connect-guard";
import { oauthReturnUrl, parseReturnTo, type OAuthReturnTo } from "@/lib/auth/oauth-return";
import { refuseSso, ssoCallbackState } from "@/lib/auth/sso-flow";
import { gcopy } from "@/lib/copy/bot-google";
import { getDb } from "@/lib/db";
import { EnvError, unavailable } from "@/lib/env";
import { getGoogleConfig, getGoogleFetch } from "@/lib/google";
import { GoogleClient } from "@/lib/google/client";
import { storeGoogleConnection, uncountedGoogleConsent as uncounted, type GooglePendingAsk } from "@/lib/google/connect-store";
import { GoogleOAuthError, exchangeGoogleCode, parseGoogleIdToken, revokeGoogleToken, type GoogleTokens } from "@/lib/google/oauth";
import { finishGoogleSignIn } from "@/lib/google/sso";
import { getWaSender } from "@/lib/wa";

/** A pending state older than this is refused (the consent screen takes seconds; a stale tab is suspicious). */
const STATE_TTL_MS = 30 * 60_000;

interface PendingGoogle extends GooglePendingAsk {
  state?: string;
  verifier?: string;
  returnTo?: string;
  via?: string;
  started_at?: string;
}

/**
 * GET /api/auth/google/callback?code&state (or ?error=access_denied&state).
 * Sign in with Google is recognised by its cookie (lib/auth/sso.ts: the state in the URL is the one sealed in this
 * browser's `wb_sso`) and finished by lib/google/sso.ts. Otherwise — the connect flow — finds the user through the
 * single-use state, exchanges the code with the PKCE verifier, stores the connection (lib/google/connect-store.ts:
 * encrypted tokens, the granted scopes, the user-cap ledger), tells the user in WhatsApp, and redirects per `returnTo`
 * (onboarding → /start/ready, else /account). A state no one knows, in a browser that started a sign-in, is a failed
 * sign-in — never a connect.
 * Security (area C): the connect finishes only in the browser that started it (its `wb_connect_google` cookie names
 * this user and this state — lib/auth/connect-cookie.ts) and, when the browser is signed in, for that same account.
 * A connect started from a chat link in a browser that is not signed in to the account adds only the account's own
 * address (verified by Google); another mailbox needs the personal area. Every outcome clears the cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const sso = ssoCallbackState(request, "google", state);
  if (sso.pending) return finishGoogleSignIn(request, sso.pending);
  return withConnectCookieCleared(await connectCallback(request, url, state, sso), "google");
}

async function connectCallback(request: Request, url: URL, state: string, sso: ReturnType<typeof ssoCallbackState>): Promise<Response> {
  const appUrl = process.env.APP_URL || url.origin;
  const db = getDb();
  const user = state ? await db.findUserByOauthState("google", state) : null;
  if (!user) {
    if (url.searchParams.get("code")) uncounted("unknown or used state");
    if (sso.present) return refuseSso(request, sso.from, "state", { provider: "google" });
    return Response.redirect(oauthReturnUrl(appUrl, "account", "google", { ok: false, error: gcopy["g.web.state_unknown"]() }), 303);
  }

  const allPending = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  const pending = (allPending.google ?? {}) as PendingGoogle;
  await db.mergeUserProfile(user.id, { oauth_pending: { ...allPending, google: null } });
  const returnTo: OAuthReturnTo = parseReturnTo(pending.returnTo);
  const back = (outcome: { ok: true; notice: string } | { ok: false; error: string }) => Response.redirect(oauthReturnUrl(appUrl, returnTo, "google", outcome), 303);
  // bound to the browser that started it, and to the signed-in account when there is one
  const sessionUserId = (await getSession())?.userId ?? null;
  if (!connectCookieMatches(request, "google", state, user.id) || (sessionUserId && sessionUserId !== user.id)) {
    if (url.searchParams.get("code")) uncounted("connect not started in this browser", user.id);
    await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:unbound" });
    return back({ ok: false, error: CONNECT_GUARD.unbound });
  }
  if (!pending.started_at || Date.now() - Date.parse(pending.started_at) > STATE_TTL_MS) {
    if (url.searchParams.get("code")) {
      uncounted("state expired", user.id);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:state_expired" });
    }
    return back({ ok: false, error: gcopy["g.web.state_unknown"]() });
  }

  const phone = (await db.listWaIdentities(user.id)).find((w) => w.status === "active")?.phone_e164 ?? null;
  const tell = async (body: string) => {
    if (!phone) return;
    try {
      await getWaSender().sendText(phone, body);
      await db.insertMessage({ user_id: user.id, direction: "out", type: "text", text: body });
    } catch (e) {
      console.error("[google:callback] wa notify failed:", (e as Error).message);
    }
  };

  // --- the user declined, or the Workspace admin blocks the app ---
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    await db.addAudit({ user_id: user.id, action: "google.connect", result: `error:${error ?? "no_code"}` });
    if (error === "access_denied") return back({ ok: false, error: gcopy["g.web.denied"]() });
    if (error === "admin_policy_enforced" || error === "org_internal") return back({ ok: false, error: gcopy["g.web.admin_blocked"]() });
    return back({ ok: false, error: gcopy["g.web.failed"](error ?? "no_code") });
  }

  let cfg;
  try {
    cfg = getGoogleConfig();
  } catch (e) {
    if (e instanceof EnvError) return new Response(unavailable("google:callback", e), { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }

  try {
    const tokens = await exchangeGoogleCode(cfg, code, pending.verifier ?? "");
    const claims = parseGoogleIdToken(tokens.idToken);
    let email = claims.email;
    let emailVerified = claims.emailVerified;
    if (!email) {
      const info = await new GoogleClient({ getAccessToken: async () => tokens.accessToken, fetchImpl: getGoogleFetch() }).userInfo().catch(() => null);
      email = info?.email ?? null;
      emailVerified = info?.emailVerified ?? false;
    }
    if (!email) {
      uncounted("no account email", user.id);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:no_email" });
      return back({ ok: false, error: gcopy["g.web.no_email"]() });
    }
    // a chat link alone (no session of this account in the browser) adds only the account's own, verified address
    if (pending.via === "chat" && sessionUserId !== user.id && !(emailVerified && normalizeEmail(email) === normalizeEmail(user.email))) {
      uncounted("chat link with another mailbox", user.id);
      await revokeUnused(cfg, tokens);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:chat_other_mailbox" });
      return back({ ok: false, error: CONNECT_GUARD.chat_other_mailbox });
    }
    return back(await storeGoogleConnection(db, user, tokens, { email, name: claims.name, pending, appUrl, tell }));
  } catch (e) {
    if (e instanceof GoogleOAuthError) {
      uncounted(`token exchange failed: ${e.code}`, user.id);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: `token:${e.code}` });
      await reportError("oauth.google", e, { userId: user.id, context: { code: e.code } });
      if (e.adminBlocked) return back({ ok: false, error: gcopy["g.web.admin_blocked"]() });
      return back({ ok: false, error: gcopy["g.web.failed"](e.code) });
    }
    throw e;
  }
}

/** Tokens that will not be kept: revoked at Google right away (best effort — they are dropped either way). */
async function revokeUnused(cfg: ReturnType<typeof getGoogleConfig>, tokens: GoogleTokens): Promise<void> {
  await revokeGoogleToken(tokens.refreshToken ?? tokens.accessToken, cfg.fetchImpl).catch(() => undefined);
}
