import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EnvError } from "@/lib/env";
import { createGoogleFixture } from "./__fixtures__/google-fixtures";
import {
  GOOGLE_BASE_SCOPES,
  GOOGLE_SCOPES,
  GoogleOAuthError,
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  gmailReadEnabled,
  googleOAuthConfigFromEnv,
  hasScope,
  missingScopes,
  normalizeScopes,
  parseGoogleIdToken,
  pkcePair,
  refreshGoogleTokens,
  revokeGoogleToken,
  scopesForRequest,
} from "./oauth";

const cfg = { clientId: "cid.apps.googleusercontent.com", clientSecret: "sec", redirectUri: "https://app.example.co.il/api/auth/google/callback" };

describe("Google OAuth", () => {
  it("builds the consent URL: offline, consent, incremental, PKCE S256, phase-1 scopes only", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    const u = new URL(buildGoogleAuthorizeUrl(cfg, { state: "st", codeChallenge: challenge }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: "st",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(u.searchParams.get("scope")).not.toContain("gmail.readonly");
    const hinted = new URL(buildGoogleAuthorizeUrl(cfg, { state: "s", codeChallenge: "c", loginHint: "dana.levi@gmail.com", scopes: scopesForRequest("gmail_read") }));
    expect(hinted.searchParams.get("login_hint")).toBe("dana.levi@gmail.com");
    expect(hinted.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.readonly");
  });

  it("exchanges the code with the PKCE verifier and parses tokens + id_token claims", async () => {
    const f = createGoogleFixture();
    const t = await exchangeGoogleCode({ ...cfg, fetchImpl: f.fetchImpl }, "4/0Afix", "ver-123");
    const call = f.state.calls[0]!;
    expect(call.url).toBe("https://oauth2.googleapis.com/token");
    expect(call.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(call.body).toEqual({ client_id: cfg.clientId, client_secret: "sec", grant_type: "authorization_code", code: "4/0Afix", redirect_uri: cfg.redirectUri, code_verifier: "ver-123" });
    expect(t.accessToken).toMatch(/^ya29\./);
    expect(t.refreshToken).toMatch(/^1\/\//);
    expect(t.scope).toEqual(normalizeScopes([...GOOGLE_BASE_SCOPES]));
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    expect(t.refreshTokenExpiresAt).toBeNull();
    expect(parseGoogleIdToken(t.idToken)).toEqual({ sub: "109876543210", email: "dana.levi@gmail.com", emailVerified: true, name: "דנה לוי", hd: null });
    expect(parseGoogleIdToken("not-a-jwt").email).toBeNull();
  });

  it("refreshes (no new refresh token) and reports time-limited access", async () => {
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ client_id: cfg.clientId, client_secret: "sec", grant_type: "refresh_token", refresh_token: "1//rt" });
      return new Response(JSON.stringify({ access_token: "ya29.new", expires_in: 3599, scope: "https://www.googleapis.com/auth/calendar.events", token_type: "Bearer", refresh_token_expires_in: 604_800 }), { status: 200 });
    });
    const t = await refreshGoogleTokens({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch }, "1//rt");
    expect(t.refreshToken).toBeNull();
    expect(t.refreshTokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(604_000_000);
  });

  it("classifies token errors: invalid_grant → reconnect, admin_policy_enforced → admin blocked", async () => {
    const mk = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 400 })) as unknown as typeof fetch;
    const revoked = (await refreshGoogleTokens({ ...cfg, fetchImpl: mk({ error: "invalid_grant", error_description: "Token has been expired or revoked." }) }, "rt").catch((e: unknown) => e)) as GoogleOAuthError;
    expect(revoked).toBeInstanceOf(GoogleOAuthError);
    expect(revoked.needsReconnect).toBe(true);
    expect(revoked.message).toContain("expired or revoked");
    const admin = (await exchangeGoogleCode({ ...cfg, fetchImpl: mk({ error: "admin_policy_enforced" }) }, "c", "v").catch((e: unknown) => e)) as GoogleOAuthError;
    expect(admin.adminBlocked).toBe(true);
    expect(admin.needsReconnect).toBe(false);
    const down = (await exchangeGoogleCode({ ...cfg, fetchImpl: (async () => new Response("oops", { status: 503 })) as unknown as typeof fetch }, "c", "v").catch((e: unknown) => e)) as GoogleOAuthError;
    expect(down.code).toBe("http_503");
  });

  it("revokes tokens; an already-invalid token counts as revoked", async () => {
    const f = createGoogleFixture();
    expect(await revokeGoogleToken("1//rt", f.fetchImpl)).toEqual({ ok: true, status: 200 });
    expect(f.state.calls[0]).toMatchObject({ method: "POST", url: "https://oauth2.googleapis.com/revoke", body: { token: "1//rt" } });
    expect(f.state.revoked).toEqual(["1//rt"]);
    expect(await revokeGoogleToken("unknown", f.fetchImpl)).toMatchObject({ ok: true, status: 400, error: "invalid_token" });
    expect(await revokeGoogleToken("x", (async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toMatchObject({ ok: false, status: 500 });
  });

  it("normalizes granted scopes and finds what granular consent left out", () => {
    const granted = normalizeScopes("openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events");
    expect(granted).toEqual(["email", "https://www.googleapis.com/auth/calendar.events", "openid"]);
    expect(hasScope(granted, "https://www.googleapis.com/auth/userinfo.email")).toBe(true);
    expect(missingScopes(granted, GOOGLE_BASE_SCOPES)).toEqual([GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend, "profile"]);
    expect(scopesForRequest()).toEqual([...GOOGLE_BASE_SCOPES]);
  });

  it("reads config and the Gmail-read flag from env, failing in Hebrew when missing", () => {
    try {
      vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      vi.stubEnv("APP_URL", "https://app.example.co.il");
      const err = (() => {
        try {
          googleOAuthConfigFromEnv();
          return null;
        } catch (e) {
          return e as EnvError;
        }
      })();
      expect(err).toBeInstanceOf(EnvError);
      expect(err!.missing).toEqual(["GOOGLE_CLIENT_SECRET"]);
      expect(err!.message).toContain("משתני סביבה חסרים");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
      expect(googleOAuthConfigFromEnv()).toMatchObject({ clientId: "cid", clientSecret: "sec", redirectUri: "https://app.example.co.il/api/auth/google/callback" });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(gmailReadEnabled({})).toBe(false);
    expect(gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "" })).toBe(false);
    expect(gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "false" })).toBe(false);
    expect(gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "true" })).toBe(true);
    expect(() => gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "maybe" })).toThrow(EnvError);
  });
});
