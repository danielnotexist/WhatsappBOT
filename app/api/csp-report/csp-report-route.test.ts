import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { CSP_REPORT_LIMIT, POST, redactUrl, summarizeReports } from "./route";

function report(body: unknown, ip = "203.0.113.7", type = "application/csp-report") {
  return new Request("http://localhost:3000/api/csp-report", {
    method: "POST",
    headers: { "content-type": type, "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/csp-report", () => {
  afterEach(() => {
    setRateLimiterForTests(undefined);
    vi.restoreAllMocks();
  });

  it("logs a redacted line for a legacy report-uri body and answers 204", async () => {
    setRateLimiterForTests(new MemoryRateLimiter());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(report({ "csp-report": { "document-uri": "https://alze.example/pay/SECRET.TOKEN?x=1", "blocked-uri": "https://evil.example/x.js?k=1", "effective-directive": "script-src-elem" } }));
    expect(res.status).toBe(204);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("script-src-elem");
    expect(line).toContain("https://alze.example/pay/…");
    expect(line).not.toContain("SECRET");
    expect(line).not.toContain("k=1");
  });

  it("a chunked body with no Content-Length is cut at the cap, not read whole", async () => {
    setRateLimiterForTests(new MemoryRateLimiter());
    const chunk = new TextEncoder().encode("x".repeat(8 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += 1;
        if (sent > 100) c.close();
        else c.enqueue(chunk);
      },
    });
    const req = new Request("http://localhost:3000/api/csp-report", { method: "POST", headers: { "content-type": "application/csp-report" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(sent).toBeLessThan(10);
  });

  it("reads the Reporting API format (report-to)", () => {
    const lines = summarizeReports([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://cdn.example/a.png", documentURL: "https://alze.example/" } }, { type: "deprecation", body: {} }]);
    expect(lines).toEqual(["img-src blocked=https://cdn.example/a.png page=https://alze.example/"]);
    expect(redactUrl("inline")).toBe("inline");
  });

  it("is rate limited per IP and refuses bad or oversized bodies", async () => {
    setRateLimiterForTests(new MemoryRateLimiter());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(report("not json", "198.51.100.1"))).status).toBe(400);
    expect((await POST(report({ pad: "x".repeat(20_000) }, "198.51.100.2"))).status).toBe(413);
    for (let i = 0; i < CSP_REPORT_LIMIT.perIp; i++) await POST(report({}, "198.51.100.3"));
    expect((await POST(report({}, "198.51.100.3"))).status).toBe(429);
  });
});
