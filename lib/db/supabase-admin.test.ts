import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

/** The admin panel's queries (migration 0015) against a recording stand-in of supabase-js: tables, filters, RPC names and arguments. */
const UID = "11111111-1111-4111-8111-111111111111";
const CID = "33333333-3333-4333-8333-333333333333";

function stub(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "or", "lt", "gte", "order", "limit", "update", "insert"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => (calls.push(["maybeSingle"]), result);
  builder.single = async () => (calls.push(["single"]), result);
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args?: unknown) => (calls.push(["rpc", name, args]), result),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

const only = (calls: [string, ...unknown[]][], name: string) => calls.filter((c) => c[0] === name);

describe("SupabaseDb — the admin panel (0015)", () => {
  it("the sign-up source is set once (only where it is still null); last seen moves at most once per interval", async () => {
    const s = stub({ data: null, error: null });
    await s.db.setSignupSource(UID, { utm_source: "test" });
    expect(s.calls).toEqual([["from", "users"], ["update", { signup_source: { utm_source: "test" } }], ["eq", "id", UID], ["is", "signup_source", null]]);

    const t = stub({ data: null, error: null });
    const at = new Date("2026-10-24T10:00:00Z");
    await t.db.touchLastSeen(UID, at, 3_600_000);
    expect(t.calls).toEqual([["from", "users"], ["update", { last_seen_at: at.toISOString() }], ["eq", "id", UID], ["or", "last_seen_at.is.null,last_seen_at.lt.2026-10-24T09:00:00.000Z"]]);
    await expect(stub({ data: null, error: { message: "boom" } }).db.touchLastSeen(UID, at, 1)).rejects.toThrow(/touchLastSeen/);
  });

  it("the overview and the daily figures come from their SQL functions, numbers coerced", async () => {
    const o = stub({ data: [{ id: UID, email: "a@b.co", ai_cost_30d: "0.0123", charge_failures: 2, providers: null }], error: null });
    expect(await o.db.adminUserOverview()).toMatchObject([{ id: UID, ai_cost_30d: 0.0123, charge_failures: 2, providers: [] }]);
    expect(o.calls).toEqual([["rpc", "admin_user_overview", undefined]]);

    const d = stub({ data: [{ day: "2026-10-24", signups: 1, active_users: "2", messages: 3, ai_cost: "0.5", revenue: "116.82" }], error: null });
    expect(await d.db.adminDailyStats("2026-09-25", "2026-10-24")).toEqual([{ day: "2026-10-24", signups: 1, active_users: 2, messages: 3, ai_cost: 0.5, revenue: 116.82 }]);
    expect(d.calls).toEqual([["rpc", "admin_daily_stats", { p_from: "2026-09-25", p_to: "2026-10-24" }]]);
  });

  it("the user, the messages (with the tools) and the audit are read by the user's id", async () => {
    const u = stub({ data: { id: UID }, error: null });
    await u.db.adminGetUser(UID);
    expect(String(only(u.calls, "select")[0]![1])).toMatch(/signup_source,last_seen_at$/);
    expect(await stub().db.adminGetUser("not-a-uuid")).toBeNull();

    const m = stub();
    await m.db.adminMessages(UID, { before: "2026-10-24T00:00:00Z", limit: 60 });
    expect(String(only(m.calls, "select")[0]![1])).toMatch(/,tools$/);
    expect(m.calls).toEqual(expect.arrayContaining([["eq", "user_id", UID], ["lt", "created_at", "2026-10-24T00:00:00Z"], ["order", "created_at", { ascending: false }], ["limit", 60]]));

    const a = stub();
    await a.db.adminAudit(UID, 50);
    expect(a.calls).toEqual(expect.arrayContaining([["from", "audit_log"], ["eq", "user_id", UID], ["limit", 50]]));
  });

  it("tickets: listed with filters, the status and the note set together", async () => {
    const l = stub();
    await l.db.listSupportTickets({ status: "open", userId: UID, limit: 20 });
    expect(l.calls).toEqual(expect.arrayContaining([["from", "support_tickets"], ["eq", "status", "open"], ["eq", "user_id", UID], ["limit", 20]]));
    expect(String(only(l.calls, "select")[0]![1])).toContain("admin_note");

    const s = stub({ data: { id: CID, status: "closed" }, error: null });
    expect(await s.db.setSupportTicketStatus(CID, "closed", "  טופל  ")).toMatchObject({ status: "closed" });
    const patch = only(s.calls, "update")[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ status: "closed", admin_note: "טופל" });
    expect(typeof patch.status_changed_at).toBe("string");
    expect(await stub().db.setSupportTicketStatus("x", "closed")).toBeNull();
  });

  it("chats go through support_chat_append (a non-uuid id writes nothing); errors are inserted and listed", async () => {
    const c = stub({ data: true, error: null });
    const turns = [{ role: "user" as const, text: "שלום" }];
    expect(await c.db.appendSupportChat(CID, { userId: null, page: "/", turns })).toBe(true);
    expect(c.calls).toEqual([["rpc", "support_chat_append", { p_id: CID, p_user: null, p_page: "/", p_turns: turns, p_max: 60 }]]);
    const bad = stub({ data: true, error: null });
    expect(await bad.db.appendSupportChat("nope", { userId: null, page: null, turns })).toBe(false);
    expect(bad.calls).toEqual([]);

    const e = stub({ data: null, error: null });
    await e.db.insertAppError({ source: "bot", message: "x" });
    expect(e.calls).toEqual([["from", "app_errors"], ["insert", { user_id: null, source: "bot", message: "x", context: {} }]]);
    const le = stub();
    await le.db.listAppErrors({ source: "bot", limit: 10 });
    expect(le.calls).toEqual(expect.arrayContaining([["eq", "source", "bot"], ["order", "at", { ascending: false }], ["limit", 10]]));
  });

  it("a message names messages.tools only when a tool ran", async () => {
    const a = stub({ data: { id: "m" }, error: null });
    await a.db.insertMessage({ user_id: UID, direction: "out", text: "שלום", tools: [] });
    expect(only(a.calls, "insert")[0]![1]).not.toHaveProperty("tools");
    const b = stub({ data: { id: "m" }, error: null });
    await b.db.insertMessage({ user_id: UID, direction: "out", text: "מחר", tools: ["calendar_list_events"] });
    expect(only(b.calls, "insert")[0]![1]).toMatchObject({ tools: ["calendar_list_events"] });
  });
});
