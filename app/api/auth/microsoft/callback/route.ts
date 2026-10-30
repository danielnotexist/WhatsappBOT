import { reportError } from "@/lib/errors/report";
import type { Route } from "next";
import { connectCookieHeader, connectCookieMatches, redirectSettingCookies, sealConnectPending, withConnectCookieCleared } from "@/lib/auth/connect-cookie";
import { getSession } from "@/lib/auth/current-user";
import { oauthReturnUrl, parseReturnTo, type OAuthReturnTo } from "@/lib/auth/oauth-return";
import { microsoftIdentity } from "@/lib/auth/sso";
import { refuseSso, ssoCallbackState } from "@/lib/auth/sso-flow";
import { getDb } from "@/lib/db";
import { EnvError, unavailable } from "@/lib/env";
import { copy } from "@/lib/copy/bot";
import { CONNECT_GUARD } from "@/lib/copy/connect-guard";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { getMsConfig } from "@/lib/ms";
import { randomBytes } from "node:crypto";
import { storeMicrosoftConnection } from "@/lib/ms/connect-store";
import { MsOAuthError, buildAuthorizeUrl, exchangeCode, msScopesFor, parseIdToken, parseMsSignInClaims, pkcePair } from "@/lib/ms/oauth";
import { finishMicrosoftSignIn } from "@/lib/ms/sso";
import { getWaSender } from "@/lib/wa";

/**
 * Where the user lands after Microsoft — the provider-neutral rule in lib/auth/oauth-return.ts (shared with Google):
 * onboarding → /start/ready?connected=microsoft or back to /start/connect?error=… (+ `admin=1` when the organisation
 * needs an IT admin, so the connect card can offer the admin-consent mail); account → /account?notice|error=….
 */
function finish(request: Request, returnTo: OAuthReturnTo, key: "notice" | "error", message: string, opts: { admin?: boolean } = {}): Response {
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const dest = new URL(oauthReturnUrl(appUrl, returnTo, "microsoft", key === "notice" ? { ok: true, notice: message } : { ok: false, error: message }));
  if (opts.admin && returnTo === "onboarding" && key === "error") dest.searchParams.set("admin", "1");
  return Response.redirect(dest.toString() as Route, 303);
}

function accountRedirect(request: Request, key: "notice" | "error", message: string): Response {
  return finish(request, "account", key, message);
}

/**
 * GET /api/auth/microsoft/callback — the user flow (code + state), the admin-consent flow (admin_consent=True & tenant
 * & state) and Sign in with Microsoft. A sign-in is recognised by its cookie (lib/auth/sso.ts: the state in the URL is
 * the one sealed in this browser's `wb_sso`) and finished by lib/ms/sso.ts. Otherwise the pending state is looked up
 * by scanning the user profile; because the state is random and single-use we find the user through it. A state no
 * one knows, in a browser that started a sign-in, is a failed sign-in — never a connect.
 * Security (area C), as Google: the state expires after 30 minutes (also for the admin consent), the connect finishes
 * only in the browser that started it (its `wb_connect_microsoft` cookie names this user and this state) and, when the
 * browser is signed in, for that same account; a connect started from a chat link in a browser not signed in to the
 * account adds only the account's own address, and only when Microsoft vouches for it (the sign-in trust rules of
 * lib/auth/sso.ts: a personal account, or `xms_edov`). Every outcome clears the cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const sso = ssoCallbackState(request, "microsoft", state);
  if (sso.pending) return finishMicrosoftSignIn(request, sso.pending);
  return withConnectCookieCleared(await connectCallback(request, url, state, sso), "microsoft");
}

/** A pending state older than this is refused (the consent screen takes seconds; a stale tab is suspicious). */
const STATE_TTL_MS = 30 * 60_000;

