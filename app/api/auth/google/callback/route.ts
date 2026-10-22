import { oauthReturnUrl, parseReturnTo, type OAuthReturnTo } from "@/lib/auth/oauth-return";
import { GOOGLE_CAPABILITY_SCOPES, gcopy } from "@/lib/copy/bot-google";
import { getDb } from "@/lib/db";
import { EnvError } from "@/lib/env";
import { getGoogleConfig, getGoogleFetch } from "@/lib/google";
import { GoogleClient } from "@/lib/google/client";
import { GOOGLE_SCOPES, GoogleOAuthError, exchangeGoogleCode, hasScope, isGoogleFeature, missingScopes, parseGoogleIdToken, scopesForRequest } from "@/lib/google/oauth";
import { sealGoogleTokens, storedGoogleRefreshToken } from "@/lib/google/token-store";
import { googleConnectShowsUnverified, keepGrantedGmailRead, recordGoogleGrants, type GmailReadKeep } from "@/lib/google/user-cap";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { getWaSender } from "@/lib/wa";

/** A pending state older than this is refused (the consent screen takes seconds; a stale tab is suspicious). */
const STATE_TTL_MS = 30 * 60_000;

interface PendingGoogle {
  state?: string;
  verifier?: string;
  returnTo?: string;
  feature?: string | null;
  /** the scopes the start route requested */
  scopes?: unknown[];
  /** the start route's user-cap decision (GmailReadAccess.reason): "already_counted" | "under_cap" | "disabled" | "cap_reached" */
  gmail_read?: string;
  via?: string;
  started_at?: string;
}

