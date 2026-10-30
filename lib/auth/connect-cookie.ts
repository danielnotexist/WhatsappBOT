import { decryptToken, encryptToken } from "@/lib/crypto";
import { derivedKey } from "./keys";
import { readCookie, ssoStateMatches } from "./sso";

/**
 * The connect flow (a signed-in user or a chat link adds a Google / Microsoft 365 mailbox) is bound to the browser
 * that started it: the start route seals {provider, user, state} into an httpOnly cookie on /api/auth, and the
 * callback finishes only when that cookie opens, names the user the state belongs to, and holds the same state.
 * Without it, an authorize URL captured from one account's start route (its state and PKCE challenge) could be handed
 * to someone else, whose consent would then attach their mailbox to that account.
 * One cookie per provider (a Google and a Microsoft connect may run side by side); 30 minutes, like the state.
 */
export const CONNECT_COOKIE_PATH = "/api/auth";
export const CONNECT_TTL_SECONDS = 30 * 60;

export type ConnectProvider = "microsoft" | "google";

export const connectCookieName = (provider: ConnectProvider): string => `wb_connect_${provider}`;

interface ConnectPending {
  v: 1;
  provider: ConnectProvider;
  userId: string;
  state: string;
  started_at: string;
}

const AAD = "wb_connect:v1";

export function sealConnectPending(p: { provider: ConnectProvider; userId: string; state: string }, opts: { key?: Buffer; now?: Date } = {}): string {
  const pending: ConnectPending = { v: 1, provider: p.provider, userId: p.userId, state: p.state, started_at: (opts.now ?? new Date()).toISOString() };
  return encryptToken(JSON.stringify(pending), { key: opts.key ?? derivedKey("sso"), aad: AAD });
}

/** The cookie's pending connect for `provider`, or null (missing, not ours, another provider's, malformed, stale). */
export function openConnectPending(value: string | null | undefined, provider: ConnectProvider, opts: { key?: Buffer; now?: Date } = {}): ConnectPending | null {
  if (!value || value.length > 4096) return null;
  try {
    const p = JSON.parse(decryptToken(value, { key: opts.key ?? derivedKey("sso"), aad: AAD })) as Partial<ConnectPending>;
    if (p.v !== 1 || p.provider !== provider || typeof p.userId !== "string" || typeof p.state !== "string" || typeof p.started_at !== "string") return null;
    const started = Date.parse(p.started_at);
    const now = (opts.now ?? new Date()).getTime();
    if (!Number.isFinite(started) || now - started > CONNECT_TTL_SECONDS * 1000 || started - now > 60_000) return null;
    return p as ConnectPending;
  } catch {
    return null;
  }
}

/** Does this request's cookie bind `state` to `userId` for `provider`? (constant-time state compare) */
export function connectCookieMatches(request: Request, provider: ConnectProvider, state: string | null | undefined, userId: string): boolean {
  const pending = openConnectPending(readCookie(request.headers.get("cookie"), connectCookieName(provider)), provider);
  return Boolean(pending && pending.userId === userId && ssoStateMatches(pending, state));
}

const secureDefault = () => process.env.NODE_ENV === "production";

/** Set-Cookie for the pending connect: httpOnly, Lax (the provider's redirect back is a top-level GET), /api/auth only. */
export function connectCookieHeader(provider: ConnectProvider, value: string, secure: boolean = secureDefault()): string {
  return `${connectCookieName(provider)}=${value}; Path=${CONNECT_COOKIE_PATH}; Max-Age=${CONNECT_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearConnectCookieHeader(provider: ConnectProvider, secure: boolean = secureDefault()): string {
  return `${connectCookieName(provider)}=; Path=${CONNECT_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** A 303 to `location` that sets / clears cookies (Response.redirect's headers are immutable). */
export function redirectSettingCookies(location: string, cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
}

/** A redirect the callback built, now also clearing the provider's connect cookie (the flow is over, single use). */
export function withConnectCookieCleared(res: Response, provider: ConnectProvider): Response {
  if (!res.headers.get("location") || res.status < 300 || res.status >= 400) return res;
  // a callback that starts the provider again (Microsoft's retry without the meeting scopes) sets a fresh one: keep it
  if (res.headers.getSetCookie().some((c) => c.startsWith(`${connectCookieName(provider)}=`))) return res;
  const headers = new Headers(res.headers);
  headers.append("set-cookie", clearConnectCookieHeader(provider));
  headers.set("cache-control", "no-store");
  return new Response(null, { status: res.status, headers });
}