async function connectCallback(request: Request, url: URL, state: string, sso: ReturnType<typeof ssoCallbackState>): Promise<Response> {
  const db = getDb();
  const user = state ? await db.findUserByOauthState("microsoft", state) : null;
  if (!user && sso.present) return refuseSso(request, sso.from, "state", { provider: "microsoft" });
  if (!user) return accountRedirect(request, "error", "החיבור לא הושלם: המצב לא זוהה (אולי הקישור פג). אפשר להתחיל שוב.");
  const pending = ((user.profile.oauth_pending as Record<string, unknown>)?.microsoft ?? {}) as { verifier?: string; admin?: boolean; meetings?: boolean; via?: string; returnTo?: string; started_at?: string };
  const returnTo = parseReturnTo(pending.returnTo);
  const otherPending = (user.profile.oauth_pending as Record<string, unknown>) ?? {};
  await db.mergeUserProfile(user.id, { oauth_pending: { ...otherPending, microsoft: null } });
  if (!pending.started_at || Date.now() - Date.parse(pending.started_at) > STATE_TTL_MS) {
    await db.addAudit({ user_id: user.id, action: url.searchParams.get("admin_consent") ? "ms.admin_consent" : "ms.connect", result: "error:state_expired" });
    return finish(request, returnTo, "error", "החיבור לא הושלם: המצב לא זוהה (אולי הקישור פג). אפשר להתחיל שוב.");
  }
  // bound to the browser that started it, and to the signed-in account when there is one
  const sessionUserId = (await getSession())?.userId ?? null;
  if (!connectCookieMatches(request, "microsoft", state, user.id) || (sessionUserId && sessionUserId !== user.id)) {
    await db.addAudit({ user_id: user.id, action: url.searchParams.get("admin_consent") ? "ms.admin_consent" : "ms.connect", result: "error:unbound" });
    return finish(request, returnTo, "error", CONNECT_GUARD.unbound);
  }
  // the IT admin's link (admin consent only, 3 days, lib/ms/connect-link.ts): it opens without a session of the account
  const adminLinkFor = () => new URL(`/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft", { purpose: "admin" }))}`, process.env.APP_URL || url.origin).toString();

  /**
   * A pro connect asked for the Teams transcript pair too (MS_MEETING_SCOPES). OnlineMeetingTranscript.Read.All always
   * needs an admin, so in an organisation where users may consent to the rest it is the only thing missing: the
   * connect is not lost over it — Microsoft is asked again for the base set (a fresh state and PKCE), and the meeting
   * summaries of Teams wait for the admin (profile.ms_meetings_consent = "admin_required", lib/meetings).
   */
  const retryWithoutMeetings = async (reason: string): Promise<Response> => {
    const cfg = getMsConfig();
    const state2 = randomBytes(16).toString("base64url");
    const { verifier, challenge } = pkcePair();
    await db.mergeUserProfile(user.id, {
      oauth_pending: { ...otherPending, microsoft: { state: state2, verifier, admin: false, meetings: false, started_at: new Date().toISOString(), via: pending.via ?? "web", returnTo } },
      ms_meetings_consent: "admin_required",
    });
    await db.addAudit({ user_id: user.id, action: "ms.connect", result: `retry_without_meetings:${reason}` });
    // the same browser goes on: its cookie now binds the fresh state
    return redirectSettingCookies(buildAuthorizeUrl(cfg, { state: state2, codeChallenge: challenge, loginHint: user.email, scopes: msScopesFor() }), [connectCookieHeader("microsoft", sealConnectPending({ provider: "microsoft", userId: user.id, state: state2 }))]);
  };

  const phone = (await db.listWaIdentities(user.id)).find((w) => w.status === "active")?.phone_e164 ?? null;
  const tell = async (text: string) => {
    if (!phone) return;
    try {
      await getWaSender().sendText(phone, text);
      await db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
    } catch (e) {
      console.error("[ms:callback] wa notify failed:", (e as Error).message);
    }
  };

  // --- admin consent result ---
  if (url.searchParams.get("admin_consent")) {
    const ok = url.searchParams.get("admin_consent") === "True";
    await db.addAudit({ user_id: user.id, action: "ms.admin_consent", target: url.searchParams.get("tenant") ?? "", result: ok ? "granted" : (url.searchParams.get("error") ?? "denied") });
    if (ok) await tell("מנהל המערכת אישר את החיבור לארגון. אפשר לכתוב \"חבר שוב\" ואשלח קישור לחיבור החשבון.");
    return accountRedirect(request, ok ? "notice" : "error", ok ? "אישור המנהל התקבל. עכשיו אפשר לחבר את החשבון." : "אישור המנהל לא ניתן. אפשר לבקש ממנהל ה-IT לנסות שוב.");
  }

  // --- user authorization result ---
  const error = url.searchParams.get("error");
  if (error || !url.searchParams.get("code")) {
    const desc = url.searchParams.get("error_description") ?? "";
    const needsAdmin = /AADSTS65001|AADSTS90094|consent_required|admin_consent/i.test(`${error} ${desc}`);
    // "Need admin approval" → "Return to the application without granting consent" answers access_denied (AADSTS65004)
    if (pending.meetings && !pending.admin && (needsAdmin || /access_denied|AADSTS65004/i.test(`${error} ${desc}`))) {
      try {
        return await retryWithoutMeetings(error ?? "consent");
      } catch (e) {
        if (!(e instanceof EnvError)) throw e;
      }
    }
    await db.addAudit({ user_id: user.id, action: "ms.connect", result: `error:${error}` });
    await reportError("oauth.microsoft", `consent returned ${error}`, { userId: user.id, context: { needsAdmin } });
    if (needsAdmin) {
      await tell(copy["err.admin_consent_needed"](user.business_name ?? "הארגון", adminLinkFor()));
      return finish(request, returnTo, "error", phone ? "הארגון דורש אישור מנהל. שלחנו בוואטסאפ טקסט להעביר למנהל ה-IT." : "הארגון דורש אישור חד-פעמי של מנהל ה-IT.", { admin: true });
    }
    // Microsoft's own wording (error_description) stays in the log: the page shows a fixed line
    return finish(request, returnTo, "error", "החיבור ל-Microsoft 365 לא הושלם. אפשר לנסות שוב.");
  }

  let cfg;
  try {
    cfg = getMsConfig();
  } catch (e) {
    if (e instanceof EnvError) return new Response(unavailable("ms:callback", e), { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  try {
    const tokens = await exchangeCode(cfg, url.searchParams.get("code")!, pending.verifier ?? "", msScopesFor({ meetings: pending.meetings === true }));
    const claims = parseIdToken(tokens.idToken);
    const accountEmail = (claims.email ?? claims.preferred_username ?? user.email).toLowerCase();
    // a chat link alone (no session of this account in the browser) adds only the account's own address, vouched for
    // by Microsoft (the sign-in's trust rules); another mailbox needs the personal area
    if (pending.via === "chat" && sessionUserId !== user.id) {
      const identity = microsoftIdentity(parseMsSignInClaims(tokens.idToken));
      if (!identity?.trusted || identity.email !== user.email.toLowerCase()) {
        await db.addAudit({ user_id: user.id, action: "ms.connect", result: "error:chat_other_mailbox" });
        return finish(request, returnTo, "error", CONNECT_GUARD.chat_other_mailbox);
      }
    }
    const { notice } = await storeMicrosoftConnection(db, user, tokens, { accountEmail, tenantId: claims.tid, admin: pending.admin === true, meetings: pending.meetings === true, appUrl: process.env.APP_URL || url.origin, tell });
    return finish(request, returnTo, "notice", notice);
  } catch (e) {
    if (e instanceof MsOAuthError) {
      await db.addAudit({ user_id: user.id, action: "ms.connect", result: `token:${e.code}` });
      await reportError("oauth.microsoft", e, { userId: user.id, context: { code: e.code } });
      if (e.needsAdminConsent && pending.meetings && !pending.admin) return retryWithoutMeetings(`token:${e.code}`);
      if (e.needsAdminConsent) {
        await tell(copy["err.admin_consent_needed"](user.business_name ?? "הארגון", adminLinkFor()));
        return finish(request, returnTo, "error", phone ? "הארגון דורש אישור מנהל. שלחנו בוואטסאפ טקסט להעביר למנהל ה-IT." : "הארגון דורש אישור חד-פעמי של מנהל ה-IT.", { admin: true });
      }
      return finish(request, returnTo, "error", `החיבור נכשל (${e.code}). אפשר לנסות שוב.`);
    }
    throw e;
  }
}
