import { createHash, randomBytes } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Google OAuth 2.0 web-server flow (authorization code + PKCE S256, confidential client), PLAN §2 / §11 milestone 6.
 * Verified against developers.google.com/identity/protocols/oauth2/web-server (2026-10):
 *   authorize  https://accounts.google.com/o/oauth2/v2/auth
 *   token      https://oauth2.googleapis.com/token
 *   revoke     https://oauth2.googleapis.com/revoke
 * Phase 1 asks only for scopes that do NOT need a CASA security assessment (calendar.events + gmail.send are
 * "sensitive" → app verification; drive.file is non-sensitive). Gmail read is "restricted": without CASA it is
 * requested only while under the unverified-app user cap (GOOGLE_GMAIL_READ_ENABLED / _CAP, lib/google/user-cap.ts).
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const GOOGLE_SCOPES = {
  openid: "openid",
  email: "email",
  profile: "profile",
  /** sensitive — view and edit events on all calendars (events.list / insert / patch / delete) */
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  /** non-sensitive — only files the app created or the user opened/shared with the app (Picker) */
  driveFile: "https://www.googleapis.com/auth/drive.file",
  /** sensitive — send only; cannot read, list or draft */
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  /** restricted — CASA Tier 2 for verification (PLAN §8 risk 5); until then only under the user cap (GOOGLE_GMAIL_READ_*). */
  gmailReadonly: "https://www.googleapis.com/auth/gmail.readonly",
  /** restricted — CASA. Only if we later need mark-as-read / labels. */
  gmailModify: "https://www.googleapis.com/auth/gmail.modify",
} as const;

/** What phase 1 requests on every connect. Free/busy for the user's own calendar is computed from events.list,
 *  so no `calendar.readonly` / `calendar.events.freebusy` is needed. */
export const GOOGLE_BASE_SCOPES = [GOOGLE_SCOPES.openid, GOOGLE_SCOPES.email, GOOGLE_SCOPES.profile, GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend] as const;

/** Capabilities that need an incremental consent later (restricted scopes → CASA first). */
export type GoogleFeature = "gmail_read" | "gmail_modify";
export const GOOGLE_FEATURE_SCOPES: Record<GoogleFeature, readonly string[]> = {
  gmail_read: [GOOGLE_SCOPES.gmailReadonly],
  gmail_modify: [GOOGLE_SCOPES.gmailModify],
};

export function isGoogleFeature(v: unknown): v is GoogleFeature {
  return typeof v === "string" && Object.hasOwn(GOOGLE_FEATURE_SCOPES, v);
}

/**
 * Scopes for an authorization request. Base connect → the phase-1 set (+ `gmail.readonly` when `withGmailRead`:
 * a connect while under the unverified-app user cap — lib/google/user-cap.ts). A feature → only the new scopes plus
 * openid/email (to identify the account): with `include_granted_scopes=true` Google returns a token that covers
 * everything granted before as well (incremental authorization).
 */
export function scopesForRequest(feature?: GoogleFeature | null, opts: { withGmailRead?: boolean } = {}): string[] {
  if (!feature) return opts.withGmailRead ? [...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly] : [...GOOGLE_BASE_SCOPES];
  return [GOOGLE_SCOPES.openid, GOOGLE_SCOPES.email, ...GOOGLE_FEATURE_SCOPES[feature]];
}

/** Google echoes `email`/`profile` as their long userinfo URLs; normalize so scope checks are simple. */
const SCOPE_ALIASES: Record<string, string> = {
  "https://www.googleapis.com/auth/userinfo.email": GOOGLE_SCOPES.email,
  "https://www.googleapis.com/auth/userinfo.profile": GOOGLE_SCOPES.profile,
};

export function normalizeScopes(scopes: readonly string[] | string): string[] {
  const list = typeof scopes === "string" ? scopes.split(/\s+/) : scopes;
  return [...new Set(list.filter(Boolean).map((s) => SCOPE_ALIASES[s] ?? s))].sort();
}

export function hasScope(granted: readonly string[], scope: string): boolean {
  return normalizeScopes(granted).includes(SCOPE_ALIASES[scope] ?? scope);
}

/** With granular consent the user may untick some boxes — returns the requested scopes that were not granted. */
export function missingScopes(granted: readonly string[], requested: readonly string[]): string[] {
  const g = new Set(normalizeScopes(granted));
  return normalizeScopes(requested).filter((s) => !g.has(s));
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  /** normalized granted scopes */
  scope: string[];
  idToken: string | null;
  /** set only when the user granted time-limited access */
  refreshTokenExpiresAt: Date | null;
}

export interface GoogleIdClaims {
  sub: string | null;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /** Google Workspace hosted domain (absent for @gmail.com) */
  hd: string | null;
}

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
  /** refresh token revoked / expired (incl. the 7-day testing-mode limit) / password change → reconnect */
  get needsReconnect(): boolean {
    return this.code === "invalid_grant";
  }
  /** a Google Workspace admin restricted the app or the service */
  get adminBlocked(): boolean {
    return this.code === "admin_policy_enforced" || this.code === "org_internal";
  }
}

