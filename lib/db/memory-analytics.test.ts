import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { seedAdminDemo } from "@/lib/admin/demo-seed";
import { MemoryDb } from "./memory";
import type { NewPageEvent } from "./types";

const v = (seed: string) => createHash("sha256").update(seed).digest("hex");
const row = (over: Partial<NewPageEvent>): NewPageEvent => ({ day: "2030-03-01", visitor: v("A"), user_id: null, path: "/", referrer_host: null, utm_source: null, utm_medium: null, utm_campaign: null, device: "desktop", event: null, ...over });

/** The same day as supabase/tests/analytics.test.sql, so both implementations answer alike. */
async function sample(db: MemoryDb): Promise<string> {
  const user = await db.createUser("analytics@example.com");
  const at = (t: string) => `2030-03-01T${t}:00+02:00`;
  for (const r of [
    row({ at: at("08:00"), visitor: v("A1"), path: "/", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "lawyers", device: "mobile" }),
    row({ at: at("08:01"), visitor: v("A1"), path: "/pricing", device: "mobile" }),
    row({ at: at("08:02"), visitor: v("A1"), path: "/start", device: "mobile" }),
    row({ at: at("09:00"), visitor: v("C1"), path: "/" }),
    row({ at: at("09:05"), visitor: v("C1"), path: "/pricing" }),
    row({ at: at("10:00"), visitor: v("B1"), path: "/", referrer_host: "www.google.com" }),
    row({ at: at("08:03"), visitor: v("A1"), path: "/start/email", device: "mobile", event: "signup_start" }),
    row({ at: at("08:04"), visitor: v("A1"), path: "/start/email", device: "mobile", event: "code_sent" }),
    row({ at: at("08:04"), visitor: v("A1"), path: "/start/email", device: "mobile", event: "code_sent" }),
    row({ at: at("08:05"), visitor: v("A1"), path: "/start/code", device: "mobile", event: "code_ok" }),
    row({ at: at("09:06"), visitor: v("C1"), path: "/start/email", event: "signup_start" }),
    row({ at: at("08:10"), visitor: v("user-A"), user_id: user.id, path: null, device: null, event: "wa_linked" }),
    row({ at: "2030-03-03T12:00:00+02:00", day: "2030-03-03", visitor: v("A3"), path: "/", device: "mobile" }),
  ])
    await db.insertPageEvent(r);
  return user.id;
}

describe("MemoryDb — page_events (0017), the same answers as the SQL functions", () => {
  it("daily: every day of the range, visitors and page views (funnel steps are not page views)", async () => {
    const db = new MemoryDb();
    await sample(db);
    const r = await db.analyticsReport("2030-03-01", "2030-03-03");
    expect(r.daily).toEqual([
      { day: "2030-03-01", visitors: 3, views: 6 },
      { day: "2030-03-02", visitors: 0, views: 0 },
      { day: "2030-03-03", visitors: 1, views: 1 },
    ]);
  });

  it("top pages, sources per visitor-day (later pages of a campaign visit are not direct), devices", async () => {
    const db = new MemoryDb();
    await sample(db);
    const r = await db.analyticsReport("2030-03-01", "2030-03-03", { top: 2 });
    expect(r.pages).toEqual([
      { path: "/", views: 4, visitors: 4 },
      { path: "/pricing", views: 2, visitors: 2 },
    ]);
    expect(r.sources).toEqual([
      { source: null, kind: "direct", visitors: 2 },
      { source: "facebook", kind: "utm", visitors: 1 },
    ]);
    const all = await db.analyticsReport("2030-03-01", "2030-03-03");
    expect(all.sources.reduce((s, x) => s + x.visitors, 0)).toBe(4);
    expect(all.sources).toContainEqual({ source: "www.google.com", kind: "referrer", visitors: 1 });
    expect(all.devices).toEqual([
      { device: "mobile", visitors: 2 },
      { device: "desktop", visitors: 2 },
    ]);
  });

  it("the funnel: visitor-days per step, a repeated step counted once, the range filters", async () => {
    const db = new MemoryDb();
    await sample(db);
    expect((await db.analyticsReport("2030-03-01", "2030-03-03")).funnel.map((f) => [f.step, f.count])).toEqual([
      ["visit", 4],
      ["signup_start", 2],
      ["code_sent", 1],
      ["code_ok", 1],
      ["wa_linked", 1],
      ["mail_connected", 0],
      ["paid", 0],
    ]);
    expect((await db.analyticsReport("2030-03-03", "2030-03-03")).funnel.map((f) => f.count)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it("a user deleted: the link goes, the anonymous row stays; an unknown user id is stored as null", async () => {
    const db = new MemoryDb();
    const id = await sample(db);
    await db.deleteUser(id);
    expect(db.pageEvents.find((e) => e.event === "wa_linked")!.user_id).toBeNull();
    expect((await db.analyticsReport("2030-03-01", "2030-03-01")).funnel.find((f) => f.step === "wa_linked")!.count).toBe(1);
    await db.insertPageEvent(row({ user_id: "99999999-9999-4999-8999-999999999999" }));
    expect(db.pageEvents.at(-1)!.user_id).toBeNull();
  });

  it("a bad range throws (the SQL raises 22023)", async () => {
    const db = new MemoryDb();
    await expect(db.analyticsReport("2030-03-03", "2030-03-01")).rejects.toThrow(/range/);
    await expect(db.analyticsReport("2030-01-01", "2031-06-01")).rejects.toThrow(/range/);
  });

  it("the demo seed: 90 days of traffic, a funnel that narrows, and seeding twice adds nothing", async () => {
    const db = new MemoryDb();
    const now = new Date("2026-10-25T10:00:00Z");
    seedAdminDemo(db, now);
    const n = db.pageEvents.length;
    expect(n).toBeGreaterThan(3000);
    seedAdminDemo(db, now);
    expect(db.pageEvents.length).toBe(n);
    const r = await db.analyticsReport("2026-07-28", "2026-10-25");
    expect(r.daily).toHaveLength(90);
    expect(r.daily.filter((d) => d.visitors > 0).length).toBeGreaterThan(85);
    const counts = r.funnel.map((f) => f.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    expect(counts.at(-1)!).toBeGreaterThan(0);
    expect(r.sources.some((s) => s.kind === "direct") && r.sources.some((s) => s.kind === "utm") && r.sources.some((s) => s.kind === "referrer")).toBe(true);
    expect(r.devices.every((d) => d.visitors > 0)).toBe(true);
    expect(db.pageEvents.every((e) => /^[0-9a-f]{64}$/.test(e.visitor) && e.at <= now.toISOString())).toBe(true);
  });
});
