import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AgentDailyCapError, AgentLimitError, AgentNameTakenError } from "./errors";
import { SupabaseDb } from "./supabase";

/** A recording stand-in for the supabase-js builder: every call is logged; the terminal returns `result`. */
function stub(result: { data: unknown; error: unknown; count?: number }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "neq", "not", "gte", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const client = { from: (table: string) => (calls.push(["from", table]), builder) } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

const UID = "11111111-1111-4111-8111-111111111111";
const AID = "22222222-2222-4222-8222-222222222222";

describe("SupabaseDb — agents (0006)", () => {
  it("maps the trigger's agent_limit_reached and the unique name to typed errors", async () => {
    const limited = stub({ data: null, error: { code: "P0001", message: "agent_limit_reached", details: "plan=basic limit=1" } });
    await expect(limited.db.createAgent({ user_id: UID, name: "שני", role: "custom" })).rejects.toBeInstanceOf(AgentLimitError);
    const taken = stub({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "agents_user_name_unique"' } });
    await expect(taken.db.updateAgent(UID, AID, { name: "שם" })).rejects.toBeInstanceOf(AgentNameTakenError);
    const other = stub({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(other.db.createAgent({ user_id: UID, name: "x", role: "custom" })).rejects.toThrow(/Supabase createAgent: connection failure/);
  });

  it("scopes get / update / delete by the owner, and update sends only the mutable fields", async () => {
    const s = stub({ data: [{ id: AID }], error: null });
    await s.db.getAgent(UID, AID);
    await s.db.deleteAgent(UID, AID);
    await s.db.updateAgent(UID, AID, { enabled: false, role: "intern", user_id: "x" } as never);
    const eqs = s.calls.filter((c) => c[0] === "eq");
    expect(eqs).toEqual([
      ["eq", "user_id", UID],
      ["eq", "id", AID],
      ["eq", "user_id", UID],
      ["eq", "id", AID],
      ["eq", "user_id", UID],
      ["eq", "id", AID],
    ]);
    expect(s.calls.find((c) => c[0] === "update")).toEqual(["update", { enabled: false }]);
  });

  it("maps the daily cap trigger on pending_actions to AgentDailyCapError (with the cap); other errors stay generic", async () => {
    const capped = stub({ data: null, error: { code: "P0001", message: "agent_daily_cap_reached", details: "cap=3 used=3" } });
    const err = await capped.db.createPendingAction(UID, "send_mail", {}, new Date(), { agentKey: "builtin:bookkeeper", agentName: "מנהלת חשבונות" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentDailyCapError);
    expect((err as AgentDailyCapError).cap).toBe(3);
    const other = stub({ data: null, error: { code: "23514", message: "pending_actions_agent_key_format" } });
    await expect(other.db.createPendingAction(UID, "send_mail", {}, new Date())).rejects.toThrow(/Supabase createPendingAction/);
  });

  it("reads the model's history without the agent-management turns, and hides a message by owner and id", async () => {
    const all = stub({ data: [], error: null });
    await all.db.recentMessages(UID, 50);
    expect(all.calls.filter((c) => c[0] === "eq")).toEqual([["eq", "user_id", UID]]); // the 24-hour window sees every message
    const forModel = stub({ data: [], error: null });
    await forModel.db.recentMessages(UID, 10, { forModel: true });
    expect(forModel.calls.filter((c) => c[0] === "eq")).toEqual([
      ["eq", "user_id", UID],
      ["eq", "hidden_from_model", false],
    ]);
    expect(forModel.calls.find((c) => c[0] === "select")?.[1]).toContain("hidden_from_model");
    const hide = stub({ data: null, error: null });
    await hide.db.hideMessageFromModel(UID, AID);
    expect(hide.calls.filter((c) => c[0] !== "from")).toEqual([
      ["update", { hidden_from_model: true }],
      ["eq", "user_id", UID],
      ["eq", "id", AID],
    ]);
  });

  it("counts an agent's drafts since a time, without cancelled / expired / failed", async () => {
    const s = stub({ data: null, error: null, count: 3 });
    expect(await s.db.countAgentActionsSince(UID, "builtin:bookkeeper", new Date("2026-10-21T00:00:00Z"))).toBe(3);
    expect(s.calls).toContainEqual(["eq", "agent_key", "builtin:bookkeeper"]);
    expect(s.calls).toContainEqual(["not", "status", "in", "(cancelled,expired,failed)"]);
  });
});
