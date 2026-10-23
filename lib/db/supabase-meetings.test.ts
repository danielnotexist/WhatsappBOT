import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";
const SID = "33333333-3333-4333-8333-333333333333";
const ROW = { id: SID, user_id: UID, provider: "microsoft", event_key: "microsoft:AAMk1:2026-10-21T06:45:00.000Z", event_id: "AAMk1", title: "סטטוס", meeting_start: "2026-10-21T06:00:00Z", meeting_end: "2026-10-21T06:45:00Z", attendees: [], content: { summary: "x" }, done: [], created_at: "2026-10-21T07:00:00Z" };

function stub(rpc: { data: unknown; error: unknown }, row: unknown = ROW, writeError: unknown = null) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "upsert"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: row, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: writeError });
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), rpc),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — meeting_summaries (0014)", () => {
  it("saves with an upsert that keeps the first summary of an occurrence, then reads it back by (user, event_key)", async () => {
    const s = stub({ data: null, error: null });
    const { id: _id, done: _done, created_at: _c, ...fresh } = ROW;
    void _id;
    void _done;
    void _c;
    expect(await s.db.saveMeetingSummary(fresh as never)).toEqual(ROW);
    expect(s.calls.find((c) => c[0] === "upsert")).toEqual(["upsert", fresh, { onConflict: "user_id,event_key", ignoreDuplicates: true }]);
    expect(s.calls.filter((c) => c[0] === "eq")).toEqual([["eq", "user_id", UID], ["eq", "event_key", ROW.event_key]]);
    await expect(stub({ data: null, error: null }, ROW, { message: "boom" }).db.saveMeetingSummary(fresh as never)).rejects.toThrow(/saveMeetingSummary/);
  });

  it("a lookup is scoped by the user and skips a non-uuid; the mark goes through meeting_summary_mark", async () => {
    const g = stub({ data: null, error: null });
    expect(await g.db.getMeetingSummary(UID, SID)).toEqual(ROW);
    expect(g.calls.filter((c) => c[0] === "eq")).toEqual([["eq", "id", SID], ["eq", "user_id", UID]]);
    const bad = stub({ data: null, error: null });
    expect(await bad.db.getMeetingSummary(UID, "x")).toBeNull();
    expect(await bad.db.markMeetingSummaryAction(UID, "x", "tasks")).toBe(false);
    expect(bad.calls).toEqual([]);
    const m = stub({ data: true, error: null });
    expect(await m.db.markMeetingSummaryAction(UID, SID, "tasks")).toBe(true);
    expect(m.calls[0]).toEqual(["rpc", "meeting_summary_mark", { p_user: UID, p_id: SID, p_action: "tasks" }]);
    expect(await stub({ data: false, error: null }).db.markMeetingSummaryAction(UID, SID, "tasks")).toBe(false);
  });
});