/**
 * GET /api/auth/google/callback?code&state (or ?error=access_denied&state).
 * Finds the user through the single-use state, exchanges the code with the PKCE verifier, stores the encrypted
 * tokens and the granted scopes (granular consent → maybe fewer than requested), tells the user in WhatsApp,
 * and redirects per `returnTo` (onboarding → /start/ready, else /account).
 * gmail.readonly is stored only when keepGrantedGmailRead allows it (feature on, and asked for within the cap or the
 * account was already counted) — the scope list in the consent URL is not trusted. Google's grant is recorded in
 * the user-cap ledger as soon as the account is known, before any later step can fail: Google counted it already.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL || url.origin;
  const db = getDb();
  const state = url.searchParams.get("state") ?? "";
  const user = state ? await db.findUserByOauthState("google", state) : null;
  if (!user) {
    if (url.searchParams.get("code")) uncounted("unknown or used state");
    return Response.redirect(oauthReturnUrl(appUrl, "account", "google", { ok: false, error: gcopy["g.web.state_unknown"]() }), 303);
  }

  const allPending = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  const pending = (allPending.google ?? {}) as PendingGoogle;
  await db.mergeUserProfile(user.id, { oauth_pending: { ...allPending, google: null } });
  const returnTo: OAuthReturnTo = parseReturnTo(pending.returnTo);
  const back = (outcome: { ok: true; notice: string } | { ok: false; error: string }) => Response.redirect(oauthReturnUrl(appUrl, returnTo, "google", outcome), 303);
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
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }

  try {
    const tokens = await exchangeGoogleCode(cfg, code, pending.verifier ?? "");
    const claims = parseGoogleIdToken(tokens.idToken);
    let email = claims.email;
    if (!email) email = (await new GoogleClient({ getAccessToken: async () => tokens.accessToken, fetchImpl: getGoogleFetch() }).userInfo().catch(() => null))?.email ?? null;
    if (!email) {
      uncounted("no account email", user.id);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:no_email" });
      return back({ ok: false, error: gcopy["g.web.no_email"]() });
    }

    const feature = isGoogleFeature(pending.feature) ? pending.feature : null;
    // what was asked (stored by the start route — the cap may have moved since); older states: the static set
    const stored = Array.isArray(pending.scopes) ? pending.scopes.filter((s): s is string => typeof s === "string") : [];
    const requested = stored.length ? stored : scopesForRequest(feature);
    // may this connection keep gmail.readonly? (decided before the grant below makes the account "counted")
    const gmailRead = await keepGrantedGmailRead(db, { accountEmail: email, granted: tokens.scope, requested, startReason: pending.gmail_read });
    // Google's unverified-app user cap counts this account from now on (lib/google/user-cap.ts) — recorded first,
    // with what Google really granted (also a gmail.readonly we do not keep: Google counted it), best effort
    await recordGoogleGrants(db, { userId: user.id, accountEmail: email, granted: tokens.scope }).catch((e) => console.error("[google:callback] user-cap ledger failed:", (e as Error).message));
    const dropped = !gmailRead.keep && gmailRead.reason !== "not_granted";
    const scopes = dropped ? tokens.scope.filter((s) => s !== GOOGLE_SCOPES.gmailReadonly) : tokens.scope;
    if (dropped) {
      console.warn(`[google:callback] gmail.readonly granted but not kept (${gmailRead.reason}) for user ${user.id}`);
      await db.addAudit({ user_id: user.id, action: "google.gmail_read_not_kept", target: email, result: gmailRead.reason });
    }

    // prompt=consent normally returns a new refresh token; if Google omits it on a re-consent, keep the stored one
    const existing = (await db.listConnections(user.id)).find((c) => c.provider === "google" && c.account_email === email);
    const refreshToken = tokens.refreshToken ?? (existing ? await storedGoogleRefreshToken(db, existing).catch(() => null) : null);
    const connection = await db.upsertConnection({ user_id: user.id, provider: "google", account_email: email, tenant_id: null, scopes, consent_type: "user", ...sealGoogleTokens(user.id, { ...tokens, refreshToken }) });

    // gmail.readonly riding along a plain connect is optional: unticking it is a choice, not a failed connect
    const optional: string[] = feature ? [] : [GOOGLE_SCOPES.gmailReadonly];
    // what the user did not tick (a gmail.readonly we did not keep WAS ticked — see `refused` below)
    const missing = missingScopes(tokens.scope, requested).filter((s) => GOOGLE_CAPABILITY_SCOPES.includes(s) && !optional.includes(s));
    const gmailReadDeclined = !feature && requested.includes(GOOGLE_SCOPES.gmailReadonly) && !hasScope(tokens.scope, GOOGLE_SCOPES.gmailReadonly);
    // the user asked for Gmail reading and ticked it, but it is not available to this account (cap / off)
    const refused = dropped && requested.includes(GOOGLE_SCOPES.gmailReadonly) ? gmailRead.reason : null;
    await db.addAudit({ user_id: user.id, action: "google.connect", target: email, result: missing.length ? `partial:${missing.join(" ")}` : refused ? `ok:gmail_read_refused:${refused}` : feature ? `ok:${feature}` : gmailReadDeclined ? "ok:gmail_read_declined" : "ok" });
    if (!user.name && claims.name) await db.updateUserProfile(user.id, { name: claims.name });
    if (!refreshToken) console.warn(`[google:callback] no refresh token for connection ${connection.id} - the user will need to reconnect when the access token expires`);

    await tell(gcopy["g.connect_done"](email, scopes, { gmailReadDeclined }));
    if (refused) await tell(refused === "cap_reached" ? gcopy["g.err.gmail_read_cap_reached"]() : gcopy["g.err.gmail_read_unavailable"]());
    if (missing.length) {
      const retry = new URL(`/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "google"))}${feature ? `&feature=${feature}` : ""}`, appUrl).toString();
      const headsUp = await googleConnectShowsUnverified(db, await db.listConnections(user.id));
      await tell(`${gcopy["g.connect_partial"](missing, retry)}${headsUp ? `\n${gcopy["g.unverified_heads_up"]()}` : ""}`);
    }
    if (missing.length) return back({ ok: true, notice: gcopy["g.web.connected_partial"](email, missing) });
    // an explicit Gmail-read consent that we could not keep: say so (the rest of the connection is unchanged)
    if (feature && refused) return back({ ok: false, error: refusedNotice(refused) });
    return back({ ok: true, notice: gcopy["g.web.connected"](email) });
  } catch (e) {
    if (e instanceof GoogleOAuthError) {
      uncounted(`token exchange failed: ${e.code}`, user.id);
      await db.addAudit({ user_id: user.id, action: "google.connect", result: `token:${e.code}` });
      if (e.adminBlocked) return back({ ok: false, error: gcopy["g.web.admin_blocked"]() });
      return back({ ok: false, error: gcopy["g.web.failed"](e.code) });
    }
    throw e;
  }
}

const refusedNotice = (reason: GmailReadKeep["reason"]) => (reason === "cap_reached" ? gcopy["g.web.gmail_read_cap_reached"]() : gcopy["g.web.feature_disabled"]());

/**
 * A consent that came back but is not in the user-cap ledger: Google may have counted the account (the user saw the
 * consent screen and approved), and we cannot tell which account it was. One greppable line per case, so the
 * operator can reconcile the ledger with Google Auth Platform → Audience → OAuth user cap.
 */
function uncounted(why: string, userId?: string): void {
  console.warn(`[google:user-cap] consent returned but not recorded (${why})${userId ? ` user ${userId}` : ""} - Google may have counted this account; compare with the Console's OAuth user cap.`);
}
