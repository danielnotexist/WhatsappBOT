import { describe, expect, it } from "vitest";
import { CSP_REPORT_ONLY, SECURITY_HEADERS, config, proxy } from "./proxy";

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
