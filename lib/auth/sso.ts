import { timingSafeEqual } from "node:crypto";
import type { SsoErrorCode, SsoProviderId } from "@/lib/copy/auth-sso";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { UserRow } from "@/lib/db/types";
import type { MsSignInClaims } from "@/lib/ms/oauth";
import { derivedKey } from "./keys";
import { normalizeEmail } from "./otp";

/**
 * "המשך עם Microsoft / Google" (Daniel, 28.10.2026): sign in or sign up with the provider and connect the mailbox in
 * the same consent. The start routes take `intent=signin` without a session; the callbacks finish it
 * (lib/auth/sso-flow.ts). This module is the part with no I/O: the pending state in its cookie, who the provider says
 * the person is, whether that may open an existing account, and where the browser goes.
 *
 * Security (the nOAuth class of bugs — an email claim the provider does not vouch for must never open someone else's
 * account):
 *  - Google: the email counts only with `email_verified === true` (id_token, else userinfo); without it, no sign-in.
 *  - Microsoft: the email counts only for a personal account (the consumer tenant MSA_TENANT_ID) or with
 *    `xms_edov === true` (the domain owner verified it — an optional claim, docs/microsoft-setup.md). Otherwise the
 *    `preferred_username` may only create a NEW account: when an account with that email exists, the browser goes to
 *    the email code instead (the account's owner proves the address), and nothing from the provider is kept.
 *  - The state and the PKCE verifier live in an encrypted, httpOnly, 15-minute cookie on /api/auth (`wb_sso`): bound to
 *    this browser (no login CSRF: a code and state from someone else's consent do not match this cookie), single use
 *    (the callback clears it), checked in constant time.
 *  - Who signed in is audited (`auth.sso`: provider, subject `sub` / `oid`, tenant, and the trust basis).
 *  - The admin panel keeps its own emailed code (lib/admin/auth.ts): a session from here is an ordinary session.
 */

export type SsoProvider = SsoProviderId;
/** The page the sign-in started from — where an error is shown. */
export type SsoFrom = "start" | "login";

export const SSO_COOKIE = "wb_sso";
export const SSO_COOKIE_PATH = "/api/auth";
export const SSO_TTL_SECONDS = 15 * 60;
/** Microsoft's tenant for personal accounts (outlook.com, hotmail.com, live.com …): their email is verified by Microsoft. */
export const MSA_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

export function parseSsoFrom(v: string | null | undefined): SsoFrom {
  return v === "login" ? "login" : "start";
}

/** The pending sign-in, sealed in the cookie between the start route and the callback. */
export interface SsoPending {
  v: 1;
  provider: SsoProvider;
  state: string;
  verifier: string;
  from: SsoFrom;
  started_at: string;
  /** Google: what the start route asked for and its user-cap decisions (the connect flow's pending state, lib/google/user-cap.ts) */
  scopes?: string[];
  gmail_read?: string;
  drive_read?: string;
}

const AAD = "wb_sso:v1";

export function sealSsoPending(pending: SsoPending, key: Buffer = derivedKey("sso")): string {
  return encryptToken(JSON.stringify(pending), { key, aad: AAD });
}

/**
 * The cookie's pending sign-in for `provider`, or null: missing, not ours (a wrong key or a changed byte fails the
 * GCM tag), another provider's, malformed, or older than SSO_TTL_SECONDS.
 */
export function openSsoPending(value: string | null | undefined, provider: SsoProvider, opts: { key?: Buffer; now?: Date } = {}): SsoPending | null {
  if (!value || value.length > 4096) return null;
  try {
    const p = JSON.parse(decryptToken(value, { key: opts.key ?? derivedKey("sso"), aad: AAD })) as Partial<SsoPending>;
    if (p.v !== 1 || p.provider !== provider || typeof p.state !== "string" || typeof p.verifier !== "string" || typeof p.started_at !== "string") return null;
    const started = Date.parse(p.started_at);
    const now = (opts.now ?? new Date()).getTime();
    if (!Number.isFinite(started) || now - started > SSO_TTL_SECONDS * 1000 || started - now > 60_000) return null;
    return { ...p, from: parseSsoFrom(p.from) } as SsoPending;
  } catch {
    return null;
  }
}

