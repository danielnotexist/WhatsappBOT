import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { CSP_REPORT_ONLY, SECURITY_HEADERS, config, proxy as proxyFor } from "./proxy";

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
    expect(re.test("/favicon.ico")).toBe(false);
    expect(re.test("/images/hero.png")).toBe(false);
  });
});
