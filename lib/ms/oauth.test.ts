import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MS_SCOPES, MsOAuthError, buildAdminConsentUrl, buildAuthorizeUrl, exchangeCode, parseIdToken, pkcePair, refreshTokens } from "./oauth";

const cfg = { clientId: "cid", clientSecret: "sec", tenant: "common", redirectUri: "https://app.example.co.il/api/auth/microsoft/callback" };

describe("Microsoft OAuth", () => {
  it("builds PKCE pairs and the authorize / admin-consent URLs", () => {
    const { verifier, challenge } = pkcePair();
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    const u = new URL(buildAuthorizeUrl(cfg, { state: "st", codeChallenge: challenge, loginHint: "dana@x.co" }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe(MS_SCOPES.join(" "));
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.get("login_hint")).toBe("dana@x.co");
    const a = new URL(buildAdminConsentUrl(cfg, { state: "st", redirectUri: cfg.redirectUri }));
    expect(a.pathname).toBe("/organizations/v2.0/adminconsent");
    expect(a.searchParams.get("scope")).toContain("https://graph.microsoft.com/Mail.ReadWrite");
    expect(a.searchParams.get("scope")).not.toContain("offline_access");
  });

  it("exchanges a code with PKCE and parses the token response", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code_verifier")).toBe("ver");
      expect(body.get("client_secret")).toBe("sec");
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "Mail.ReadWrite Mail.Send", id_token: "h." + Buffer.from(JSON.stringify({ tid: "t1", oid: "o1", preferred_username: "dana@x.co", name: "דנה" })).toString("base64url") + ".s" }), { status: 200 });
    });
    const t = await exchangeCode({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch }, "code1", "ver");
    expect(t.accessToken).toBe("at");
    expect(t.refreshToken).toBe("rt");
    expect(t.scope).toEqual(["Mail.ReadWrite", "Mail.Send"]);
    expect(parseIdToken(t.idToken)).toEqual({ tid: "t1", oid: "o1", preferred_username: "dana@x.co", name: "דנה", email: "dana@x.co" });
    expect(parseIdToken("garbage")).toMatchObject({ tid: null });
  });

  it("classifies AADSTS errors: admin consent vs reconnect", async () => {
    const mk = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 400 })) as unknown as typeof fetch;
    const consent = (await refreshTokens({ ...cfg, fetchImpl: mk({ error: "invalid_grant", error_description: "AADSTS65001: The user or administrator has not consented" }) }, "rt").catch((e: unknown) => e)) as MsOAuthError;
    expect(consent).toBeInstanceOf(MsOAuthError);
    expect(consent.aadsts).toBe("65001");
    expect(consent.needsAdminConsent).toBe(true);
    const revoked = (await refreshTokens({ ...cfg, fetchImpl: mk({ error: "invalid_grant", error_description: "AADSTS50173: The provided grant has expired" }) }, "rt").catch((e: unknown) => e)) as MsOAuthError;
    expect(revoked.needsReconnect).toBe(true);
    expect(revoked.needsAdminConsent).toBe(false);
  });
});
