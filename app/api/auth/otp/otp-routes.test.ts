import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { ConsoleMailer } from "@/lib/mail/console";
import { setMailerForTests } from "@/lib/mail";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
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

function post(path: string, body: unknown, ip = "1.2.3.4"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
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
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setMailerForTests(undefined);
    setRateLimiterForTests(undefined);
  });

  it("sends a code, verifies it and sets the session cookie", async () => {
    const r1 = await sendPost(post("/api/auth/otp/send", { email: "Dana@Example.com" }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, cooldownSeconds: 60 });
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

  it("returns 400 for a bad email and 429 with retry-after on cooldown", async () => {
    expect((await sendPost(post("/api/auth/otp/send", { email: "nope" }))).status).toBe(400);
    expect((await sendPost(post("/api/auth/otp/send", {}))).status).toBe(400);
    await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    const again = await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers 503 with the missing env var names when Supabase is configured but absent", async () => {
    vi.stubEnv("DATA_MODE", "");
    setDbForTests(undefined);
    const r = await sendPost(post("/api/auth/otp/send", { email: "a@b.co" }));
    expect(r.status).toBe(503);
    const body = (await r.json()) as { code: string; missing: string[]; message: string };
    expect(body.code).toBe("server_config");
    expect(body.missing).toEqual(expect.arrayContaining(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]));
    expect(body.message).toContain("משתני סביבה");
  });
});
