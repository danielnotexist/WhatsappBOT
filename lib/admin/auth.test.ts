import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { setMailerForTests } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { ADMIN_CODE_COOKIE, ADMIN_COOKIE, createAdminToken, createCodeToken, createGateToken, isGatedAdminPath, readCodeToken, verifyAdminToken, verifyGateToken } from "./tokens";

/**
 * The owner gate of /admin (lib/admin/auth.ts): the email alone never opens the panel — only the panel's own cookie,
 * minted after a real one-time code mailed to the owner. Anyone else gets notFound().
 */
const h = vi.hoisted(() => {
  class NotFound extends Error {
    readonly digest = "NEXT_HTTP_ERROR_FALLBACK;404";
  }
  return { NotFound, session: null as { userId: string } | null, jar: new Map<string, string>() };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new h.NotFound("not found");
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void h.jar.set(name, value),
    delete: (opt: string | { name: string }) => void h.jar.delete(typeof opt === "string" ? opt : opt.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
}));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

const { isAdminEmail, ownerState, requireOwner, sendAdminCode, verifyAdminCode } = await import("./auth");

const KEY = Buffer.alloc(32, 5).toString("base64");
const OWNER = "danielnotexist@gmail.com";
let db: MemoryDb;
let mailer: ConsoleMailer;

beforeEach(() => {
  vi.stubEnv("TOKEN_ENC_KEY", KEY);
  vi.stubEnv("DATA_MODE", "memory");
  vi.stubEnv("ADMIN_EMAILS", "");
  db = new MemoryDb();
  setDbForTests(db);
  mailer = new ConsoleMailer();
  setMailerForTests(mailer);
  setRateLimiterForTests(new MemoryRateLimiter());
  h.jar.clear();
  h.session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setMailerForTests(undefined);
  setRateLimiterForTests(undefined);
});

async function signedIn(email: string) {
  const user = await db.createUser(email);
  h.session = { userId: user.id };
  return user;
}

describe("ADMIN_EMAILS", () => {
  it("defaults to the owner, takes a comma list, and fails closed on a bad value", () => {
    expect(isAdminEmail(OWNER, {})).toBe(true);
    expect(isAdminEmail("DanielNotExist@Gmail.com ", {})).toBe(true);
    expect(isAdminEmail("someone@example.com", {})).toBe(false);
    expect(isAdminEmail("b@x.co", { ADMIN_EMAILS: "a@x.co, B@x.co" })).toBe(true);
    expect(isAdminEmail(OWNER, { ADMIN_EMAILS: "a@x.co" })).toBe(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(isAdminEmail(OWNER, { ADMIN_EMAILS: "not-an-email" })).toBe(false);
  });
});

describe("requireOwner", () => {
  it("no session, or a user who is not the owner: 404", async () => {
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);
    const user = await signedIn("dana@example.com");
    expect(await ownerState()).toEqual({ state: "none" });
    // even with a genuine panel cookie of their own
    h.jar.set(ADMIN_COOKIE, createAdminToken(user.id));
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);
  });

  it("the owner's email without the panel cookie: 404 for requireOwner, the code step for the page", async () => {
    const owner = await signedIn(OWNER);
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);
    expect(await ownerState()).toMatchObject({ state: "code", codeSent: false, user: { id: owner.id } });
  });

  it("with the panel cookie of this owner: open; of another user, forged or expired: not", async () => {
    const owner = await signedIn(OWNER);
    h.jar.set(ADMIN_COOKIE, createAdminToken(owner.id));
    expect((await requireOwner()).id).toBe(owner.id);

    h.jar.set(ADMIN_COOKIE, createAdminToken("11111111-1111-4111-8111-111111111111"));
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);

    h.jar.set(ADMIN_COOKIE, createAdminToken(owner.id, { key: Buffer.alloc(32, 9) }));
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);

    // an expired cookie goes back to the code step
    h.jar.set(ADMIN_COOKIE, createAdminToken(owner.id, { now: new Date(Date.now() - 13 * 3_600_000) }));
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);
    expect((await ownerState()).state).toBe("code");
  });

  it("the demo: the owner signed in with the fixed code still gets a 404 until the mailed code", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATA_MODE", "");
    await signedIn(OWNER);
    await expect(requireOwner()).rejects.toBeInstanceOf(h.NotFound);
  });
});

