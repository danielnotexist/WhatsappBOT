import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));

/** /r/<code>: the cookie (30 days, httpOnly, Lax) for a known code, the visit counted, the home page with the utm_*. */
let db: MemoryDb;
beforeEach(() => {
  db = new MemoryDb();
  setDbForTests(db);
  vi.stubEnv("APP_URL", "https://app.example.co.il");
  vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
});
afterEach(() => {
  setDbForTests(undefined);
  vi.unstubAllEnvs();
});

const visit = (code: string, query = "", headers: Record<string, string> = {}) =>
  GET(new Request(`https://app.example.co.il/r/${code}${query}`, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/130", ...headers } }), { params: Promise.resolve({ code }) } as never);
const flush = () => new Promise((r) => setTimeout(r, 10));

describe("/r/[code]", () => {
  it("a known code: the cookie, a 302 to the home page keeping utm_*, a referral_visit", async () => {
    const a = await db.createUser("a@example.com");
    const { code } = await db.ensureReferralCode(a.id, () => "BKPRZWK");
    const res = await visit(code.toLowerCase(), "?utm_source=wa&utm_campaign=friends&x=1");
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://app.example.co.il/");
    expect(Object.fromEntries(to.searchParams)).toEqual({ utm_source: "wa", utm_campaign: "friends" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("alze_ref=BKPRZWK");
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    await flush();
    expect(db.pageEvents.map((e) => [e.event, e.path, e.utm_source])).toEqual([["referral_visit", "/r", "wa"]]);
    expect(JSON.stringify(db.pageEvents)).not.toContain("BKPRZWK"); // the code is not stored with the visit
  });

  it("an unknown or malformed code: the home page, no cookie, nothing counted", async () => {
    for (const code of ["ZZZZZZZ", "0000000", "x"]) {
      const res = await visit(code);
      expect(res.status).toBe(302);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    await flush();
    expect(db.pageEvents).toHaveLength(0);
  });

  it("the visit count failing (no salt key) never breaks the landing", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", "");
    const a = await db.createUser("a@example.com");
    await db.ensureReferralCode(a.id, () => "BKPRZWK");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await visit("BKPRZWK");
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("alze_ref=BKPRZWK");
  });

  it("a bot or Do-Not-Track: the cookie, but no visit counted", async () => {
    const a = await db.createUser("a@example.com");
    await db.ensureReferralCode(a.id, () => "BKPRZWK");
    expect((await visit("BKPRZWK", "", { "user-agent": "WhatsApp/2.23 facebookexternalhit/1.1" })).headers.get("set-cookie")).toContain("alze_ref=");
    await visit("BKPRZWK", "", { dnt: "1" });
    await flush();
    expect(db.pageEvents).toHaveLength(0);
  });
});
