import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoDb, demoUserId } from "@/lib/auth/demo-user";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { decryptToken } from "@/lib/crypto";
import { setDbForTests } from "@/lib/db";
import { FakeSupabase } from "@/lib/db/__fixtures__/supabase-fake";
import type { MemoryDb } from "@/lib/db/memory";
import { SupabaseDb } from "@/lib/db/supabase";
import type { Db } from "@/lib/db/types";
import { setGlobalSingleton } from "@/lib/global-singleton";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { POST as otpSend } from "./auth/otp/send/route";
import { POST as otpVerify } from "./auth/otp/verify/route";
import { GET as googleStart } from "./auth/google/start/route";
import { GET as msStart } from "./auth/microsoft/start/route";
import { GET as health } from "./health/route";
import { POST as jobsTick } from "./jobs/tick/route";
import { GET as payMock } from "./pay/mock/route";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const APP = "https://alze-demo.vercel.app";
const SUPABASE = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service-role" };
const post = (path: string, body: unknown) =>
  new Request(`${APP}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify(body) });

function stubDemo(extra: Record<string, string> = {}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 11).toString("base64"));
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("MS_CLIENT_ID", "real-client-id-never-used");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

beforeEach(() => {
  jar.clear();
  setRateLimiterForTests(new MemoryRateLimiter());
  for (const n of ["graph-fixture", "google-fixture", "hyp", "wa-sender", "mailer"]) setGlobalSingleton(n, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setRateLimiterForTests(undefined);
});

async function signUp(email: string): Promise<string> {
  expect((await otpSend(post("/api/auth/otp/send", { email }))).status).toBe(200);
  const res = await otpVerify(post("/api/auth/otp/verify", { email, code: "123456" }));
  expect(await res.json()).toEqual({ ok: true, isNewUser: true, next: "/start/connect" });
  return verifySessionToken(jar.get(SESSION_COOKIE))!.userId;
}

const location = (res: Response) => new URL(res.headers.get("location")!);

/** Same assertions on both data layers: the connect writes a fixture connection row through the normal Db. */
async function expectConnected(db: Db, userId: string, provider: "microsoft" | "google", email: string) {
  const conns = (await db.listConnections(userId)).filter((c) => c.provider === provider);
  expect(conns).toEqual([expect.objectContaining({ provider, account_email: email, status: "active" })]);
  const secret = await db.getConnectionSecret(conns[0]!.id);
  const access = decryptToken(secret!.enc_access!, { aad: provider === "microsoft" ? `${userId}:microsoft` : `${userId}:google` });
  expect(access).toMatch(provider === "microsoft" ? /^memory-access$/ : /^ya29\.fixture-/);
}

describe("demo + memory store", () => {
  let db: MemoryDb;
  beforeEach(() => {
    stubDemo();
    db = createDemoDb();
    setDbForTests(db);
  });

  it("OTP: 123456 signs up, the session carries the email (v2) and the id is derived from it", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    expect(jar.get(SESSION_COOKIE)!.startsWith("v2.")).toBe(true);
    expect(userId).toBe(demoUserId("dana@levi-law.co.il"));
    expect((await otpVerify(post("/api/auth/otp/verify", { email: "dana@levi-law.co.il", code: "111111" }))).status).toBe(401);
  });

  it("Microsoft connect → fixture connection → /start/ready?connected=microsoft (returnTo helper); no Graph subscription", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    const res = await msStart(new Request(`${APP}/api/auth/microsoft/start?returnTo=onboarding`));
    expect(res.status).toBe(303);
    const to = location(res);
    expect(to.origin + to.pathname).toBe(`${APP}/start/ready`);
    expect(to.searchParams.get("connected")).toBe("microsoft");
    expect(to.searchParams.get("notice")).toBe("החיבור ל-Microsoft 365 הושלם (dana@levi-law.co.il).");
    await expectConnected(db, userId, "microsoft", "dana@levi-law.co.il");
    expect(db.graphSubscriptions).toEqual([]);
    expect((await db.getUser(userId))!.name).toBeNull();
  });

  it("Google connect from the personal area → /account?notice", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    const to = location(await googleStart(new Request(`${APP}/api/auth/google/start`)));
    expect(to.pathname).toBe("/account");
    expect(to.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana@levi-law.co.il).");
    await expectConnected(db, userId, "google", "dana@levi-law.co.il");
  });

  it("a fresh instance recreates the user from the session before connecting", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    const fresh = createDemoDb();
    setDbForTests(fresh);
    const to = location(await msStart(new Request(`${APP}/api/auth/microsoft/start?returnTo=onboarding`)));
    expect(to.searchParams.get("connected")).toBe("microsoft");
    expect((await fresh.getUser(userId))!.email).toBe("dana@levi-law.co.il");
    await expectConnected(fresh, userId, "microsoft", "dana@levi-law.co.il");
  });

  it("signed out → back to /start", async () => {
    expect(location(await msStart(new Request(`${APP}/api/auth/microsoft/start`))).pathname).toBe("/start");
  });

  it("the HYP stand-in answers, /api/health says demo-memory, /api/jobs/tick keeps its secret", async () => {
    const pay = await payMock(new Request(`${APP}/api/pay/mock?Amount=99&Order=x`));
    expect(pay.status).toBe(303);
    expect(location(pay).pathname).toBe("/api/pay/return");
    // anonymous: only { ok: true }; the details with the scheduler's secret
    expect(await (await health(new Request(`${APP}/api/health`))).json()).toEqual({ ok: true });
    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    expect(await (await health(new Request(`${APP}/api/health`, { headers: { authorization: "Bearer wrong" } }))).json()).toEqual({ ok: true });
    expect(await (await health(new Request(`${APP}/api/health`, { headers: { authorization: `Bearer ${"s".repeat(32)}` } }))).json()).toMatchObject({ mode: "demo-memory", checks: { env: "demo" } });
    expect((await jobsTick(new Request(`${APP}/api/jobs/tick`, { method: "POST" }))).status).toBe(401);
  });
});

describe("demo + Supabase (staging data, mocked client)", () => {
  let fake: FakeSupabase;
  let db: SupabaseDb;
  beforeEach(() => {
    stubDemo(SUPABASE);
    fake = new FakeSupabase();
    db = new SupabaseDb(fake.asClient());
    setDbForTests(db);
  });

  it("OTP creates the user row in Supabase; the session stays v1 (nothing to recreate)", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    expect(jar.get(SESSION_COOKIE)!.startsWith("v1.")).toBe(true);
    expect(fake.rows("users")).toEqual([expect.objectContaining({ id: userId, email: "dana@levi-law.co.il" })]);
    expect(fake.rows("auth_otps")).toEqual([]);
  });

  it("Microsoft and Google connects write fixture connection rows through SupabaseDb", async () => {
    const userId = await signUp("dana@levi-law.co.il");
    expect(location(await msStart(new Request(`${APP}/api/auth/microsoft/start?returnTo=onboarding`))).searchParams.get("connected")).toBe("microsoft");
    // the trial works with one account (lib/billing/plans.ts): the second one is pro, refused before any fixture write
    const refused = location(await googleStart(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`)));
    expect(refused.pathname).toMatch(/^\/pay\//);
    expect(refused.searchParams.get("why")).toBe("second_account");
    expect(fake.rows("connections")).toHaveLength(1);
    await db.upsertSubscription(userId, { plan: "pro", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    expect(location(await googleStart(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`))).searchParams.get("connected")).toBe("google");
    expect(fake.rows("connections")).toHaveLength(2);
    await expectConnected(db, userId, "microsoft", "dana@levi-law.co.il");
    await expectConnected(db, userId, "google", "dana@levi-law.co.il");
    expect(fake.rows("graph_subscriptions")).toEqual([]);
    expect(fake.rows("audit_log").map((r) => r.result)).toEqual(["ok", "ok:demo", "ok:demo"]);
    // reconnecting replaces the row (unique user/provider/account), it does not pile up
    await msStart(new Request(`${APP}/api/auth/microsoft/start?returnTo=onboarding`));
    expect(fake.rows("connections")).toHaveLength(2);
  });

  it("the session's unknown user is NOT recreated on Supabase", async () => {
    jar.set(SESSION_COOKIE, createSessionToken(demoUserId("ghost@levi-law.co.il"), { email: "ghost@levi-law.co.il" }));
    expect(location(await msStart(new Request(`${APP}/api/auth/microsoft/start`))).pathname).toBe("/start");
    expect(fake.rows("users")).toEqual([]);
  });

  it("/api/health says demo-supabase; the HYP stand-in still answers", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    expect(await (await health(new Request(`${APP}/api/health`, { headers: { authorization: `Bearer ${"s".repeat(32)}` } }))).json()).toMatchObject({ mode: "demo-supabase" });
    expect((await payMock(new Request(`${APP}/api/pay/mock?Amount=99`))).status).toBe(303);
  });
});
