import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";
import type { NewPageEvent } from "./types";

const ROW: NewPageEvent = { day: "2026-10-25", visitor: "a".repeat(64), user_id: "11111111-1111-4111-8111-111111111111", path: "/", referrer_host: null, utm_source: "e2e", utm_medium: null, utm_campaign: null, device: "mobile", event: null };

/** A stand-in client: records the calls; `insert` answers the queued results in turn, `rpc` by function name. */
function stub(opts: { inserts?: { error: unknown }[]; rpc?: Record<string, { data: unknown; error: unknown }> } = {}) {
  const calls: unknown[][] = [];
  const inserts = [...(opts.inserts ?? [{ error: null }])];
  const client = {
    from: (table: string) => ({
      insert: async (row: unknown) => (calls.push(["insert", table, row]), inserts.shift() ?? { error: null }),
    }),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), opts.rpc?.[name] ?? { data: [], error: null }),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — page_events (0017)", () => {
  it("inserts the row as given", async () => {
    const s = stub();
    await s.db.insertPageEvent(ROW);
    expect(s.calls).toEqual([["insert", "page_events", ROW]]);
  });

  it("a user deleted since (FK violation) → the same row again without the link", async () => {
    const s = stub({ inserts: [{ error: { code: "23503", message: "violates foreign key" } }, { error: null }] });
    await s.db.insertPageEvent(ROW);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1]).toEqual(["insert", "page_events", { ...ROW, user_id: null }]);
  });

  it("any other error throws", async () => {
    await expect(stub({ inserts: [{ error: { code: "23514", message: "check" } }] }).db.insertPageEvent(ROW)).rejects.toThrow(/insertPageEvent/);
  });

  it("the report: five functions with the range, numbers parsed, the funnel in order, devices always both", async () => {
    const s = stub({
      rpc: {
        analytics_daily: { data: [{ day: "2026-10-24", visitors: "3", views: 7 }], error: null },
        analytics_top_pages: { data: [{ path: "/", views: 5, visitors: 3 }], error: null },
        analytics_sources: { data: [{ source: null, kind: "direct", visitors: 2 }, { source: "e2e", kind: "utm", visitors: 1 }], error: null },
        analytics_devices: { data: [{ device: "desktop", visitors: 1 }], error: null },
        analytics_funnel: { data: [{ step: "signup_start", ord: 1, actors: 2 }, { step: "visit", ord: 0, actors: 3 }], error: null },
      },
    });
    const r = await s.db.analyticsReport("2026-10-19", "2026-10-25", { top: 5 });
    expect(s.calls).toEqual(
      expect.arrayContaining([
        ["rpc", "analytics_daily", { p_from: "2026-10-19", p_to: "2026-10-25" }],
        ["rpc", "analytics_top_pages", { p_from: "2026-10-19", p_to: "2026-10-25", p_limit: 5 }],
        ["rpc", "analytics_sources", { p_from: "2026-10-19", p_to: "2026-10-25", p_limit: 5 }],
        ["rpc", "analytics_devices", { p_from: "2026-10-19", p_to: "2026-10-25" }],
        ["rpc", "analytics_funnel", { p_from: "2026-10-19", p_to: "2026-10-25" }],
      ]),
    );
    expect(r).toEqual({
      daily: [{ day: "2026-10-24", visitors: 3, views: 7 }],
      pages: [{ path: "/", views: 5, visitors: 3 }],
      sources: [
        { source: null, kind: "direct", visitors: 2 },
        { source: "e2e", kind: "utm", visitors: 1 },
      ],
      devices: [
        { device: "mobile", visitors: 0 },
        { device: "desktop", visitors: 1 },
      ],
      funnel: [
        { step: "visit", count: 3 },
        { step: "signup_start", count: 2 },
      ],
    });
  });

  it("an error from any of them throws", async () => {
    await expect(stub({ rpc: { analytics_funnel: { data: null, error: { message: "bad range" } } } }).db.analyticsReport("2026-10-25", "2026-10-19")).rejects.toThrow(/analyticsReport/);
  });
});
