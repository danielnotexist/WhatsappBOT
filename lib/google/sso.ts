import "server-only";
import { randomBytes } from "node:crypto";
import { demoConnect } from "@/lib/auth/demo-connect";
import { googleIdentity, type SsoFrom, type SsoPending } from "@/lib/auth/sso";
import { appUrlOf, finishSsoSignIn, newSsoPending, redirectToProvider, refuseSso } from "@/lib/auth/sso-flow";
import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import { isDemo } from "@/lib/demo";
import { EnvError, googleMocked } from "@/lib/env";
import { reportError } from "@/lib/errors/report";
import { GoogleClient } from "./client";
import { storeGoogleConnection, uncountedGoogleConsent } from "./connect-store";
import { getGoogleConfig, getGoogleFetch } from "./index";
import { GoogleOAuthError, buildGoogleAuthorizeUrl, exchangeGoogleCode, parseGoogleIdToken, pkcePair, scopesForRequest, type GoogleTokens } from "./oauth";
import { googleCapConfig, restrictedReadAccess, type RestrictedReadAccess } from "./user-cap";

/**
 * "המשך עם Google" (lib/auth/sso.ts has the rules): sign in or sign up with a Google account, and connect Gmail, the
 * calendar and Drive in the same consent — the base scopes of a connect (plus gmail.readonly while this new account is
 * under the unverified-app user cap, lib/google/user-cap.ts; drive.readonly is pro and the plan is not known yet).
 * The cap decisions ride in the cookie like the connect flow's pending state. `prompt=consent select_account`: the
 * account chooser, and a refresh token on every sign-in (the connection needs one).
 * DEMO_MODE without LIVE_GOOGLE: no Google at all — the fixture account's tokens (verified email) go through the same
 * identity rules, and the connection is the demo's fixture (lib/auth/demo-connect.ts).
 */
export async function startGoogleSignIn(request: Request, from: SsoFrom): Promise<Response> {
  const db = getDb();
  let cfg;
  let gmail: RestrictedReadAccess;
  let drive: RestrictedReadAccess;
  try {
    cfg = getGoogleConfig();
    if (isDemo() && googleMocked()) {
      const tokens = await exchangeGoogleCode(cfg, "demo", "demo");
      return signInWithTokens(request, { provider: "google", from }, tokens, { demo: true });
    }
    const capCfg = googleCapConfig();
    gmail = await readAccess(db, "gmail_read", capCfg);
    drive = await readAccess(db, "drive_read", capCfg);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const scopes = scopesForRequest(null, { withGmailRead: gmail.allowed, withDriveRead: false });
  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const pending = newSsoPending("google", from, state, verifier, { scopes, gmail_read: gmail.reason, drive_read: drive.reason });
  return redirectToProvider(buildGoogleAuthorizeUrl(cfg, { state, codeChallenge: challenge, scopes, prompt: "consent select_account" }), pending);
}

/** A new account's cap decision; a ledger failure means "without the read" (as the connect flow's plain connect). */
async function readAccess(db: Db, read: "gmail_read" | "drive_read", capCfg: ReturnType<typeof googleCapConfig>): Promise<RestrictedReadAccess> {
  try {
    return await restrictedReadAccess(db, null, read, capCfg);
  } catch (e) {
    console.error(`[google:sso] user-cap check failed (${read}):`, (e as Error).message);
    return { allowed: false, reason: "disabled", count: null, cap: capCfg.cap };
  }
}

/** The callback of a sign-in (its cookie matched the state): the consent's outcome, the code with the cookie's verifier. */
export async function finishGoogleSignIn(request: Request, pending: SsoPending): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    const reason = error === "access_denied" ? "denied" : error === "admin_policy_enforced" || error === "org_internal" ? "admin_blocked" : "failed";
    return refuseSso(request, pending.from, reason, { provider: "google", detail: error ?? "no_code" });
  }
  let tokens: GoogleTokens;
  try {
    tokens = await exchangeGoogleCode(getGoogleConfig(), code, pending.verifier);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    if (e instanceof GoogleOAuthError) {
      // a wrong PKCE verifier, a used or stale code, a Workspace that blocks the app: no account, no session
      uncountedGoogleConsent(`sign-in token exchange failed: ${e.code}`);
      await reportError("oauth.google", e, { context: { code: e.code, flow: "sso" } });
      return refuseSso(request, pending.from, e.adminBlocked ? "admin_blocked" : "failed", { provider: "google", detail: `token:${e.code}` });
    }
    throw e;
  }
  return signInWithTokens(request, pending, tokens, { demo: false });
}

async function signInWithTokens(request: Request, pending: Pick<SsoPending, "provider" | "from" | "scopes" | "gmail_read" | "drive_read">, tokens: GoogleTokens, opts: { demo: boolean }): Promise<Response> {
  const claims = parseGoogleIdToken(tokens.idToken);
  let email = claims.email;
  let emailVerified = claims.emailVerified;
  let name = claims.name;
  if (!email) {
    // no email in the id_token: Google's userinfo, with its own email_verified
    const info = await new GoogleClient({ getAccessToken: async () => tokens.accessToken, fetchImpl: getGoogleFetch() }).userInfo().catch(() => null);
    email = info?.email ?? null;
    emailVerified = info?.emailVerified ?? false;
    name = name ?? info?.name ?? null;
  }
  const identity = googleIdentity({ sub: claims.sub, email, emailVerified, name });
  if (!identity) {
    if (!opts.demo) uncountedGoogleConsent("sign-in without an account email");
    return refuseSso(request, pending.from, "no_email", { provider: "google", target: claims.sub ? `google:${claims.sub}` : undefined });
  }
  // Google does not vouch for this address: no sign-in with it, not even a new account
  if (!identity.trusted) {
    if (!opts.demo) uncountedGoogleConsent("sign-in with an unverified email");
    return refuseSso(request, pending.from, "unverified", { provider: "google", target: `google:${identity.subject ?? "unknown"}`, detail: "email_unverified" });
  }
  const db = getDb();
  return finishSsoSignIn(request, {
    pending,
    identity,
    connect: async (user, { tell }) => {
      if (opts.demo) return { ok: true, notice: (await demoConnect(db, user, "google")).notice };
      return storeGoogleConnection(db, user, tokens, { email: identity.email, name: identity.name, pending: { feature: null, scopes: pending.scopes, gmail_read: pending.gmail_read, drive_read: pending.drive_read }, appUrl: appUrlOf(request), tell });
    },
  });
}
