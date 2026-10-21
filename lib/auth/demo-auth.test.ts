import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { SupabaseDb } from "@/lib/db/supabase";
import { FakeSupabase } from "@/lib/db/__fixtures__/supabase-fake";
import { setGlobalSingleton } from "@/lib/global-singleton";
import { ConsoleMailer } from "@/lib/mail/console";
import { setMailerForTests } from "@/lib/mail";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { ensureDemoSessionUser, getSession } from "./current-user";
import { createDemoDb, demoSessionClaims, demoUserId, restoreDemoUser } from "./demo-user";
import { OTP_POLICY, sendOtp, verifyOtp, type OtpDeps } from "./otp";
import { sendOtpForRequest, verifyOtpForRequest } from "./otp-service";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "./session";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

const KEY_B64 = Buffer.alloc(32, 5).toString("base64");
function stubDemo(extra: Record<string, string> = {}) {
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("TOKEN_ENC_KEY", KEY_B64);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}
const SUPABASE = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role" };

afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setMailerForTests(undefined);
  setRateLimiterForTests(undefined);
  setGlobalSingleton("db", undefined);
  jar.clear();
});

describe("session v2 — the email claim (demo on the memory store)", () => {
  const key = randomBytes(32);
  it("round-trips the email; v1 tokens keep working without it", () => {
    const userId = randomUUID();
    const v2 = createSessionToken(userId, { key, email: "dana@levi-law.co.il" });
    expect(v2.startsWith("v2.")).toBe(true);
    expect(verifySessionToken(v2, { key })).toMatchObject({ userId, email: "dana@levi-law.co.il" });
    const v1 = createSessionToken(userId, { key });
    expect(v1.startsWith("v1.")).toBe(true);
    expect(verifySessionToken(v1, { key })).not.toHaveProperty("email");
  });

  it("rejects a swapped email, a wrong key and junk claims", () => {
    const userId = randomUUID();
    const token = createSessionToken(userId, { key, email: "dana@levi-law.co.il" });
    const parts = token.split(".");
    parts[3] = Buffer.from("boss@levi-law.co.il").toString("base64url");
    expect(verifySessionToken(parts.join("."), { key })).toBeNull();
    expect(verifySessionToken(token, { key: randomBytes(32) })).toBeNull();
    // a correctly signed but malformed email is refused too
    expect(verifySessionToken(createSessionToken(userId, { key, email: "not an email" }), { key })).toBeNull();
    expect(verifySessionToken(`v2.${userId}.9999999999.***.sig`, { key })).toBeNull();
  });
});

