import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";
const CID = "33333333-3333-4333-8333-333333333333";

/** A stand-in client: records rpc calls and the table builder's calls; the rpc answers `rpc`, the table answers `row`. */
function stub(rpc: { data: unknown; error: unknown }, row: unknown) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "delete"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: row, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), rpc),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — connect security (area C)", () => {
  it("revoking a connection also deletes its Graph subscriptions (as MemoryDb; the FK cascade fires only on delete)", async () => {
    const s = stub({ data: null, error: null }, { id: CID, user_id: UID, provider: "microsoft", status: "revoked" });
    await s.db.revokeConnection(UID, CID);
    const i = s.calls.findIndex((c) => c[0] === "from" && c[1] === "graph_subscriptions");
    expect(i).toBeGreaterThan(0);
    expect(s.calls.slice(i)).toEqual([["from", "graph_subscriptions"], ["delete"], ["eq", "connection_id", CID]]);
    // a connection that is not this user's: nothing else is touched
    const none = stub({ data: null, error: null }, null);
    expect(await none.db.revokeConnection(UID, CID)).toBeNull();
    expect(none.calls.some((c) => c[1] === "graph_subscriptions")).toBe(false);
  });

  it("a chat connect link is burned through connect_link_consume (0021); a non-uuid user never reaches it", async () => {
    const s = stub({ data: true, error: null }, null);
    const exp = new Date("2026-10-30T12:30:00.000Z");
    expect(await s.db.consumeConnectLink("nh", UID, exp)).toBe(true);
    expect(s.calls).toEqual([["rpc", "connect_link_consume", { p_nonce_hash: "nh", p_user_id: UID, p_expires_at: exp.toISOString() }]]);
    expect(await stub({ data: false, error: null }, null).db.consumeConnectLink("nh", UID, exp)).toBe(false);
    const bad = stub({ data: true, error: null }, null);
    expect(await bad.db.consumeConnectLink("nh", "x", exp)).toBe(false);
    expect(bad.calls).toEqual([]);
    await expect(stub({ data: null, error: { message: "boom" } }, null).db.consumeConnectLink("nh", UID, exp)).rejects.toThrow(/consumeConnectLink/);
  });

  it("the link code is read by its HMAC without consuming it", async () => {
    const row = { id: "x", user_id: UID, token_hash: "th", expires_at: "2026-10-30T12:15:00Z", used_at: null, created_at: "2026-10-30T12:00:00Z" };
    const s = stub({ data: null, error: null }, row);
    expect(await s.db.findLinkToken("th")).toEqual(row);
    expect(s.calls).toEqual([["from", "link_tokens"], ["select", "*"], ["eq", "token_hash", "th"]]);
  });
});
