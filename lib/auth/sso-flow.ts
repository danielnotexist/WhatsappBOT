import "server-only";
import { sourceFromCookieHeader } from "@/lib/admin/source";
import { trackServerEvent } from "@/lib/analytics/track";
import { planGateFor } from "@/lib/connections/plan-gate";
import { ssoNotConnectedOnePlan, SSO_ERRORS, type SsoErrorCode } from "@/lib/copy/auth-sso";
import { getDb } from "@/lib/db";
import type { Db, UserRow } from "@/lib/db/types";
import { reportError } from "@/lib/errors/report";
import { referralCodeFromCookieHeader } from "@/lib/referrals/code";
import { getWaSender } from "@/lib/wa";
import { demoSessionClaims } from "./demo-user";
import { oauthReturnUrl } from "./oauth-return";
import { sendOtpForRequest } from "./otp-service";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "./session";
import { signInVerifiedEmail, type SignInDeps } from "./sign-in";
import {
  SSO_COOKIE,
  clearSsoCookieHeader,
  decideSso,
  openSsoPending,
  readCookie,
  sealSsoPending,
  ssoAuditTarget,
  ssoCodeUrl,
  ssoCookieHeader,
  ssoErrorUrl,
  ssoStateMatches,
  type SsoFrom,
  type SsoIdentity,
  type SsoPending,
  type SsoProvider,
} from "./sso";

/**
 * The I/O half of "המשך עם Microsoft / Google" (lib/auth/sso.ts has the rules). The provider modules
 * (lib/google/sso.ts, lib/ms/sso.ts) exchange the code and read the identity; this finishes the sign-in the same way for
 * both: the trust decision, the shared sign-in (lib/auth/sign-in.ts — the same audit, source, referral, owner alert and
 * "last seen" as the email code), the plan gate, the connection (exactly the connect flow's storage), the funnel, the
 * `auth.sso` audit row, the session cookie and the landing: a new user → the WhatsApp step (/start/ready, the mail step
 * is done), an existing one → /account.
 */

export type SsoConnectOutcome = { ok: true; notice: string } | { ok: false; error: string };

export const appUrlOf = (request: Request): string => process.env.APP_URL || new URL(request.url).origin;

/** A 303 with any number of Set-Cookie headers (Response.redirect's headers are immutable). */
export function redirectWithCookies(location: string, cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
}

function sessionCookieHeader(token: string, secure: boolean = process.env.NODE_ENV === "production"): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The start route's answer: the pending sign-in in its cookie, and off to the provider. */
export function redirectToProvider(authorizeUrl: string, pending: SsoPending): Response {
  return redirectWithCookies(authorizeUrl, [ssoCookieHeader(sealSsoPending(pending))]);
}

export function newSsoPending(provider: SsoProvider, from: SsoFrom, state: string, verifier: string, extra: Partial<Pick<SsoPending, "scopes" | "gmail_read" | "drive_read">> = {}): SsoPending {
  return { v: 1, provider, state, verifier, from, started_at: new Date().toISOString(), ...extra };
}

/**
 * The callback's view of the cookie: `pending` when this callback finishes a sign-in of `provider` (the cookie opens
 * and its state is the one in the URL), and whether a sign-in cookie was there at all — a callback whose state no
 * one knows is then a failed sign-in, never a connect.
 */
export function ssoCallbackState(request: Request, provider: SsoProvider, state: string | null): { pending: SsoPending | null; present: boolean; from: SsoFrom } {
  const raw = readCookie(request.headers.get("cookie"), SSO_COOKIE);
  const opened = openSsoPending(raw, provider);
  return { pending: opened && ssoStateMatches(opened, state) ? opened : null, present: Boolean(raw), from: opened?.from ?? "start" };
}

/** A sign-in that ends without signing in: audited, the cookie cleared, back to its page with the reason's code. */
export async function refuseSso(request: Request, from: SsoFrom, code: SsoErrorCode, audit: { provider: SsoProvider; target?: string; userId?: string | null; detail?: string }): Promise<Response> {
  await getDb()
    .addAudit({ user_id: audit.userId ?? null, action: "auth.sso", target: audit.target ?? audit.provider, result: `refused:${code}`, reason: audit.detail ?? null })
    .catch((e: unknown) => console.warn("[sso] audit failed:", (e as Error).message));
  return redirectWithCookies(ssoErrorUrl(appUrlOf(request), from, code), [clearSsoCookieHeader()]);
}

