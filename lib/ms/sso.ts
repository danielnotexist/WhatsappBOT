import "server-only";
import { randomBytes } from "node:crypto";
import { demoConnect } from "@/lib/auth/demo-connect";
import { microsoftIdentity, type SsoFrom, type SsoPending } from "@/lib/auth/sso";
import { appUrlOf, finishSsoSignIn, newSsoPending, redirectToProvider, refuseSso } from "@/lib/auth/sso-flow";
import { getDb } from "@/lib/db";
import { reportError } from "@/lib/errors/report";
import { isDemo } from "@/lib/demo";
import { EnvError, msMocked } from "@/lib/env";
import { storeMicrosoftConnection } from "./connect-store";
import { getMsConfig } from "./index";
import { MsOAuthError, buildAuthorizeUrl, exchangeCode, msScopesFor, parseMsSignInClaims, pkcePair, type MsTokens } from "./oauth";

/**
 * "המשך עם Microsoft" (lib/auth/sso.ts has the rules): sign in or sign up with a Microsoft account, and connect its
 * mailbox, calendar and files in the same consent. The base scopes of a connect (msScopesFor() — the plan is not
 * known before the account is), PKCE S256 and select_account, no login_hint.
 * DEMO_MODE without LIVE_MS: no Microsoft at all — the fixture account's tokens (lib/ms/index.ts MS_FIXTURE_CLAIMS)
 * go through the same identity rules, and the connection is the demo's fixture (lib/auth/demo-connect.ts).
 */
export async function startMicrosoftSignIn(request: Request, from: SsoFrom): Promise<Response> {
  let cfg;
  try {
    cfg = getMsConfig();
    if (isDemo() && msMocked()) {
      const tokens = await exchangeCode(cfg, "demo", "demo", msScopesFor());
      return signInWithTokens(request, { provider: "microsoft", from }, tokens, { demo: true });
    }
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  return redirectToProvider(buildAuthorizeUrl(cfg, { state, codeChallenge: challenge, scopes: msScopesFor() }), newSsoPending("microsoft", from, state, verifier));
}

/** The callback of a sign-in (its cookie matched the state): the consent's outcome, the code with the cookie's verifier. */
export async function finishMicrosoftSignIn(request: Request, pending: SsoPending): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    const desc = url.searchParams.get("error_description") ?? "";
    const needsAdmin = /AADSTS65001|AADSTS90094|consent_required|admin_consent/i.test(`${error} ${desc}`);
    await reportError("oauth.microsoft", `sign-in consent returned ${error ?? "no_code"}`, { context: { needsAdmin, flow: "sso" } });
    return refuseSso(request, pending.from, needsAdmin ? "admin_required" : error === "access_denied" ? "denied" : "failed", { provider: "microsoft", detail: error ?? "no_code" });
  }
  let tokens: MsTokens;
  try {
    tokens = await exchangeCode(getMsConfig(), code, pending.verifier, msScopesFor());
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    if (e instanceof MsOAuthError) {
      // a wrong PKCE verifier, a used or stale code, or an organisation that needs its admin: no account, no session
      await reportError("oauth.microsoft", e, { context: { code: e.code, flow: "sso" } });
      return refuseSso(request, pending.from, e.needsAdminConsent ? "admin_required" : "failed", { provider: "microsoft", detail: `token:${e.code}` });
    }
    throw e;
  }
  return signInWithTokens(request, pending, tokens, { demo: false });
}

async function signInWithTokens(request: Request, pending: Pick<SsoPending, "provider" | "from">, tokens: MsTokens, opts: { demo: boolean }): Promise<Response> {
  const identity = microsoftIdentity(parseMsSignInClaims(tokens.idToken));
  if (!identity) return refuseSso(request, pending.from, "no_email", { provider: "microsoft" });
  const db = getDb();
  return finishSsoSignIn(request, {
    pending,
    identity,
    connect: async (user, { tell }) => {
      if (opts.demo) return { ok: true, notice: (await demoConnect(db, user, "microsoft")).notice };
      const { notice } = await storeMicrosoftConnection(db, user, tokens, { accountEmail: identity.email, tenantId: identity.tenant, admin: false, meetings: false, appUrl: appUrlOf(request), tell });
      return { ok: true, notice };
    },
  });
}
