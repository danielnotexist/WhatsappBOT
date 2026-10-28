import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { UserRow } from "@/lib/db/types";
import { parseMsSignInClaims } from "@/lib/ms/oauth";
import {
  MSA_TENANT_ID,
  clearSsoCookieHeader,
  decideSso,
  googleIdentity,
  microsoftIdentity,
  openSsoPending,
  readCookie,
  sealSsoPending,
  ssoAuditTarget,
  ssoCodeUrl,
  ssoCookieHeader,
  ssoErrorUrl,
  ssoStateMatches,
  type SsoPending,
} from "./sso";

const key = randomBytes(32);
const pending = (over: Partial<SsoPending> = {}): SsoPending => ({ v: 1, provider: "google", state: "st4te", verifier: "v".repeat(64), from: "login", started_at: new Date().toISOString(), ...over });
const user = { id: "00000000-0000-4000-8000-000000000001", email: "dana@levi-law.co.il" } as UserRow;
const idToken = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("the pending sign-in cookie", () => {
  it("seals and opens for the same provider; a changed byte, another key or another provider opens nothing", () => {
    const sealed = sealSsoPending(pending(), key);
    expect(sealed).not.toContain("st4te"); // encrypted, not just signed: the PKCE verifier never shows
    expect(openSsoPending(sealed, "google", { key })).toMatchObject({ state: "st4te", from: "login", provider: "google" });
    expect(openSsoPending(sealed, "microsoft", { key })).toBeNull();
    expect(openSsoPending(sealed, "google", { key: randomBytes(32) })).toBeNull();
    const parts = sealed.split(".");
    parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith("A") ? "BB" : "AA");
    expect(openSsoPending(parts.join("."), "google", { key })).toBeNull();
    expect(openSsoPending("garbage", "google", { key })).toBeNull();
    expect(openSsoPending(null, "google", { key })).toBeNull();
  });

  it("is good for 15 minutes", () => {
    const sealed = sealSsoPending(pending({ started_at: "2026-10-28T10:00:00.000Z" }), key);
    expect(openSsoPending(sealed, "google", { key, now: new Date("2026-10-28T10:14:00.000Z") })).not.toBeNull();
    expect(openSsoPending(sealed, "google", { key, now: new Date("2026-10-28T10:16:00.000Z") })).toBeNull();
  });

  it("the state matches only exactly", () => {
    expect(ssoStateMatches(pending(), "st4te")).toBe(true);
    expect(ssoStateMatches(pending(), "st4tE")).toBe(false);
    expect(ssoStateMatches(pending(), "")).toBe(false);
    expect(ssoStateMatches(pending({ state: "" }), "")).toBe(false);
  });

  it("is httpOnly, Lax, on /api/auth only, and cleared with Max-Age=0", () => {
    expect(ssoCookieHeader("x", true)).toBe("wb_sso=x; Path=/api/auth; Max-Age=900; HttpOnly; SameSite=Lax; Secure");
    expect(clearSsoCookieHeader(false)).toBe("wb_sso=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax");
    expect(readCookie("a=1; wb_sso=abc.def; b=2", "wb_sso")).toBe("abc.def");
    expect(readCookie("a=1", "wb_sso")).toBeNull();
  });
});

describe("Google: the email counts only when Google verified it", () => {
  it("email_verified true → trusted; false → untrusted; no address → nothing", () => {
    expect(googleIdentity({ sub: "1", email: "Dana.Levi@Gmail.com", emailVerified: true, name: "דנה" })).toMatchObject({ email: "dana.levi@gmail.com", trusted: true, basis: "email_verified", subject: "1" });
    expect(googleIdentity({ sub: "1", email: "dana@example.com", emailVerified: false, name: null })).toMatchObject({ trusted: false, basis: "unverified" });
    expect(googleIdentity({ sub: "1", email: null, emailVerified: true, name: null })).toBeNull();
    expect(googleIdentity({ sub: "1", email: "not-an-email", emailVerified: true, name: null })).toBeNull();
  });
});

describe("Microsoft: personal accounts and xms_edov are trusted, anything else may only create a new account", () => {
  it("a personal account (consumer tenant) → trusted, by its email", () => {
    const id = microsoftIdentity(parseMsSignInClaims(idToken({ tid: MSA_TENANT_ID, oid: "o1", email: "Dana@Outlook.com", preferred_username: "dana@outlook.com" })));
    expect(id).toMatchObject({ email: "dana@outlook.com", trusted: true, basis: "msa", subject: "o1", tenant: MSA_TENANT_ID });
  });

  it("a work account with xms_edov=true → trusted, by its email claim", () => {
    const id = microsoftIdentity(parseMsSignInClaims(idToken({ tid: "t1", oid: "o2", email: "dana@levi-law.co.il", preferred_username: "dana@levilaw.onmicrosoft.com", xms_edov: true })));
    expect(id).toMatchObject({ email: "dana@levi-law.co.il", trusted: true, basis: "xms_edov" });
  });

  it("a work account without xms_edov → preferred_username, untrusted (the email claim is never used: an admin can set it to anything)", () => {
    const id = microsoftIdentity(parseMsSignInClaims(idToken({ tid: "t1", oid: "o3", email: "boss@victim.co.il", preferred_username: "attacker@evil.onmicrosoft.com" })));
    expect(id).toMatchObject({ email: "attacker@evil.onmicrosoft.com", trusted: false, basis: "unverified" });
    for (const edov of [false, "false", 0, null]) {
      expect(microsoftIdentity(parseMsSignInClaims(idToken({ tid: "t1", email: "boss@victim.co.il", preferred_username: "a@evil.co", xms_edov: edov })))!.trusted).toBe(false);
    }
    expect(microsoftIdentity(parseMsSignInClaims(idToken({ tid: "t1", email: "boss@victim.co.il" })))).toBeNull();
  });

  it("parses the raw claims without falling back from email to preferred_username", () => {
    expect(parseMsSignInClaims(idToken({ tid: "t", preferred_username: "p@x.co" }))).toEqual({ tid: "t", oid: null, email: null, preferred_username: "p@x.co", name: null, xms_edov: false });
    expect(parseMsSignInClaims(null).xms_edov).toBe(false);
    expect(parseMsSignInClaims("not.a-token").email).toBeNull();
  });
});

describe("the decision", () => {
  it("no account → signup; an account → login only for a trusted email, else the email code", () => {
    expect(decideSso({ trusted: false }, null)).toEqual({ kind: "signup" });
    expect(decideSso({ trusted: true }, user)).toEqual({ kind: "login", user });
    expect(decideSso({ trusted: false }, user)).toEqual({ kind: "verify_by_code", user });
  });

  it("the audit names the provider, the tenant and the subject", () => {
    expect(ssoAuditTarget({ provider: "microsoft", tenant: "t1", subject: "o1" })).toBe("microsoft:t1:o1");
    expect(ssoAuditTarget({ provider: "google", tenant: null, subject: "109" })).toBe("google:109");
  });

  it("redirects only to fixed pages with fixed codes", () => {
    expect(ssoErrorUrl("https://alze.example", "login", "unverified")).toBe("https://alze.example/login?sso_error=unverified");
    expect(ssoErrorUrl("https://alze.example", "start", "state")).toBe("https://alze.example/start?sso_error=state");
    expect(ssoCodeUrl("https://alze.example", "dana@levi-law.co.il", 60, "microsoft")).toBe("https://alze.example/login/code?email=dana%40levi-law.co.il&wait=60&sso=microsoft");
  });
});
