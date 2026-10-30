import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { ConsoleMailer } from "@/lib/mail/console";
import { setMailerForTests } from "@/lib/mail";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { OTP_CHALLENGE_COOKIE } from "@/lib/auth/otp-challenge";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { POST as sendPost } from "./send/route";
import { POST as verifyPost } from "./verify/route";

const cookieJar = new Map<string, { value: string; options: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => cookieJar.set(name, { value, options }),
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

/** the browser's wb_otp cookie per IP (one browser per IP in these tests) */
const otpCookies = new Map<string, string>();
function post(path: string, body: unknown, ip = "1.2.3.4", extra: Record<string, string> = {}): Request {
  const challenge = otpCookies.get(ip);
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(challenge ? { cookie: `${OTP_CHALLENGE_COOKIE}=${challenge}` } : {}), ...extra },
    body: JSON.stringify(body),
  });
}
async function send(req: Request, ip = "1.2.3.4"): Promise<Response> {
  const res = await sendPost(req);
  const set = res.headers.get("set-cookie");
  const m = set?.match(new RegExp(`${OTP_CHALLENGE_COOKIE}=([^;]+)`));
  if (m) otpCookies.set(ip, m[1]!);
  return res;
}

describe("POST /api/auth/otp/{send,verify}", () => {
  let db: MemoryDb;
  let mailer: ConsoleMailer;

  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
    db = new MemoryDb();
    mailer = new ConsoleMailer();
    setDbForTests(db);
    setMailerForTests(mailer);
    setRateLimiterForTests(new MemoryRateLimiter());
    cookieJar.clear();
    otpCookies.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setMailerForTests(undefined);
    setRateLimiterForTests(undefined);
  });

  it("sends a code, verifies it and sets the session cookie", async () => {
    const r1 = await send(post("/api/auth/otp/send", { email: "Dana@Example.com" }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, cooldownSeconds: 60 }); // the challenge only in the cookie
    expect(r1.headers.get("set-cookie")).toMatch(/^wb_otp=[A-Za-z0-9_-]{32}; Path=\/api\/auth\/otp; Max-Age=600; HttpOnly; SameSite=Lax/);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    const code = mailer.sent[0]!.code;

    const bad = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code: "000000" === code ? "111111" : "000000" }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ ok: false, code: "invalid_code", attemptsLeft: 4 });

    const good = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ ok: true, isNewUser: true, next: "/start/connect" });
    const cookie = cookieJar.get(SESSION_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const session = verifySessionToken(cookie?.value);
    expect(session?.userId).toBe([...db.users.keys()][0]);
  });

  it("records the newsletter opt-in only when the toggle was on", async () => {
    await send(post("/api/auth/otp/send", { email: "on@example.com" }));
    await verifyPost(post("/api/auth/otp/verify", { email: "on@example.com", code: mailer.sent.at(-1)!.code, updates: true }));
    await send(post("/api/auth/otp/send", { email: "off@example.com" }, "5.6.7.8"), "5.6.7.8");
    await verifyPost(post("/api/auth/otp/verify", { email: "off@example.com", code: mailer.sent.at(-1)!.code }, "5.6.7.8"));
    const on = await db.findUserByEmail("on@example.com");
    const off = await db.findUserByEmail("off@example.com");
    expect(on!.profile.marketing_opt_in).toMatchObject({ value: true, source: "signup_form" });
    expect(off!.profile.marketing_opt_in).toBeUndefined();
  });

  it("refuses a cross-site or non-JSON POST (login CSRF): 403 / 415, no session", async () => {
    await send(post("/api/auth/otp/send", { email: "dana@example.com" }));
    const code = mailer.sent[0]!.code;
    const evil = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }, "1.2.3.4", { origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    const site = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }, "1.2.3.4", { "sec-fetch-site": "cross-site" }));
    expect(site.status).toBe(403);
    const form = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }, "1.2.3.4", { "content-type": "text/plain" }));
    expect(form.status).toBe(415);
    expect((await sendPost(post("/api/auth/otp/send", { email: "x@example.com" }, "9.9.9.9", { origin: "null" }))).status).toBe(403);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    // the page itself: same-origin fetch
    const ok = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }, "1.2.3.4", { origin: "http://localhost", "sec-fetch-site": "same-origin" }));
    expect(ok.status).toBe(200);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
  });

  it("a code is tried only with the cookie of the browser that asked for it", async () => {
    await send(post("/api/auth/otp/send", { email: "dana@example.com" }));
    const code = mailer.sent[0]!.code;
    const stranger = await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }, "6.6.6.6"));
    expect(await stranger.json()).toMatchObject({ ok: false, code: "no_code" });
    expect((await verifyPost(post("/api/auth/otp/verify", { email: "dana@example.com", code }))).status).toBe(200);
  });

  it("returns 400 for a bad email and 429 with retry-after on cooldown", async () => {
    expect((await sendPost(post("/api/auth/otp/send", { email: "nope" }))).status).toBe(400);
    expect((await sendPost(post("/api/auth/otp/send", {}))).status).toBe(400);
    await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    const again = await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers 503 with a generic Hebrew message when Supabase is configured but absent (names in the server log only)", async () => {
    vi.stubEnv("DATA_MODE", "");
    setDbForTests(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    expect(r.status).toBe(503);
    const raw = await r.text();
    const body = JSON.parse(raw) as { code: string; missing?: string[]; message: string };
    expect(body.code).toBe("server_config");
    expect(body.missing).toBeUndefined();
    expect(raw).not.toContain("SUPABASE");
    expect(body.message).toBe("השירות אינו זמין כרגע. אפשר לנסות שוב בעוד כמה דקות.");
    expect(String(log.mock.calls.at(-1))).toContain("SUPABASE_URL");
    log.mockRestore();
  });
});
