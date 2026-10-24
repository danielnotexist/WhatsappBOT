import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const ID = "33333333-3333-4333-8333-333333333333";
const ROW = { id: ID, created_at: "2026-10-21T09:00:00Z", type: "signup", dedupe_key: "signup:u1", status: "sending", channel: null, subject: "נרשם חדש", payload: {}, sent_at: null, error: null };

/** A stand-in client: records rpc calls and the table builder's calls; the rpc answers `rpc`, the table answers `row`. */
function stub(rpc: { data: unknown; error: unknown }, row: unknown = ROW) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update", "upsert", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: row, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [row], error: null });
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), rpc),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — owner_alerts (0016) and ops_flags settings", () => {
  it("claims through owner_alert_claim (the window in seconds) and reads the row back", async () => {
    const s = stub({ data: { result: "claimed", id: ID }, error: null });
    const r = await s.db.claimOwnerAlert({ type: "error_spike", dedupe_key: "error_spike:2026-10-21T12", subject: "קפיצה", payload: { count: 12 }, queue: false, limit: { max: 1, windowMs: 3_600_000 } });
    expect(r).toEqual({ result: "claimed", alert: ROW });
    expect(s.calls[0]).toEqual(["rpc", "owner_alert_claim", { p_type: "error_spike", p_dedupe_key: "error_spike:2026-10-21T12", p_subject: "קפיצה", p_payload: { count: 12 }, p_queue: false, p_max: 1, p_window: "3600 seconds" }]);
    const q = stub({ data: { result: "queued", id: ID }, error: null });
    await q.db.claimOwnerAlert({ type: "signup", dedupe_key: "signup:u1", subject: "s", payload: {}, queue: true });
    expect(q.calls[0]![2]).toMatchObject({ p_queue: true, p_max: null, p_window: null });
    expect(await stub({ data: { result: "duplicate" }, error: null }).db.claimOwnerAlert({ type: "signup", dedupe_key: "k", subject: "s", payload: {}, queue: false })).toEqual({ result: "duplicate", alert: null });
    await expect(stub({ data: null, error: { message: "boom" } }).db.claimOwnerAlert({ type: "signup", dedupe_key: "k", subject: "s", payload: {}, queue: false })).rejects.toThrow(/claimOwnerAlert/);
  });

  it("finishes rows by id (sent_at only when sent), takes the queue, lists newest first, upserts a flag", async () => {
    const f = stub({ data: null, error: null });
    await f.db.finishOwnerAlerts([ID], { status: "sent", channel: "email", error: null });
    const update = f.calls.find((c) => c[0] === "update")![1] as Record<string, unknown>;
    expect(update).toMatchObject({ status: "sent", channel: "email", error: null });
    expect(typeof update.sent_at).toBe("string");
    expect(f.calls.find((c) => c[0] === "in")).toEqual(["in", "id", [ID]]);
    const none = stub({ data: null, error: null });
    await none.db.finishOwnerAlerts([], { status: "failed" });
    expect(none.calls).toEqual([]);

    const t = stub({ data: [ROW], error: null });
    expect(await t.db.takeQueuedOwnerAlerts(100)).toEqual([ROW]);
    expect(t.calls[0]).toEqual(["rpc", "owner_alerts_take_queued", { p_limit: 100 }]);

    const l = stub({ data: null, error: null });
    expect(await l.db.listOwnerAlerts(20)).toEqual([ROW]);
    expect(l.calls).toEqual([["from", "owner_alerts"], ["select", expect.any(String)], ["order", "created_at", { ascending: false }], ["limit", 20]]);

    const o = stub({ data: null, error: null });
    await o.db.setOpsFlag("owner_alerts:settings", { quiet: { enabled: false } });
    expect(o.calls).toEqual([["from", "ops_flags"], ["upsert", { key: "owner_alerts:settings", value: { quiet: { enabled: false } } }, { onConflict: "key" }]]);
  });
});
