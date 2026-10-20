import { createHash, randomBytes } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Microsoft identity platform (Entra ID) OAuth 2.0 authorization-code flow with PKCE, multi-tenant app
 * registered in Daniel's tenant (PLAN §2, §9). Delegated scopes only — minimum for mail / calendar / files.
 */
export const MS_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All"] as const;

/** Delegated permissions without the OIDC ones — what the admin-consent URL asks for. */
export const MS_ADMIN_SCOPES = MS_SCOPES.filter((s) => !["openid", "profile", "email", "offline_access"].includes(s));

export interface MsOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** "common" (default), "organizations", or a tenant id */
  tenant: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export interface MsTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string[];
  idToken: string | null;
}

export interface IdTokenClaims {
  tid: string | null;
  oid: string | null;
  preferred_username: string | null;
  name: string | null;
  email: string | null;
}

export class MsOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly aadsts: string | null,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MsOAuthError";
  }
  /** AADSTS65001 / 90094 / consent_required → the org needs an admin to grant the permissions (PLAN §8 #2) */
  get needsAdminConsent(): boolean {
    return this.code === "consent_required" || this.code === "admin_consent_required" || this.aadsts === "65001" || this.aadsts === "90094" || this.aadsts === "650052";
  }
  /** refresh token revoked / expired / password changed → the user must reconnect */
  get needsReconnect(): boolean {
    return this.code === "invalid_grant" || this.code === "interaction_required";
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorityUrl(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`;
}

/** User sign-in + consent URL (PKCE S256, select_account so a shared device picks the right mailbox). */
export function buildAuthorizeUrl(cfg: Pick<MsOAuthConfig, "clientId" | "tenant" | "redirectUri">, opts: { state: string; codeChallenge: string; loginHint?: string; prompt?: "select_account" | "consent" }): string {
  const u = new URL(`${authorityUrl(cfg.tenant)}/oauth2/v2.0/authorize`);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", MS_SCOPES.join(" "));
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", opts.prompt ?? "select_account");
  if (opts.loginHint) u.searchParams.set("login_hint", opts.loginHint);
  return u.toString();
}

/**
 * Tenant-wide admin consent URL (v2 endpoint): the IT admin signs in once and grants the delegated permissions
 * for everyone in the organisation. Afterwards users connect without a consent prompt.
 */
export function buildAdminConsentUrl(cfg: Pick<MsOAuthConfig, "clientId">, opts: { state: string; redirectUri: string; tenant?: string }): string {
  const u = new URL(`${authorityUrl(opts.tenant ?? "organizations")}/v2.0/adminconsent`);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("scope", MS_ADMIN_SCOPES.map((s) => `https://graph.microsoft.com/${s}`).join(" "));
  return u.toString();
}

function parseAadsts(description: string | undefined): string | null {
  const m = description?.match(/AADSTS(\d+)/);
  return m ? m[1]! : null;
}

async function tokenRequest(cfg: MsOAuthConfig, body: Record<string, string>): Promise<MsTokens> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const res = await fetchImpl(`${authorityUrl(cfg.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const code = json.error ?? `http_${res.status}`;
    throw new MsOAuthError(`Microsoft token endpoint: ${code}${json.error_description ? ` — ${json.error_description.split("\n")[0]}` : ""}`, code, parseAadsts(json.error_description), res.status);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    scope: (json.scope ?? "").split(" ").filter(Boolean),
    idToken: json.id_token ?? null,
  };
}

export function exchangeCode(cfg: MsOAuthConfig, code: string, codeVerifier: string): Promise<MsTokens> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: codeVerifier, scope: MS_SCOPES.join(" ") });
}

export function refreshTokens(cfg: MsOAuthConfig, refreshToken: string): Promise<MsTokens> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken, scope: MS_SCOPES.join(" ") });
}

/** Claims from the id_token (payload only — issued to us over TLS by the token endpoint, no signature check needed here). */
export function parseIdToken(idToken: string | null): IdTokenClaims {
  const empty: IdTokenClaims = { tid: null, oid: null, preferred_username: null, name: null, email: null };
  if (!idToken) return empty;
  const parts = idToken.split(".");
  if (parts.length < 2) return empty;
  try {
    const p = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
    return { tid: s("tid"), oid: s("oid"), preferred_username: s("preferred_username"), name: s("name"), email: s("email") ?? s("preferred_username") };
  } catch {
    return empty;
  }
}

/** Hebrew EnvError when MS_CLIENT_ID / MS_CLIENT_SECRET / APP_URL are missing. */
export function msOAuthConfigFromEnv(fetchImpl?: typeof fetch): MsOAuthConfig {
  const env = requireEnv(["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT", "APP_URL"]);
  return { clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET, tenant: env.MS_TENANT, redirectUri: new URL("/api/auth/microsoft/callback", env.APP_URL).toString(), fetchImpl };
}