describe("the one-time code", () => {
  it("is mailed to the owner (never 123456), and the right code opens the panel once", async () => {
    const owner = await signedIn(OWNER);
    expect(await sendAdminCode(owner)).toMatchObject({ ok: true });
    const mail = mailer.sent.at(-1)!;
    expect(mail).toMatchObject({ to: OWNER, purpose: "admin", ttlMinutes: 10 });
    expect(mail.code).toMatch(/^\d{6}$/);
    expect(mail.code).not.toBe("123456");
    expect(h.jar.has(ADMIN_CODE_COOKIE)).toBe(true);
    expect((await ownerState()).state).toBe("code");

    expect(await verifyAdminCode(owner, mail.code)).toEqual({ ok: true });
    expect(h.jar.has(ADMIN_CODE_COOKIE)).toBe(false);
    expect((await requireOwner()).id).toBe(owner.id);
    expect(db.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["admin.code_sent", "admin.login"]));
    // spent: the same code again is refused
    expect(await verifyAdminCode(owner, mail.code)).toMatchObject({ ok: false });
  });

  it("refuses the demo's fixed code, a wrong code, and blocks after 5 wrong attempts", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("LIVE_SUPPORT_MAIL", "");
    vi.stubEnv("DATA_MODE", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const owner = await signedIn(OWNER);
    // the demo without real mail: no code is sent, a Hebrew line says why
    const refused = await sendAdminCode(owner);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message).toMatch(/LIVE_SUPPORT_MAIL/);
    vi.unstubAllEnvs();
    vi.stubEnv("TOKEN_ENC_KEY", KEY);
    vi.stubEnv("DATA_MODE", "memory");

    expect(await sendAdminCode(owner)).toMatchObject({ ok: true });
    const code = mailer.sent.at(-1)!.code;
    expect(await verifyAdminCode(owner, "123456")).toEqual({ ok: false, message: "הקוד לא נכון." });
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 4; i++) expect(await verifyAdminCode(owner, wrong)).toEqual({ ok: false, message: "הקוד לא נכון." });
    expect(await verifyAdminCode(owner, wrong)).toMatchObject({ ok: false, message: "יותר מדי ניסיונות שגויים. צריך לבקש קוד חדש." });
    // blocked: even the right code no longer works
    expect((await verifyAdminCode(owner, code)).ok).toBe(false);
    expect(h.jar.has(ADMIN_COOKIE)).toBe(false);
  });

  it("a second code within a minute is refused; without a challenge cookie nothing is checked", async () => {
    const owner = await signedIn(OWNER);
    expect((await sendAdminCode(owner)).ok).toBe(true);
    expect(await sendAdminCode(owner)).toMatchObject({ ok: false, message: "קוד נשלח לפני רגע. אפשר לבקש קוד חדש בעוד דקה." });
    const code = mailer.sent.at(-1)!.code;
    h.jar.delete(ADMIN_CODE_COOKIE);
    expect(await verifyAdminCode(owner, code)).toMatchObject({ ok: false, message: "אין קוד פעיל. צריך לבקש קוד חדש." });
  });

  it("is never sent to, or checked for, anyone but the owner", async () => {
    const other = await signedIn("dana@example.com");
    await expect(sendAdminCode(other)).rejects.toBeInstanceOf(h.NotFound);
    await expect(verifyAdminCode(other, "111111")).rejects.toBeInstanceOf(h.NotFound);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("the panel's cookies (lib/admin/tokens.ts)", () => {
  const ID = "22222222-2222-4222-8222-222222222222";
  it("are bound to the user, signed and short-lived", () => {
    vi.stubEnv("TOKEN_ENC_KEY", KEY);
    expect(verifyAdminToken(createAdminToken(ID), ID)).toBe(true);
    expect(verifyAdminToken(createGateToken(ID), ID)).toBe(false); // a gate is not an open panel
    expect(verifyGateToken(createGateToken(ID), ID)).toBe(true);
    expect(verifyAdminToken(createAdminToken(ID).replace(/.$/, "x"), ID)).toBe(false);
    expect(verifyAdminToken(createAdminToken(ID, { ttlSeconds: -1 }), ID)).toBe(false);
    const c = readCodeToken(createCodeToken(ID, "424242"), ID)!;
    expect(c.matches("424242")).toBe(true);
    expect(c.matches("424243")).toBe(false);
    expect(createCodeToken(ID, "424242")).not.toContain("424242");
    expect(readCodeToken(createCodeToken(ID, "424242", { ttlSeconds: -1 }), ID)).toBeNull();
  });

  it("the gate covers /admin and below, except the enter route", () => {
    expect(isGatedAdminPath("/admin")).toBe(true);
    expect(isGatedAdminPath("/admin/users/x")).toBe(true);
    expect(isGatedAdminPath("/admin/enter")).toBe(false);
    expect(isGatedAdminPath("/administrator")).toBe(false);
    expect(isGatedAdminPath("/account")).toBe(false);
  });
});
