import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MS_ADMIN_SCOPES, MS_SCOPES, MS_SCOPES_V1, MsOAuthError, buildAdminConsentUrl, buildAuthorizeUrl, exchangeCode, msHasScope, msRefreshScopes, normalizeMsScopes, parseIdToken, pkcePair, refreshTokens } from "./oauth";
import { getAccessToken, sealTokens } from "./token-store";

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

  it("asks for Microsoft To Do and SharePoint (Tasks.ReadWrite, Sites.Read.All) on connect and in the admin consent — not Chat.Read", () => {
    expect(MS_SCOPES).toEqual(["openid", "profile", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All", "Tasks.ReadWrite", "Sites.Read.All"]);
    expect(MS_ADMIN_SCOPES).toEqual(["User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All", "Tasks.ReadWrite", "Sites.Read.All"]);
    const u = new URL(buildAuthorizeUrl(cfg, { state: "s", codeChallenge: "c" }));
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["Tasks.ReadWrite", "Sites.Read.All"]));
    const admin = new URL(buildAdminConsentUrl(cfg, { state: "s", redirectUri: cfg.redirectUri })).searchParams.get("scope")!;
    expect(admin).toContain("https://graph.microsoft.com/Tasks.ReadWrite");
    expect(admin).toContain("https://graph.microsoft.com/Sites.Read.All");
    expect(admin).not.toMatch(/Chat\./);
  });

  it("normalizes echoed scopes (Graph prefix, any case) and checks a connection's grant; nothing recorded = the v1 set", () => {
    expect(normalizeMsScopes("https://graph.microsoft.com/tasks.readwrite openid Mail.Send mail.send https://graph.microsoft.com/Custom.Thing")).toEqual(["Tasks.ReadWrite", "openid", "Mail.Send", "Custom.Thing"]);
    expect(msHasScope(["https://graph.microsoft.com/SITES.READ.ALL"], "Sites.Read.All")).toBe(true);
    expect(msHasScope([], "Files.Read.All")).toBe(true);
    expect(msHasScope([], "Tasks.ReadWrite")).toBe(false);
    expect(msHasScope(["Mail.ReadWrite"], "Files.Read.All")).toBe(false);
  });

  it("refreshes with the connection's own grant, never a wider set (a superset would fail with AADSTS65001 and expire the connection)", () => {
    expect(msRefreshScopes(["Mail.ReadWrite", "User.Read", "openid", "profile"])).toEqual(["openid", "profile", "email", "offline_access", "Mail.ReadWrite", "User.Read"]);
    expect(msRefreshScopes([])).toEqual(["openid", "profile", "email", "offline_access", ...MS_SCOPES_V1.slice(4)]);
    expect(msRefreshScopes([...MS_SCOPES])).toContain("Tasks.ReadWrite");
  });

  it("the token store refreshes a connection made before Tasks / Sites with its own scopes, and keeps it active", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    try {
      const db = new MemoryDb();
      const user = await db.createUser("dana@example.com");
      const conn = await db.upsertConnection({ user_id: user.id, provider: "microsoft", account_email: "dana@levi-law.co.il", tenant_id: "t1", scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All", "openid", "profile", "email"], consent_type: "user", ...sealTokens(user.id, { accessToken: "old", refreshToken: "rt", expiresAt: new Date(Date.now() - 60_000), scope: [], idToken: null }) });
      let asked = "";
      const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
        asked = new URLSearchParams(String(init?.body)).get("scope") ?? "";
        return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600, scope: "Mail.ReadWrite" }), { status: 200 });
      });
      expect(await getAccessToken(db, { ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch }, conn)).toBe("fresh");
      expect(asked.split(" ")).not.toContain("Tasks.ReadWrite");
      expect(asked.split(" ")).not.toContain("Sites.Read.All");
      expect(asked.split(" ")).toEqual(expect.arrayContaining(["offline_access", "Mail.ReadWrite", "Files.Read.All"]));
      expect((await db.listConnections(user.id))[0]!.status).toBe("active");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
