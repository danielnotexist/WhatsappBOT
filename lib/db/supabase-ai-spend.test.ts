import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";

/** A stand-in client that records rpc calls and table reads, answering with `result`. */
function stub(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
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

describe("SupabaseDb — ai_spend (0009)", () => {
  it("adds a call's cost through ai_spend_add and returns the day's total (numeric may come back as a string)", async () => {
    const s = stub({ data: "0.512300", error: null });
    expect(await s.db.addAiSpend("2026-10-22", 0.0123)).toBe(0.5123);
    expect(s.calls).toEqual([["rpc", "ai_spend_add", { p_day: "2026-10-22", p_cost: 0.0123, p_calls: 1 }]]);
    const nan = stub({ data: 0, error: null });
    await nan.db.addAiSpend("2026-10-22", Number.NaN, 2);
    expect(nan.calls[0]).toEqual(["rpc", "ai_spend_add", { p_day: "2026-10-22", p_cost: 0, p_calls: 2 }]);
  });

  it("reserves through ai_spend_reserve (-1 = refused) and settles through ai_spend_adjust (0010)", async () => {
    const r = stub({ data: "0.400000", error: null });
    expect(await r.db.reserveAiSpend("2026-10-22", 0.1, 3)).toBe(0.4);
    expect(r.calls).toEqual([["rpc", "ai_spend_reserve", { p_day: "2026-10-22", p_cost: 0.1, p_budget: 3 }]]);
    expect(await stub({ data: -1, error: null }).db.reserveAiSpend("2026-10-22", 0.1, 3)).toBe(-1);
    await expect(stub({ data: null, error: { message: "boom" } }).db.reserveAiSpend("2026-10-22", 0.1, 3)).rejects.toThrow(/reserveAiSpend/);
    const a = stub({ data: "0.25", error: null });
    expect(await a.db.adjustAiSpend("2026-10-22", -0.05)).toBe(0.25);
    expect(a.calls).toEqual([["rpc", "ai_spend_adjust", { p_day: "2026-10-22", p_delta: -0.05 }]]);
    await expect(stub({ data: null, error: { message: "boom" } }).db.adjustAiSpend("2026-10-22", 1)).rejects.toThrow(/adjustAiSpend/);
  });

  it("reads the day's total and the user's count; missing rows are 0", async () => {
    const total = stub({ data: { cost_usd: "1.25" }, error: null });
    expect(await total.db.getAiSpend("2026-10-22")).toBe(1.25);
    expect(total.calls).toEqual([["from", "ai_spend"], ["select", "cost_usd"], ["eq", "day", "2026-10-22"]]);
    expect(await stub({ data: null, error: null }).db.getAiSpend("2026-10-22")).toBe(0);
    const count = stub({ data: { messages: 7 }, error: null });
    expect(await count.db.getAiUserMessages("2026-10-22", UID)).toBe(7);
    expect(count.calls).toEqual([["from", "ai_spend_users"], ["select", "messages"], ["eq", "day", "2026-10-22"], ["eq", "user_id", UID]]);
  });

  it("admits a message through ai_spend_admit_message (-1 = the cap is full) and surfaces errors", async () => {
    const ok = stub({ data: 3, error: null });
    expect(await ok.db.admitAiUserMessage("2026-10-22", UID, 60)).toBe(3);
    expect(ok.calls).toEqual([["rpc", "ai_spend_admit_message", { p_day: "2026-10-22", p_user_id: UID, p_limit: 60 }]]);
    expect(await stub({ data: -1, error: null }).db.admitAiUserMessage("2026-10-22", UID, 60)).toBe(-1);
    await expect(stub({ data: null, error: { message: "boom" } }).db.admitAiUserMessage("2026-10-22", UID, 60)).rejects.toThrow(/admitAiUserMessage/);
  });
});
