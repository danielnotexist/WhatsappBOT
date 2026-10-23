import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";
const AID = "22222222-2222-4222-8222-222222222222";
const ROW = { id: AID, user_id: UID, item_key: "mail:microsoft:m1", kind: "urgent_mail", channel: "urgent", status: "sent", local_day: "2026-10-21", payload: {}, created_at: "2026-10-21T07:00:00Z" };

/** A stand-in client: records rpc calls and the table builder's calls; the rpc answers `rpc`, the table answers `row`. */
function stub(rpc: { data: unknown; error: unknown }, row: unknown = ROW) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "update", "upsert"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: row, error: null });
  builder.single = async () => ({ data: row, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [row], error: null });
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), rpc),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — proactive_alerts (0013)", () => {
  it("claims through proactive_alert_claim and reads the row back", async () => {
    const s = stub({ data: { result: "claimed", id: AID }, error: null });
    const r = await s.db.claimProactiveAlert({ user_id: UID, item_key: "mail:microsoft:m1", kind: "urgent_mail", local_day: "2026-10-21", payload: { who: "x" } }, { cap: 2, deliver: true });
    expect(r).toEqual({ result: "claimed", alert: ROW });
    expect(s.calls[0]).toEqual(["rpc", "proactive_alert_claim", { p_user: UID, p_item_key: "mail:microsoft:m1", p_kind: "urgent_mail", p_day: "2026-10-21", p_payload: { who: "x" }, p_cap: 2, p_deliver: true }]);
    expect(await stub({ data: { result: "duplicate" }, error: null }).db.claimProactiveAlert({ user_id: UID, item_key: "k", kind: "conflict", local_day: "2026-10-21", payload: {} }, { cap: 2, deliver: true })).toEqual({ result: "duplicate", alert: null });
    await expect(stub({ data: null, error: { message: "boom" } }).db.claimProactiveAlert({ user_id: UID, item_key: "k", kind: "conflict", local_day: "2026-10-21", payload: {} }, { cap: 2, deliver: true })).rejects.toThrow(/claimProactiveAlert/);
  });

  it("a summary line is an upsert on (user, channel, item, day); a lookup is scoped by the user and skips a non-uuid", async () => {
    const s = stub({ data: null, error: null });
    await s.db.addProactiveSummaryItem({ user_id: UID, item_key: "conflict:a|b", kind: "conflict", local_day: "2026-10-21", payload: {} });
    expect(s.calls.find((c) => c[0] === "upsert")).toEqual(["upsert", { user_id: UID, item_key: "conflict:a|b", kind: "conflict", local_day: "2026-10-21", payload: {}, channel: "summary", status: "listed" }, { onConflict: "user_id,channel,item_key,local_day" }]);
    const g = stub({ data: null, error: null });
    expect(await g.db.getProactiveAlert(UID, AID)).toEqual(ROW);
    expect(g.calls.filter((c) => c[0] === "eq")).toEqual([["eq", "id", AID], ["eq", "user_id", UID]]);
    const bad = stub({ data: null, error: null });
    expect(await bad.db.getProactiveAlert(UID, "not-a-uuid")).toBeNull();
    expect(bad.calls).toEqual([]);
  });
});