describe("demo user ids and recreation", () => {
  const key = randomBytes(32);
  it("derives a stable UUID v4 per email and key", () => {
    const a = demoUserId("dana@levi-law.co.il", key);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(demoUserId("dana@levi-law.co.il", key)).toBe(a);
    expect(demoUserId("avi@levi-law.co.il", key)).not.toBe(a);
    expect(demoUserId("dana@levi-law.co.il", randomBytes(32))).not.toBe(a);
  });

  it("two instances' memory dbs give the same person the same id", async () => {
    stubDemo();
    const [a, b] = [createDemoDb(), createDemoDb()];
    expect((await a.createUser("dana@levi-law.co.il")).id).toBe((await b.createUser("dana@levi-law.co.il")).id);
  });

  it("recreates a missing user from the claims, once, without clobbering anyone", async () => {
    stubDemo();
    const db = createDemoDb();
    const id = demoUserId("dana@levi-law.co.il");
    const restored = await restoreDemoUser(db, { userId: id, email: "dana@levi-law.co.il" });
    expect(restored).toMatchObject({ id, email: "dana@levi-law.co.il" });
    expect(await restoreDemoUser(db, { userId: id, email: "dana@levi-law.co.il" })).toBe(restored);
    expect(db.audit.filter((e) => e.action === "demo.restore_user")).toHaveLength(1);
    // a v1 token (no email) cannot recreate; a different id with a taken email is refused
    expect(await restoreDemoUser(db, { userId: randomUUID() })).toBeNull();
    expect(await restoreDemoUser(db, { userId: randomUUID(), email: "dana@levi-law.co.il" })).toBeNull();
  });

  it("never recreates on Supabase (rows persist there)", async () => {
    const fake = new FakeSupabase();
    const db = new SupabaseDb(fake.asClient());
    expect(await restoreDemoUser(db, { userId: randomUUID(), email: "dana@levi-law.co.il" })).toBeNull();
    expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("the email claim is added only for the demo on the memory store", () => {
    expect(demoSessionClaims("dana@levi-law.co.il")).toEqual({});
    stubDemo();
    expect(demoSessionClaims("dana@levi-law.co.il")).toEqual({ email: "dana@levi-law.co.il" });
    stubDemo(SUPABASE);
    expect(demoSessionClaims("dana@levi-law.co.il")).toEqual({});
  });
});

describe("getSession on an instance that never saw the user (demo, memory)", () => {
  it("recreates the user from the signed session — the next instance serves /account", async () => {
    stubDemo();
    // instance A: signs up
    setDbForTests(createDemoDb());
    setMailerForTests(new ConsoleMailer());
    setRateLimiterForTests(new MemoryRateLimiter());
    const ok = await verifyOtpForRequest("Dana@Levi-Law.co.il", "123456", new Headers({ "x-forwarded-for": "1.1.1.1" }));
    if (!ok.ok) throw new Error(ok.message);
    jar.set(SESSION_COOKIE, createSessionToken(ok.userId, demoSessionClaims(ok.email)));

    // instance B: fresh memory
    const b = createDemoDb();
    setDbForTests(b);
    expect(await b.getUser(ok.userId)).toBeNull();
    const session = await getSession();
    expect(session).toMatchObject({ userId: ok.userId, email: "dana@levi-law.co.il" });
    expect(await b.getUser(ok.userId)).toMatchObject({ email: "dana@levi-law.co.il" });
  });

  it("ensureDemoSessionUser does the same for pages that load a user by id (/pay); nothing outside the demo", async () => {
    stubDemo();
    const userId = demoUserId("dana@levi-law.co.il");
    jar.set(SESSION_COOKIE, createSessionToken(userId, { email: "dana@levi-law.co.il" }));
    const db = createDemoDb();
    setDbForTests(db);
    await ensureDemoSessionUser();
    expect(await db.getUser(userId)).not.toBeNull();

    vi.unstubAllEnvs();
    vi.stubEnv("TOKEN_ENC_KEY", KEY_B64);
    const other = new MemoryDb();
    setDbForTests(other);
    await ensureDemoSessionUser();
    await getSession();
    expect(other.users.size).toBe(0);
  });
});

describe("the demo sign-in code", () => {
  function deps(fixedCode?: string): OtpDeps & { db: MemoryDb; mailer: ConsoleMailer } {
    return { db: new MemoryDb(), mailer: new ConsoleMailer(), limiter: new MemoryRateLimiter(), otpKey: randomBytes(32), fixedCode };
  }

  it("send: nothing stored, nothing mailed", async () => {
    const d = deps("123456");
    expect(await sendOtp(d, "dana@levi-law.co.il", "1.1.1.1")).toEqual({ ok: true, cooldownSeconds: 60 });
    expect(d.db.otps).toEqual([]);
    expect(d.mailer.sent).toEqual([]);
  });

  it("verify: 123456 signs in any email statelessly (no send first); other codes are refused", async () => {
    const d = deps("123456");
    expect(await verifyOtp(d, "dana@levi-law.co.il", "000000", "1.1.1.1")).toMatchObject({ ok: false, code: "invalid_code" });
    const first = await verifyOtp(d, " Dana@Levi-Law.co.il ", "123 456", "1.1.1.1");
    expect(first).toMatchObject({ ok: true, isNewUser: true, email: "dana@levi-law.co.il" });
    expect(await verifyOtp(d, "dana@levi-law.co.il", "123456", "1.1.1.1")).toMatchObject({ ok: true, isNewUser: false });
    expect(d.db.audit.map((a) => a.action)).toEqual(["signup", "login"]);
    expect(await verifyOtp(d, "nope", "123456", "1.1.1.1")).toMatchObject({ ok: false, code: "invalid_email" });
  });

  it("is still rate-limited: per IP on verify and send, per email on send", async () => {
    const d = deps("123456");
    for (let i = 0; i < OTP_POLICY.maxVerifiesPerIpPerHour; i++) await verifyOtp(d, `u${i}@ex.co.il`, "123456", "2.2.2.2");
    expect(await verifyOtp(d, "late@ex.co.il", "123456", "2.2.2.2")).toMatchObject({ ok: false, code: "rate_limited" });
    for (let i = 0; i < OTP_POLICY.maxPerHourPerEmail; i++) expect((await sendOtp(d, "dana@ex.co.il", `3.3.3.${i}`)).ok).toBe(true);
    expect(await sendOtp(d, "dana@ex.co.il", "3.3.3.99")).toMatchObject({ ok: false, code: "too_many" });
  });

  it("without the demo, 123456 is just a wrong code", async () => {
    const d = deps();
    await sendOtp(d, "dana@levi-law.co.il", "1.1.1.1");
    const code = d.mailer.sent[0]!.code;
    const result = await verifyOtp(d, "dana@levi-law.co.il", "123456", "1.1.1.1");
    expect(result.ok).toBe(code === "123456");
  });

  it("otp-service turns it on only with DEMO_MODE=1", async () => {
    const headers = new Headers({ "x-forwarded-for": "4.4.4.4" });
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("TOKEN_ENC_KEY", KEY_B64);
    setDbForTests(new MemoryDb());
    setMailerForTests(new ConsoleMailer());
    setRateLimiterForTests(new MemoryRateLimiter());
    expect(await verifyOtpForRequest("dana@levi-law.co.il", "123456", headers)).toMatchObject({ ok: false, code: "no_code" });

    stubDemo();
    const mailer = new ConsoleMailer();
    setMailerForTests(mailer);
    expect(await sendOtpForRequest("dana@levi-law.co.il", headers)).toMatchObject({ ok: true });
    expect(mailer.sent).toEqual([]);
    expect(await verifyOtpForRequest("dana@levi-law.co.il", "123456", headers)).toMatchObject({ ok: true, isNewUser: true });
  });

  it("demo on Supabase: the user is created there for real, the code still fixed", async () => {
    stubDemo(SUPABASE);
    const fake = new FakeSupabase();
    setDbForTests(new SupabaseDb(fake.asClient()));
    setRateLimiterForTests(new MemoryRateLimiter());
    const ok = await verifyOtpForRequest("dana@levi-law.co.il", "123456", new Headers());
    expect(ok).toMatchObject({ ok: true, isNewUser: true });
    expect(fake.rows("users")).toEqual([expect.objectContaining({ email: "dana@levi-law.co.il" })]);
    expect(fake.rows("auth_otps")).toEqual([]);
    expect(await verifyOtpForRequest("dana@levi-law.co.il", "123456", new Headers())).toMatchObject({ ok: true, isNewUser: false });
    expect(fake.rows("audit_log").map((r) => r.action)).toEqual(["signup", "login"]);
  });
});
