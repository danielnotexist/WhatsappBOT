import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "./lib/auth/session";
import { CSP_REPORT_ONLY, SECURITY_HEADERS, config, demoChatHidden, proxy as proxyFor } from "./proxy";

/** A request as the browser makes it: a page load unless `mode` says otherwise. */
function request(path = "/start", mode: string | null = "navigate") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: mode ? { "sec-fetch-mode": mode } : {} });
}
const proxy = (path?: string, mode?: string | null) => proxyFor(request(path, mode));

describe("proxy.ts security headers", () => {
  it("sets every security header on the pass-through response", () => {
    const response = proxy();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses report-only CSP for now (never the enforcing header)", () => {
    const response = proxy();
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(CSP_REPORT_ONLY);
    expect(CSP_REPORT_ONLY).toContain("frame-ancestors 'none'");
    expect(CSP_REPORT_ONLY).toContain("object-src 'none'");
    expect(CSP_REPORT_ONLY).toContain("https://pay.hyp.co.il");
  });

  it("has nosniff, referrer and permissions policies", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=()");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("/demo/chat: hidden (404 rewrite) outside DEMO_MODE and without a valid session; open to a signed-in demo visitor", () => {
    const req = (cookie?: string) => new NextRequest(new URL("/demo/chat", "http://localhost:3000"), { headers: cookie ? { cookie } : {} });
    expect(demoChatHidden(req())).toBe(true);
    expect(demoChatHidden(new NextRequest(new URL("/account", "http://localhost:3000")))).toBe(false);
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 2).toString("base64"));
    try {
      expect(demoChatHidden(req())).toBe(true);
      expect(demoChatHidden(req(`${SESSION_COOKIE}=forged.token`))).toBe(true);
      const token = createSessionToken("11111111-1111-4111-8111-111111111111");
      expect(demoChatHidden(req(`${SESSION_COOKIE}=${token}`))).toBe(false);
      const hidden = proxyFor(req());
      expect(hidden.headers.get("x-middleware-rewrite")).toContain("/_demo-chat-unavailable");
      expect(proxyFor(req(`${SESSION_COOKIE}=${token}`)).headers.get("x-middleware-rewrite")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the microphone is off everywhere except the website chat (voice messages), and only for this site there", () => {
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("microphone=()");
    expect(proxy("/account").headers.get("Permissions-Policy")).toContain("microphone=()");
    const chat = proxy("/demo/chat").headers.get("Permissions-Policy")!;
    expect(chat).toContain("microphone=(self)");
    expect(chat).toContain("camera=()");
    expect(proxy("/demo/chat/x").headers.get("Permissions-Policy")).toContain("microphone=()");
  });

  it("DEMO_MODE=1 adds X-Robots-Tag: noindex, nofollow (read per request); nothing outside the demo", () => {
    expect(proxy().headers.get("X-Robots-Tag")).toBeNull();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 2).toString("base64"));
    try {
      expect(proxy().headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      // a misconfigured demo does not serve pages at all
      vi.stubEnv("WA_ACCESS_TOKEN", "real");
      expect(() => proxy()).toThrow(/WA_ACCESS_TOKEN/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("APP_URL on *.vercel.app adds X-Robots-Tag: noindex with the demo off too", () => {
    vi.stubEnv("APP_URL", "https://alze-nine.vercel.app");
    try {
      expect(proxy().headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("/demo/chat with WEB_CHAT=1 outside the demo: open to a signed-in visitor only", () => {
    const req = (cookie?: string) => new NextRequest(new URL("/demo/chat", "http://localhost:3000"), { headers: cookie ? { cookie } : {} });
    vi.stubEnv("WEB_CHAT", "1");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 2).toString("base64"));
    try {
      expect(demoChatHidden(req())).toBe(true);
      expect(demoChatHidden(req(`${SESSION_COOKIE}=${createSessionToken("11111111-1111-4111-8111-111111111111")}`))).toBe(false);
      vi.stubEnv("WEB_CHAT", "");
      expect(demoChatHidden(req(`${SESSION_COOKIE}=${createSessionToken("11111111-1111-4111-8111-111111111111")}`))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a page load of a code card without an email goes back to the matching email card (with the headers)", () => {
    for (const [path, home] of [
      ["/start/code", "/start/email"],
      ["/login/code", "/login/email"],
      ["/start/code?email=", "/start/email"],
      ["/start/code?updates=1", "/start/email"],
    ] as const) {
      for (const mode of ["navigate", null]) {
        const response = proxy(path, mode);
        expect(response.status, `${path} ${mode}`).toBe(307);
        expect(new URL(response.headers.get("location")!).pathname).toBe(home);
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      }
    }
  });

  it("never redirects a code card with an email, nor the router's own fetches (prefetch / client navigation)", () => {
    expect(proxy("/start/code?email=dana%40levi-law.co.il").headers.get("x-middleware-next")).toBe("1");
    expect(proxy("/login/code?email=dana%40levi-law.co.il&wait=12").headers.get("x-middleware-next")).toBe("1");
    expect(proxy("/start/code", "cors").headers.get("x-middleware-next")).toBe("1");
    expect(proxy("/login/code", "same-origin").headers.get("x-middleware-next")).toBe("1");
    expect(proxy("/start/email").headers.get("x-middleware-next")).toBe("1");
  });

  it("skips static assets in the matcher", () => {
    const [pattern] = config.matcher;
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("/")).toBe(true);
    expect(re.test("/start")).toBe(true);
    expect(re.test("/api/health")).toBe(true);
    expect(re.test("/_next/static/chunks/main.js")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
    expect(re.test("/brand/mascot/front.webp")).toBe(false);
    expect(re.test("/icon.png")).toBe(false);
  });

  it("never skips a dynamic route because its path ends in a file extension (/pay/<token>.png keeps the headers)", () => {
    const [pattern] = config.matcher;
    const re = new RegExp(`^${pattern}$`);
    for (const path of ["/pay/abc.def.png", "/invoice/abc.svg", "/admin/users.woff2", "/login/w/x.webp", "/account.jpg", "/_next/staticx.png"]) {
      expect(re.test(path), path).toBe(true);
    }
    expect(proxy("/pay/abc.def.png").headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("CSP reports go to the site's own endpoint; no database host and no third-party images", () => {
    expect(CSP_REPORT_ONLY).toContain("report-uri /api/csp-report");
    expect(CSP_REPORT_ONLY).toContain("report-to csp");
    expect(SECURITY_HEADERS["Reporting-Endpoints"]).toBe('csp="/api/csp-report"');
    expect(CSP_REPORT_ONLY).not.toContain("supabase");
    expect(CSP_REPORT_ONLY).toContain("img-src 'self' data: blob:;");
  });

  it("next.config.ts headers(): the same headers on every path as a backup, the mic only on the website chat", async () => {
    const { default: nextConfig } = await import("./next.config");
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(all.headers.find((h) => h.key === name)?.value, name).toBe(value);
    }
    const last = rules.filter((r) => r.source === "/demo/chat").at(-1)!;
    expect(last.headers.find((h) => h.key === "Permissions-Policy")?.value).toContain("microphone=(self)");
    expect(rules.indexOf(last)).toBeGreaterThan(rules.indexOf(all));
  });
});