/** The browser's first-visit source and a friend's code, for a user created by this sign-in (same as the email code). */
function signInDeps(db: Db, request: Request): SignInDeps {
  const cookie = request.headers.get("cookie");
  return { db, signupSource: sourceFromCookieHeader(cookie), referralCode: referralCodeFromCookieHeader(cookie) };
}

/** The WhatsApp line after a connect, like the callbacks: only when a number is linked. */
function teller(db: Db, userId: string, enabled: boolean): (body: string) => Promise<void> {
  return async (body) => {
    if (!enabled) return;
    const phone = (await db.listWaIdentities(userId)).find((w) => w.status === "active")?.phone_e164 ?? null;
    if (!phone) return;
    try {
      await getWaSender().sendText(phone, body);
      await db.insertMessage({ user_id: userId, direction: "out", type: "text", text: body });
    } catch (e) {
      console.error("[sso] wa notify failed:", (e as Error).message);
    }
  };
}

/**
 * The identity is known (the provider module checked the state, exchanged the code with the PKCE verifier and read the
 * claims). `connect` stores the provider connection for the signed-in user — the connect flow's own storage
 * (lib/google/connect-store.ts, lib/ms/connect-store.ts) or, in the demo without the provider, its fixture
 * (lib/auth/demo-connect.ts). `tell` is quiet on a sign-in that only refreshes the account already connected.
 */
export async function finishSsoSignIn(
  request: Request,
  input: {
    pending: Pick<SsoPending, "provider" | "from">;
    identity: SsoIdentity;
    connect: (user: UserRow, ctx: { isNewUser: boolean; tell: (body: string) => Promise<void> }) => Promise<SsoConnectOutcome>;
  },
): Promise<Response> {
  const db = getDb();
  const appUrl = appUrlOf(request);
  const { identity, pending } = input;
  const provider = identity.provider;
  const target = ssoAuditTarget(identity);
  const existing = await db.findUserByEmail(identity.email);
  const decision = decideSso(identity, existing);

  if (decision.kind === "verify_by_code") {
    // an account with this email exists and the provider does not vouch for the address: its owner proves it by the
    // email code; nothing from the provider is kept, no session
    await db.addAudit({ user_id: decision.user.id, action: "auth.sso", target, result: "verify_by_code", reason: identity.basis });
    const sent = await sendOtpForRequest(identity.email, request.headers).catch((e: unknown) => {
      console.warn("[sso] code not sent:", (e as Error).message);
      return null;
    });
    const wait = sent ? (sent.ok ? sent.cooldownSeconds : (sent.retryAfterSeconds ?? 0)) : 0;
    return redirectWithCookies(ssoCodeUrl(appUrl, identity.email, wait, provider), [clearSsoCookieHeader()]);
  }

  const { user, isNewUser } = await signInVerifiedEmail(signInDeps(db, request), identity.email, provider, decision.kind === "login" ? decision.user : null);

  // a one-account plan that already works with the other provider keeps the sign-in, not the new connection
  const gate = isNewUser ? null : await planGateFor(db, user.id, provider).catch(() => null);
  let outcome: SsoConnectOutcome;
  if (gate?.reason) {
    outcome = { ok: false, error: ssoNotConnectedOnePlan(provider) };
  } else {
    const before = await db.listConnections(user.id);
    const refresh = before.some((c) => c.provider === provider && c.status === "active" && c.account_email === identity.email);
    try {
      outcome = await input.connect(user, { isNewUser, tell: teller(db, user.id, !refresh) });
    } catch (e) {
      await reportError(`oauth.${provider}`, e, { userId: user.id, context: { flow: "sso" } });
      outcome = { ok: false, error: SSO_ERRORS.failed };
    }
  }

  await db.addAudit({ user_id: user.id, action: "auth.sso", target, result: `ok:${isNewUser ? "signup" : "login"}${gate?.reason ? ":not_connected" : ""}`, reason: identity.basis });
  // the signup funnel's "code accepted" step: the sign-in that started on the signup page (the email code reports it from the browser)
  if (pending.from === "start") trackServerEvent(db, "code_ok", user.id);

  const session = sessionCookieHeader(createSessionToken(user.id, demoSessionClaims(user.email)));
  let dest: string;
  if (isNewUser) dest = oauthReturnUrl(appUrl, "onboarding", provider, outcome);
  else dest = outcome.ok ? new URL("/account", appUrl).toString() : oauthReturnUrl(appUrl, "account", provider, outcome);
  return redirectWithCookies(dest, [session, clearSsoCookieHeader()]);
}
