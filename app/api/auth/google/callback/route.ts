import { oauthReturnUrl, parseReturnTo, type OAuthReturnTo } from "@/lib/auth/oauth-return";
import { GOOGLE_CAPABILITY_SCOPES, gcopy } from "@/lib/copy/bot-google";
import { getDb } from "@/lib/db";
import { EnvError } from "@/lib/env";
import { getGoogleConfig, getGoogleFetch } from "@/lib/google";
import { GoogleClient } from "@/lib/google/client";
import { GOOGLE_SCOPES, GoogleOAuthError, exchangeGoogleCode, hasScope, isGoogleFeature, missingScopes, parseGoogleIdToken, scopesForRequest } from "@/lib/google/oauth";
import { sealGoogleTokens, storedGoogleRefreshToken } from "@/lib/google/token-store";
import { googleConnectShowsUnverified, recordGoogleGrants } from "@/lib/google/user-cap";
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
  via?: string;
  started_at?: string;
}

/**
 * GET /api/auth/google/callback?code&state (or ?error=access_denied&state).
 * Finds the user through the single-use state, exchanges the code with the PKCE verifier, stores the encrypted
 * tokens and the granted scopes (granular consent → maybe fewer than requested), tells the user in WhatsApp,
 * and redirects per `returnTo` (onboarding → /start/ready, else /account).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL || url.origin;
  const db = getDb();
  const state = url.searchParams.get("state") ?? "";
  const user = state ? await db.findUserByOauthState("google", state) : null;
  if (!user) return Response.redirect(oauthReturnUrl(appUrl, "account", "google", { ok: false, error: gcopy["g.web.state_unknown"]() }), 303);

  const allPending = (user.profile.oauth_pending as Record<string, unknown> | undefined) ?? {};
  const pending = (allPending.google ?? {}) as PendingGoogle;
  await db.mergeUserProfile(user.id, { oauth_pending: { ...allPending, google: null } });
  const returnTo: OAuthReturnTo = parseReturnTo(pending.returnTo);
  const back = (outcome: { ok: true; notice: string } | { ok: false; error: string }) => Response.redirect(oauthReturnUrl(appUrl, returnTo, "google", outcome), 303);
  if (!pending.started_at || Date.now() - Date.parse(pending.started_at) > STATE_TTL_MS) return back({ ok: false, error: gcopy["g.web.state_unknown"]() });

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
      await db.addAudit({ user_id: user.id, action: "google.connect", result: "error:no_email" });
      return back({ ok: false, error: gcopy["g.web.no_email"]() });
    }

    // prompt=consent normally returns a new refresh token; if Google omits it on a re-consent, keep the stored one
    const existing = (await db.listConnections(user.id)).find((c) => c.provider === "google" && c.account_email === email);
    const refreshToken = tokens.refreshToken ?? (existing ? await storedGoogleRefreshToken(db, existing).catch(() => null) : null);
    const connection = await db.upsertConnection({ user_id: user.id, provider: "google", account_email: email, tenant_id: null, scopes: tokens.scope, consent_type: "user", ...sealGoogleTokens(user.id, { ...tokens, refreshToken }) });

    const feature = isGoogleFeature(pending.feature) ? pending.feature : null;
    // what was asked (stored by the start route — the cap may have moved since); older states: the static set
    const stored = Array.isArray(pending.scopes) ? pending.scopes.filter((s): s is string => typeof s === "string") : [];
    const requested = stored.length ? stored : scopesForRequest(feature);
    // gmail.readonly riding along a plain connect is optional: unticking it is a choice, not a failed connect
    const optional: string[] = feature ? [] : [GOOGLE_SCOPES.gmailReadonly];
    const missing = missingScopes(tokens.scope, requested).filter((s) => GOOGLE_CAPABILITY_SCOPES.includes(s) && !optional.includes(s));
    const gmailReadDeclined = !feature && requested.includes(GOOGLE_SCOPES.gmailReadonly) && !hasScope(tokens.scope, GOOGLE_SCOPES.gmailReadonly);
    await db.addAudit({ user_id: user.id, action: "google.connect", target: email, result: missing.length ? `partial:${missing.join(" ")}` : feature ? `ok:${feature}` : gmailReadDeclined ? "ok:gmail_read_declined" : "ok" });
    // Google's unverified-app user cap counts this account from now on (lib/google/user-cap.ts) — best effort
    await recordGoogleGrants(db, { userId: user.id, accountEmail: email, granted: tokens.scope }).catch((e) => console.error("[google:callback] user-cap ledger failed:", (e as Error).message));
    if (!user.name && claims.name) await db.updateUserProfile(user.id, { name: claims.name });
    if (!refreshToken) console.warn(`[google:callback] no refresh token for connection ${connection.id} — the user will need to reconnect when the access token expires`);

    await tell(gcopy["g.connect_done"](email, tokens.scope, { gmailReadDeclined }));
    if (missing.length) {
      const retry = new URL(`/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "google"))}${feature ? `&feature=${feature}` : ""}`, appUrl).toString();
      const headsUp = await googleConnectShowsUnverified(db, await db.listConnections(user.id));
      await tell(`${gcopy["g.connect_partial"](missing, retry)}${headsUp ? `\n${gcopy["g.unverified_heads_up"]()}` : ""}`);
    }
    return back(missing.length ? { ok: true, notice: gcopy["g.web.connected_partial"](email, missing) } : { ok: true, notice: gcopy["g.web.connected"](email) });
  } catch (e) {
    if (e instanceof GoogleOAuthError) {
      await db.addAudit({ user_id: user.id, action: "google.connect", result: `token:${e.code}` });
      if (e.adminBlocked) return back({ ok: false, error: gcopy["g.web.admin_blocked"]() });
      return back({ ok: false, error: gcopy["g.web.failed"](e.code) });
    }
    throw e;
  }
}