/** The callback's `state` is the cookie's (constant time; an empty one never matches). */
export function ssoStateMatches(pending: Pick<SsoPending, "state">, state: string | null | undefined): boolean {
  if (!state || !pending.state) return false;
  const a = Buffer.from(pending.state);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One cookie from a Cookie header (route handlers read the request, not next/headers). */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

const secureDefault = () => process.env.NODE_ENV === "production";

/** Set-Cookie for the pending sign-in: httpOnly, Lax (the provider's redirect back is a top-level GET), /api/auth only. */
export function ssoCookieHeader(value: string, secure: boolean = secureDefault()): string {
  return `${SSO_COOKIE}=${value}; Path=${SSO_COOKIE_PATH}; Max-Age=${SSO_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Set-Cookie that removes it (single use: every callback outcome clears it). */
export function clearSsoCookieHeader(secure: boolean = secureDefault()): string {
  return `${SSO_COOKIE}=; Path=${SSO_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// ---------------------------------------------------------------------------------------------
// who the provider says this is, and whether that may open an existing account
// ---------------------------------------------------------------------------------------------

/** Why the email is trusted (or not) — kept in the audit row. */
export type SsoTrustBasis = "email_verified" | "msa" | "xms_edov" | "unverified";

export interface SsoIdentity {
  provider: SsoProvider;
  /** lowercased, a valid address */
  email: string;
  /** may this email open an existing account? (the provider vouches for it) */
  trusted: boolean;
  basis: SsoTrustBasis;
  /** Google `sub` / Microsoft `oid` */
  subject: string | null;
  /** Microsoft `tid` (null for Google) */
  tenant: string | null;
  name: string | null;
}

/**
 * Google: the account's email, trusted only with `email_verified === true`. Null when there is no usable address.
 * An unverified email is returned (trusted: false) so the caller can refuse it and say why.
 */
export function googleIdentity(claims: { sub: string | null; email: string | null; emailVerified: boolean; name: string | null }): SsoIdentity | null {
  const email = normalizeEmail(claims.email);
  if (!email) return null;
  const trusted = claims.emailVerified === true;
  return { provider: "google", email, trusted, basis: trusted ? "email_verified" : "unverified", subject: claims.sub, tenant: null, name: claims.name };
}

/**
 * Microsoft: a personal account's email (Microsoft verifies it), or a work account's `email` with `xms_edov` — both
 * trusted. Anything else: `preferred_username`, untrusted (it may create a new account, never open an existing one).
 * Null when there is no usable address.
 */
export function microsoftIdentity(claims: MsSignInClaims): SsoIdentity | null {
  const base = { provider: "microsoft" as const, subject: claims.oid, tenant: claims.tid, name: claims.name };
  if (claims.tid === MSA_TENANT_ID) {
    const email = normalizeEmail(claims.email) ?? normalizeEmail(claims.preferred_username);
    return email ? { ...base, email, trusted: true, basis: "msa" } : null;
  }
  const verified = claims.xms_edov ? normalizeEmail(claims.email) : null;
  if (verified) return { ...base, email: verified, trusted: true, basis: "xms_edov" };
  const username = normalizeEmail(claims.preferred_username);
  return username ? { ...base, email: username, trusted: false, basis: "unverified" } : null;
}

export type SsoDecision = { kind: "signup" } | { kind: "login"; user: UserRow } | { kind: "verify_by_code"; user: UserRow };

/**
 * No account with this email → a new one (any identity the provider gave us). An account exists → it opens only for a
 * trusted email; otherwise its owner proves the address with the email code.
 */
export function decideSso(identity: Pick<SsoIdentity, "trusted">, existing: UserRow | null): SsoDecision {
  if (!existing) return { kind: "signup" };
  return identity.trusted ? { kind: "login", user: existing } : { kind: "verify_by_code", user: existing };
}

/** The audit target: provider, tenant (Microsoft) and subject — who signed in, not only which address. */
export function ssoAuditTarget(identity: Pick<SsoIdentity, "provider" | "subject" | "tenant">): string {
  return [identity.provider, identity.tenant, identity.subject ?? "unknown"].filter(Boolean).join(":");
}

// ---------------------------------------------------------------------------------------------
// where the browser goes (fixed paths and fixed codes only: no open redirect, no text from the URL)
// ---------------------------------------------------------------------------------------------

/** Back to the page the sign-in started from, with the reason's code (lib/copy/auth-sso.ts SSO_ERRORS). */
export function ssoErrorUrl(appUrl: string, from: SsoFrom, code: SsoErrorCode): string {
  const url = new URL(from === "login" ? "/login" : "/start", appUrl);
  url.searchParams.set("sso_error", code);
  return url.toString();
}

/** The email code for an account the provider could not vouch for: /login/code with the address and the wait. */
export function ssoCodeUrl(appUrl: string, email: string, waitSeconds: number, provider: SsoProvider): string {
  const url = new URL("/login/code", appUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("wait", String(Math.max(0, Math.round(waitSeconds))));
  url.searchParams.set("sso", provider);
  return url.toString();
}
