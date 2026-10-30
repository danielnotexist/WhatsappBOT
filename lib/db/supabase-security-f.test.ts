import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";
const PA = "22222222-2222-4222-8222-222222222222";

/** A stand-in client that records the query it is given, answering with `result`. */
function stub(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "update"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => result;
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), result),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — security round F", () => {
  it("claimPendingAction is one conditional UPDATE: the user's row, still pending, not expired", async () => {
    const now = new Date("2026-10-30T10:00:00Z");
    const s = stub({ data: { id: PA, status: "approved" }, error: null });
    expect(await s.db.claimPendingAction(PA, UID, "approved", now, { approved_msg_id: "wamid.1" })).toMatchObject({ id: PA, status: "approved" });
    expect(s.calls.slice(0, 6)).toEqual([
      ["from", "pending_actions"],
      ["update", { approved_msg_id: "wamid.1", status: "approved" }],
      ["eq", "id", PA],
      ["eq", "user_id", UID],
      ["eq", "status", "pending"],
      ["gt", "expires_at", now.toISOString()],
    ]);
    // another press got there first: no row
    expect(await stub({ data: null, error: null }).db.claimPendingAction(PA, UID, "cancelled", now)).toBeNull();
    // a malformed id never reaches the database
    const bad = stub({ data: null, error: null });
    expect(await bad.db.claimPendingAction("x", UID, "approved", now)).toBeNull();
    expect(bad.calls).toEqual([]);
    await expect(stub({ data: null, error: { message: "boom" } }).db.claimPendingAction(PA, UID, "approved", now)).rejects.toThrow(/claimPendingAction/);
  });

  it("the support chat's pool goes through ai_spend_pool_reserve / ai_spend_pool_adjust (0024), never ai_spend", async () => {
    const r = stub({ data: "0.300000", error: null });
    expect(await r.db.reserveAiPoolSpend("support", "2026-10-30", 0.1, 0.5)).toBe(0.3);
    expect(r.calls).toEqual([["rpc", "ai_spend_pool_reserve", { p_pool: "support", p_day: "2026-10-30", p_cost: 0.1, p_budget: 0.5 }]]);
    expect(await stub({ data: -1, error: null }).db.reserveAiPoolSpend("support", "2026-10-30", 0.1, 0.5)).toBe(-1);
    const a = stub({ data: "0.2", error: null });
    expect(await a.db.adjustAiPoolSpend("support", "2026-10-30", -0.1)).toBe(0.2);
    expect(a.calls).toEqual([["rpc", "ai_spend_pool_adjust", { p_pool: "support", p_day: "2026-10-30", p_delta: -0.1 }]]);
    const g = stub({ data: { cost_usd: "0.25" }, error: null });
    expect(await g.db.getAiPoolSpend("support", "2026-10-30")).toBe(0.25);
    expect(g.calls).toEqual([["from", "ai_spend_pools"], ["select", "cost_usd"], ["eq", "pool", "support"], ["eq", "day", "2026-10-30"]]);
  });
});
