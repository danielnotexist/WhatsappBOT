import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { MemoryDb } from "./memory";
import { SupabaseDb } from "./supabase";

const UID = "11111111-1111-4111-8111-111111111111";

describe("mergeUserProfile (security round H: no lost update)", () => {
  it("SupabaseDb: one atomic profile_merge RPC (0025), never a read of the whole profile and a write back", async () => {
    const calls: unknown[][] = [];
    const row = { id: UID, email: "a@b.co", name: null, business_name: null, business_type: null, timezone: "Asia/Jerusalem", morning_time: "07:30", locale: "he-IL", profile: { a: 1 }, created_at: "x", deleted_at: null, signup_source: null };
    const client = {
      from: (table: string) => {
        calls.push(["from", table]);
        throw new Error("no table access expected");
      },
      rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), { data: [row], error: null }),
    } as unknown as SupabaseClient;
    const db = new SupabaseDb(client);
    const out = await db.mergeUserProfile(UID, { oauth_pending: { google: null } }, { deep: ["oauth_pending"] });
    expect(calls).toEqual([["rpc", "profile_merge", { p_user_id: UID, p_patch: { oauth_pending: { google: null } }, p_deep: ["oauth_pending"] }]]);
    expect(out.profile).toEqual({ a: 1 });
    expect(out).not.toHaveProperty("signup_source");
    await expect(db.mergeUserProfile("nope", { a: 1 })).rejects.toThrow("user not found");
    const missing = new SupabaseDb({ rpc: async () => ({ data: null, error: { message: "user not found" } }) } as unknown as SupabaseClient);
    await expect(missing.mergeUserProfile(UID, { a: 1 })).rejects.toThrow("user not found");
  });

  it("SupabaseDb before 0025 is applied: falls back to the old merge (logged) instead of failing every profile write", async () => {
    const updates: unknown[] = [];
    const row = { id: UID, profile: { a: 1, oauth_pending: { google: { state: "g" } } } };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is"]) builder[m] = () => builder;
    builder.update = (v: unknown) => (updates.push(v), builder);
    builder.maybeSingle = async () => ({ data: row, error: null });
    builder.single = async () => ({ data: { ...row, profile: (updates[0] as { profile: unknown }).profile }, error: null });
    const client = { from: () => builder, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.profile_merge" } }) } as unknown as SupabaseClient;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await new SupabaseDb(client).mergeUserProfile(UID, { oauth_pending: { microsoft: { state: "m" } } }, { deep: ["oauth_pending"] });
    expect(out.profile).toEqual({ a: 1, oauth_pending: { google: { state: "g" }, microsoft: { state: "m" } } });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("0025_privacy_retention.sql"));
    spy.mockRestore();
  });

  it("MemoryDb mirrors it: top-level keys replaced, `deep` keys merged one level, null kept as null", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@b.co");
    await db.mergeUserProfile(u.id, { login_token: { nonce_hash: "h" }, oauth_pending: { google: { state: "g" } } });
    await db.mergeUserProfile(u.id, { oauth_pending: { microsoft: { state: "m" } } }, { deep: ["oauth_pending"] });
    expect((await db.getUser(u.id))!.profile.oauth_pending).toEqual({ google: { state: "g" }, microsoft: { state: "m" } });
    await db.mergeUserProfile(u.id, { oauth_pending: { google: null } }, { deep: ["oauth_pending"] });
    expect((await db.getUser(u.id))!.profile).toEqual({ login_token: { nonce_hash: "h" }, oauth_pending: { google: null, microsoft: { state: "m" } } });
    await db.mergeUserProfile(u.id, { oauth_pending: { google: null } });
    expect((await db.getUser(u.id))!.profile.oauth_pending).toEqual({ google: null });
  });
});
