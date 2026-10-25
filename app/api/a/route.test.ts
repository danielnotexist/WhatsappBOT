import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailySalt, isBotUserAgent, visitorId } from "@/lib/analytics/visitor";
import { derivedKey } from "@/lib/auth/keys";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";

// after() runs the write once the response is out: collect the callbacks and run them by hand
const pending: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void pending.push(fn) }));
const { POST } = await import("./route");

const APP = "https://alze.example";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IP = "203.0.113.77";

const body = (extra: Record<string, unknown> = {}) => ({ path: "/pricing", ref: "www.google.com", utm_source: "fb", utm_medium: "paid_social", utm_campaign: "oct", device: "mobile", event: null, ...extra });
const req = (data: unknown, headers: Record<string, string> = {}) =>
  new Request(`${APP}/api/a`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": UA, "x-forwarded-for": `${IP}, 10.0.0.1`, origin: APP, ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });

async function send(r: Request): Promise<number> {
  const res = await POST(r);
  expect(await res.text()).toBe("");
  return res.status;
}
const flush = async () => {
  while (pending.length) await pending.shift()!();
};

let db: MemoryDb;
beforeEach(() => {
  pending.length = 0;
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
  db = new MemoryDb();
  setDbForTests(db);
  setRateLimiterForTests(new MemoryRateLimiter());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setRateLimiterForTests(undefined);
});

describe("POST /api/a — the cookie-less beacon", () => {
  it("answers 204 at once; the row is written after the response", async () => {
    expect(await send(req(body()))).toBe(204);
    expect(db.pageEvents).toHaveLength(0); // not yet: after()
    await flush();
    expect(db.pageEvents).toHaveLength(1);
    expect(db.pageEvents[0]).toMatchObject({ path: "/pricing", referrer_host: "www.google.com", utm_source: "fb", utm_medium: "paid_social", utm_campaign: "oct", device: "mobile", event: null, user_id: null });
  });

  it("visitor = sha256(daily salt + IP + User-Agent): the same all day, another id tomorrow, another browser another id", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
    await send(req(body()));
    vi.setSystemTime(new Date("2026-10-25T19:30:00Z"));
    await send(req(body({ path: "/" })));
    await send(req(body(), { "user-agent": `${UA} Edg/130` }));
    vi.setSystemTime(new Date("2026-10-26T08:00:00Z"));
    await send(req(body()));
    await flush();
    const [a, b, other, tomorrow] = db.pageEvents;
    expect(a!.visitor).toMatch(/^[0-9a-f]{64}$/);
    expect(b!.visitor).toBe(a!.visitor);
    expect(other!.visitor).not.toBe(a!.visitor);
    expect(tomorrow!.visitor).not.toBe(a!.visitor);
    expect(a!.day).toBe("2026-10-25");
    expect(tomorrow!.day).toBe("2026-10-26");
    // exactly the documented hash, with the salt derived from TOKEN_ENC_KEY and the day (never stored)
    expect(a!.visitor).toBe(visitorId(dailySalt("2026-10-25", derivedKey("analytics")), IP, UA));
    expect(dailySalt("2026-10-25").equals(dailySalt("2026-10-26"))).toBe(false);
  });

  it("stores no IP and no User-Agent — only the hash and the device class", async () => {
    await send(req(body()));
    await flush();
    const row = JSON.stringify(db.pageEvents[0]);
    for (const leak of [IP, "203.0.113", UA, "Macintosh", "Safari", createHash("sha256").update(IP).digest("hex")]) expect(row).not.toContain(leak);
    expect(Object.keys(db.pageEvents[0]!).sort()).toEqual(["at", "day", "device", "event", "id", "path", "referrer_host", "user_id", "utm_campaign", "utm_medium", "utm_source", "visitor"]);
  });

  it("validation: a query in the path, an unknown device or event, extra fields, not JSON, too big → 400, nothing stored", async () => {
    for (const bad of [
      body({ path: "/start/code?email=a@b.co" }),
      body({ path: "pricing" }),
      body({ device: "fridge" }),
      body({ event: "purchase" }),
      body({ event: "paid" }), // a server-side step cannot be claimed by a browser
      body({ ip: IP }),
      body({ ref: "evil.example/<script>" }),
      body({ utm_source: "x".repeat(121) }),
      "not json",
      JSON.stringify(body({ utm_campaign: "y".repeat(5000) })),
    ]) {
      expect(await send(req(bad))).toBe(400);
    }
    await flush();
    expect(db.pageEvents).toEqual([]);
  });

  it("a funnel step from the browser is stored with its name", async () => {
    expect(await send(req(body({ path: "/start/email", event: "signup_start", ref: null, utm_source: null })))).toBe(204);
    await flush();
    expect(db.pageEvents[0]).toMatchObject({ path: "/start/email", event: "signup_start" });
  });

  it("per-IP rate limit: 120 a minute, then 429 (another IP is not affected)", async () => {
    for (let i = 0; i < 120; i++) expect(await send(req(body()))).toBe(204);
    expect(await send(req(body()))).toBe(429);
    expect(await send(req(body(), { "x-forwarded-for": "198.51.100.4" }))).toBe(204);
    await flush();
    expect(db.pageEvents).toHaveLength(121);
  });

  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 (compatible; GoogleOther)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
    "curl/8.5.0",
    "python-requests/2.32",
    "",
  ])("drops the robot %j with a 204 and stores nothing", async (ua) => {
    expect(await send(req(body(), { "user-agent": ua }))).toBe(204);
    await flush();
    expect(db.pageEvents).toEqual([]);
  });

  it("real browsers are not robots", () => {
    expect(isBotUserAgent(UA)).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")).toBe(false);
  });

  it("Do-Not-Track / Global Privacy Control headers → 204, nothing stored", async () => {
    expect(await send(req(body(), { dnt: "1" }))).toBe(204);
    expect(await send(req(body(), { "sec-gpc": "1" }))).toBe(204);
    await flush();
    expect(db.pageEvents).toEqual([]);
  });

  it("an excluded path (the panel, a payment link) → 204, nothing stored", async () => {
    expect(await send(req(body({ path: "/admin" })))).toBe(204);
    expect(await send(req(body({ path: "/pay/abc.def" })))).toBe(204);
    await flush();
    expect(db.pageEvents).toEqual([]);
  });

  it("another site's page posting → 403", async () => {
    expect(await send(req(body(), { origin: "https://evil.example" }))).toBe(403);
  });

  it("linked to the user when the request carries a valid session; a forged or a deleted user's cookie is not", async () => {
    const user = await db.createUser("dana@example.com");
    const cookie = `${SESSION_COOKIE}=${createSessionToken(user.id)}`;
    await send(req(body({ event: "code_ok", path: "/start/code" }), { cookie: `theme=dark; ${cookie}` }));
    await send(req(body(), { cookie: `${SESSION_COOKIE}=forged.token` }));
    await flush();
    expect(db.pageEvents.map((e) => e.user_id)).toEqual([user.id, null]);
    await db.deleteUser(user.id);
    expect(db.pageEvents[0]!.user_id).toBeNull(); // the anonymous row stays
    await send(req(body(), { cookie }));
    await flush();
    expect(db.pageEvents[2]!.user_id).toBeNull();
  });

  it("a failing write is logged, never thrown at the visitor", async () => {
    vi.spyOn(db, "insertPageEvent").mockRejectedValueOnce(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await send(req(body()))).toBe(204);
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("db down"));
  });
});
