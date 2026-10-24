import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { verifyOtp, type OtpDeps } from "@/lib/auth/otp";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { MemoryDb } from "@/lib/db/memory";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { adminHidden, proxy, visitSource } from "@/proxy";
import { SOURCE_COOKIE, decodeSource, encodeSource, sourceFromCookieHeader, sourceFromVisit, sourceLabel } from "./source";
import { ADMIN_COOKIE, ADMIN_GATE_COOKIE, createAdminToken, createGateToken } from "./tokens";

/** Where a person came from: the first visit's cookie (proxy.ts) and the user created from that browser (lib/auth/otp.ts). */
const NOW = new Date("2026-10-24T09:00:00Z");

describe("the visit's source", () => {
  it("takes the utm parameters, an outside referrer and the landing page", () => {
    const s = sourceFromVisit(new URL("https://alze.example/pricing?utm_source=test&utm_campaign=oct&x=1"), "https://www.linkedin.com/feed/", ["alze.example"], NOW);
    expect(s).toEqual({ utm_source: "test", utm_campaign: "oct", ref: "www.linkedin.com", landing: "/pricing", at: NOW.toISOString() });
    expect(sourceFromVisit(new URL("https://alze.example/"), "https://alze.example/terms", ["alze.example"], NOW)).toEqual({ landing: "/", at: NOW.toISOString() });
    expect(sourceLabel(s)).toBe("test");
    expect(sourceLabel({ ref: "www.google.com" })).toBe("www.google.com");
    expect(sourceLabel({ landing: "/" })).toBe("ישיר");
    expect(sourceLabel(null)).toBe("לא ידוע");
  });

  it("round-trips through the cookie; anything else is dropped", () => {
    const s = { utm_source: "test", landing: "/" };
    expect(decodeSource(encodeSource(s))).toEqual(s);
    expect(decodeSource(Buffer.from(JSON.stringify({ utm_source: "x".repeat(400), evil: "1", landing: 5 })).toString("base64url"))).toEqual({ utm_source: "x".repeat(120) });
    expect(decodeSource("not base64 !")).toBeNull();
    expect(decodeSource(Buffer.from("[1,2]").toString("base64url"))).toBeNull();
    expect(sourceFromCookieHeader(`a=1; ${SOURCE_COOKIE}=${encodeSource(s)}; b=2`)).toEqual(s);
    expect(sourceFromCookieHeader("a=1")).toBeNull();
  });
});

describe("proxy.ts: the alze_src cookie", () => {
  const req = (path: string, headers: Record<string, string> = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }) => new NextRequest(new URL(path, "http://localhost:3000"), { headers });

  it("is written on the first page load, never on the router's fetches, the API or the panel, and never twice", () => {
    const res = proxy(req("/?utm_source=test"));
    const cookie = res.cookies.get(SOURCE_COOKIE);
    expect(decodeSource(cookie?.value)).toMatchObject({ utm_source: "test", landing: "/" });
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(visitSource(req("/start", { "sec-fetch-mode": "cors" }))).toBeNull();
    expect(visitSource(req("/start", { "sec-fetch-mode": "navigate", rsc: "1" }))).toBeNull();
    expect(visitSource(req("/api/health"))).toBeNull();
    expect(visitSource(req("/admin"))).toBeNull();
    expect(visitSource(new NextRequest(new URL("http://localhost:3000/"), { headers: { cookie: `${SOURCE_COOKIE}=x`, "sec-fetch-mode": "navigate" } }))).toBeNull();
  });
});

describe("proxy.ts: /admin is a real 404 without the panel's cookies", () => {
  it("anonymous, a session alone, another user's gate: hidden; the gate or the open panel of this user: shown; /admin/enter always passes", () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 3).toString("base64"));
    const id = "44444444-4444-4444-8444-444444444444";
    const session = `${SESSION_COOKIE}=${createSessionToken(id)}`;
    const at = (path: string, cookie = "") => new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie } : {} });
    expect(adminHidden(at("/admin"))).toBe(true);
    expect(adminHidden(at("/admin", session))).toBe(true);
    expect(adminHidden(at("/admin", `${session}; ${ADMIN_GATE_COOKIE}=${createGateToken("55555555-5555-4555-8555-555555555555")}`))).toBe(true);
    expect(adminHidden(at("/admin", `${session}; ${ADMIN_GATE_COOKIE}=${createGateToken(id)}`))).toBe(false);
    expect(adminHidden(at("/admin/users/x", `${session}; ${ADMIN_COOKIE}=${createAdminToken(id)}`))).toBe(false);
    expect(adminHidden(at("/admin/enter"))).toBe(false);
    expect(adminHidden(at("/account"))).toBe(false);
    const hidden = proxy(at("/admin?tab=users", session));
    expect(hidden.headers.get("x-middleware-rewrite")).toContain("/_demo-chat-unavailable");
    expect(hidden.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    vi.unstubAllEnvs();
  });
});

describe("sign-in keeps the source on a new user only", () => {
  it("a new user gets the browser's source and a last-seen time; an existing user keeps theirs", async () => {
    const db = new MemoryDb();
    const deps: OtpDeps = { db, mailer: new ConsoleMailer(), limiter: new MemoryRateLimiter(), now: () => NOW, fixedCode: "123456", signupSource: { utm_source: "test", landing: "/" } };
    const r = await verifyOtp(deps, "new@example.com", "123456", "1.1.1.1");
    expect(r).toMatchObject({ ok: true, isNewUser: true });
    const user = await db.adminGetUser(r.ok ? r.userId : "");
    expect(user?.signup_source).toEqual({ utm_source: "test", landing: "/" });
    expect(user?.last_seen_at).toBe(NOW.toISOString());

    const again = await verifyOtp({ ...deps, signupSource: { utm_source: "other" } }, "new@example.com", "123456", "1.1.1.1");
    expect(again).toMatchObject({ ok: true, isNewUser: false });
    expect((await db.adminGetUser(user!.id))?.signup_source).toEqual({ utm_source: "test", landing: "/" });

    // a failing write never fails the sign-in
    db.setSignupSource = async () => {
      throw new Error("column signup_source does not exist");
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await verifyOtp(deps, "third@example.com", "123456", "1.1.1.1")).toMatchObject({ ok: true, isNewUser: true });
  });
});
