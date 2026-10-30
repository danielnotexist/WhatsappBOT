import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECT_TTL_SECONDS, clearConnectCookieHeader, connectCookieHeader, connectCookieMatches, openConnectPending, sealConnectPending, withConnectCookieCleared } from "./connect-cookie";

const UID = "123e4567-e89b-42d3-a456-426614174000";
const req = (cookie?: string) => new Request("https://app.example.co.il/api/auth/google/callback", { headers: cookie ? { cookie } : {} });

describe("the connect flow's browser binding (lib/auth/connect-cookie.ts)", () => {
  beforeEach(() => vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64")));
  afterEach(() => vi.unstubAllEnvs());

  it("matches only this provider, this user and this state, within 30 minutes", () => {
    const now = new Date();
    const v = sealConnectPending({ provider: "google", userId: UID, state: "s1" }, { now });
    expect(connectCookieMatches(req(`wb_connect_google=${v}`), "google", "s1", UID)).toBe(true);
    expect(connectCookieMatches(req(`wb_connect_google=${v}`), "google", "s2", UID)).toBe(false);
    expect(connectCookieMatches(req(`wb_connect_google=${v}`), "google", "s1", "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(connectCookieMatches(req(`wb_connect_microsoft=${v}`), "microsoft", "s1", UID)).toBe(false);
    expect(connectCookieMatches(req(), "google", "s1", UID)).toBe(false);
    expect(connectCookieMatches(req(`wb_connect_google=${v.slice(0, -2)}xx`), "google", "s1", UID)).toBe(false);
    expect(openConnectPending(v, "google", { now: new Date(now.getTime() + (CONNECT_TTL_SECONDS + 1) * 1000) })).toBeNull();
  });

  it("is httpOnly, Lax and scoped to /api/auth; clearing keeps the response's other cookies", () => {
    expect(connectCookieHeader("google", "x", true)).toBe(`wb_connect_google=x; Path=/api/auth; Max-Age=${CONNECT_TTL_SECONDS}; HttpOnly; SameSite=Lax; Secure`);
    const res = new Response(null, { status: 303, headers: { location: "https://app.example.co.il/account", "set-cookie": "wb_session=abc; Path=/" } });
    const out = withConnectCookieCleared(res, "google");
    expect(out.headers.get("location")).toBe("https://app.example.co.il/account");
    expect(out.headers.getSetCookie()).toEqual(["wb_session=abc; Path=/", clearConnectCookieHeader("google")]);
    // a response that binds a fresh state keeps it
    const fresh = new Response(null, { status: 303, headers: { location: "https://login.microsoftonline.com/x", "set-cookie": connectCookieHeader("microsoft", "y") } });
    expect(withConnectCookieCleared(fresh, "microsoft").headers.getSetCookie()).toEqual([connectCookieHeader("microsoft", "y")]);
  });
});