/** RFC 7636 verifier: 64 chars from the unreserved set (base64url) — within Google's 43–128 bound. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Consent URL. `access_type=offline` + `prompt=consent` so every connect returns a refresh token;
 * `include_granted_scopes=true` for incremental authorization. `login_hint` only when we know the Google account
 * (reconnect / adding a scope) — on a first connect the user picks any account.
 */
export function buildGoogleAuthorizeUrl(cfg: Pick<GoogleOAuthConfig, "clientId" | "redirectUri">, opts: { state: string; codeChallenge: string; scopes?: readonly string[]; loginHint?: string | null; prompt?: "consent" | "select_account" | "consent select_account" }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (opts.scopes ?? GOOGLE_BASE_SCOPES).join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", opts.prompt ?? "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (opts.loginHint) u.searchParams.set("login_hint", opts.loginHint);
  return u.toString();
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(cfg: GoogleOAuthConfig, body: Record<string, string>): Promise<GoogleTokens> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as RawTokenResponse;
  if (!res.ok || !json.access_token) {
    const code = json.error ?? `http_${res.status}`;
    throw new GoogleOAuthError(`Google token endpoint: ${code}${json.error_description ? ` — ${json.error_description}` : ""}`, code, res.status);
  }
  const now = Date.now();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(now + (json.expires_in ?? 3600) * 1000),
    scope: normalizeScopes(json.scope ?? ""),
    idToken: json.id_token ?? null,
    refreshTokenExpiresAt: json.refresh_token_expires_in ? new Date(now + json.refresh_token_expires_in * 1000) : null,
  };
}

export function exchangeGoogleCode(cfg: GoogleOAuthConfig, code: string, codeVerifier: string): Promise<GoogleTokens> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: codeVerifier });
}

/** The response usually has no new refresh_token — callers keep the old one. */
export function refreshGoogleTokens(cfg: GoogleOAuthConfig, refreshToken: string): Promise<GoogleTokens> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Revokes a refresh (preferred — it also kills its access tokens) or access token. 200 = revoked;
 * 400 `invalid_token` = already revoked/expired, which is the outcome we want, so it counts as success.
 */
export async function revokeGoogleToken(token: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetchImpl(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  if (res.ok) return { ok: true, status: res.status };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 400 && json.error === "invalid_token") return { ok: true, status: res.status, error: json.error };
  return { ok: false, status: res.status, error: json.error ?? `http_${res.status}` };
}

/** Claims from the id_token payload (received directly from the token endpoint over TLS — no signature check). */
export function parseGoogleIdToken(idToken: string | null): GoogleIdClaims {
  const empty: GoogleIdClaims = { sub: null, email: null, emailVerified: false, name: null, hd: null };
  if (!idToken) return empty;
  const parts = idToken.split(".");
  if (parts.length < 2) return empty;
  try {
    const p = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
    return { sub: s("sub"), email: s("email")?.toLowerCase() ?? null, emailVerified: p.email_verified === true || p.email_verified === "true", name: s("name"), hd: s("hd") };
  } catch {
    return empty;
  }
}

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

/** Hebrew EnvError when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_URL are missing. */
export function googleOAuthConfigFromEnv(fetchImpl?: typeof fetch): GoogleOAuthConfig {
  const env = requireEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL"]);
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: new URL(GOOGLE_CALLBACK_PATH, env.APP_URL).toString(), fetchImpl };
}

/**
 * Feature flag (and kill switch) for the restricted Gmail read scope (owner decision 21.10.2026: the first users
 * without CASA, under Google's 100-user cap for unverified apps — lib/google/user-cap.ts, docs/google-setup.md §6).
 * Off means off for everyone: gmail.readonly is not requested, not kept from a consent, the gmail_* read tools are
 * not offered and the morning summary has no Gmail part — also for connections that granted it earlier. Their grant
 * stays at Google, so turning the flag back on restores reading without a new consent (a connection that reconnected
 * while off lost the scope in the callback and is asked once more — no new cap slot, the account is counted).
 * Explicit `true`/`false` wins; unset/empty → on when GOOGLE_CLIENT_ID is set (a real Google project), off otherwise.
 * Anything else → Hebrew EnvError.
 */
export function gmailReadEnabled(source: Record<string, string | undefined> = process.env): boolean {
  const parsed = requireEnv(["GOOGLE_GMAIL_READ_ENABLED"], source);
  return parsed.GOOGLE_GMAIL_READ_ENABLED ?? Boolean(source.GOOGLE_CLIENT_ID?.trim());
}

/**
 * gmailReadEnabled() for the places that USE an existing grant (chat tools, morning summary): a bad value must not
 * break the conversation or the job, so it logs the Hebrew EnvError and fails closed (no Gmail reading).
 */
export function gmailReadActive(source: Record<string, string | undefined> = process.env): boolean {
  try {
    return gmailReadEnabled(source);
  } catch (e) {
    console.error(`[google] Gmail reading is off: ${(e as Error).message}`);
    return false;
  }
}
