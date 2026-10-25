import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase";

const A = "a1111111-1111-4111-8111-111111111111";
const B = "b2222222-2222-4222-8222-222222222222";
const REF = { id: "r1", referrer_id: A, referred_user_id: B, code: "BKPRZWK", status: "rewarded", reason: null, referrer_reward: "applied", referred_reward: "pending", created_at: "2026-10-25T08:00:00Z", rewarded_at: "2026-10-26T08:00:00Z", payment_id: "p1" };

/** A stand-in client: records the calls; rpc answers `rpc`, the table builder answers `table` (insert: `insert`). */
function stub(o: { rpc?: { data: unknown; error: unknown }; table?: { data: unknown; error: unknown }; inserts?: { data: unknown; error: unknown }[] } = {}) {
  const calls: [string, ...unknown[]][] = [];
  const inserts = [...(o.inserts ?? [])];
  let inserting = false;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "update", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.insert = (...args: unknown[]) => {
    calls.push(["insert", ...args]);
    inserting = true;
    return builder;
  };
  const answer = async () => {
    if (inserting) {
      inserting = false;
      return inserts.shift() ?? { data: null, error: null };
    }
    return o.table ?? { data: null, error: null };
  };
  builder.single = answer;
  builder.maybeSingle = answer;
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: async (name: string, args: unknown) => (calls.push(["rpc", name, args]), o.rpc ?? { data: null, error: null }),
  } as unknown as SupabaseClient;
  return { db: new SupabaseDb(client), calls };
}

describe("SupabaseDb — referrals (0018)", () => {
  it("rewardReferral: referral_reward() with the payment, the days and the cap; maps the jsonb", async () => {
    const s = stub({ rpc: { data: { result: "rewarded", referral: REF, referrer_next: "2026-12-25T08:00:00+00:00", referred_next: null }, error: null } });
    expect(await s.db.rewardReferral(B, { paymentId: "p1", days: 30, cap: 12 })).toEqual({ result: "rewarded", referral: REF, referrerNextChargeAt: "2026-12-25T08:00:00+00:00", referredNextChargeAt: null });
    expect(s.calls).toEqual([["rpc", "referral_reward", { p_referred: B, p_payment: "p1", p_days: 30, p_cap: 12 }]]);
    expect(await stub({ rpc: { data: { result: "none", referral: null }, error: null } }).db.rewardReferral(B, { paymentId: null, days: 30, cap: 12 })).toEqual({ result: "none", referral: null, referrerNextChargeAt: null, referredNextChargeAt: null });
    await expect(stub({ rpc: { data: null, error: { message: "boom" } } }).db.rewardReferral(B, { paymentId: null, days: 30, cap: 12 })).rejects.toThrow(/rewardReferral/);
  });

  it("applyReferralCredit: referral_apply_credit()", async () => {
    const s = stub({ rpc: { data: { applied: 2, next_charge_at: "2027-01-24T08:00:00+00:00" }, error: null } });
    expect(await s.db.applyReferralCredit(A, 30)).toEqual({ applied: 2, nextChargeAt: "2027-01-24T08:00:00+00:00" });
    expect(s.calls).toEqual([["rpc", "referral_apply_credit", { p_user: A, p_days: 30 }]]);
  });

  it("createReferral: a user referred before (23505) → null; anything else throws", async () => {
    const dup = stub({ inserts: [{ data: null, error: { code: "23505", message: "referrals_referred_user_id_key" } }] });
    expect(await dup.db.createReferral({ referrer_id: A, referred_user_id: B, code: "bkprzwk", status: "pending" })).toBeNull();
    expect(dup.calls.find((c) => c[0] === "insert")![1]).toEqual({ referrer_id: A, referred_user_id: B, code: "BKPRZWK", status: "pending", reason: null });
    await expect(stub({ inserts: [{ data: null, error: { code: "23514", message: "referrals_not_self" } }] }).db.createReferral({ referrer_id: A, referred_user_id: A, code: "X", status: "pending" })).rejects.toThrow(/createReferral/);
  });

  it("ensureReferralCode: a taken code is retried with a new one", async () => {
    const codes = ["AAAAAAA", "CCCCCCC"];
    const s = stub({ inserts: [{ data: null, error: { code: "23505", message: "referral_codes_code_key" } }, { data: { user_id: A, code: "CCCCCCC", created_at: "x" }, error: null }] });
    expect(await s.db.ensureReferralCode(A, () => codes.shift()!)).toMatchObject({ code: "CCCCCCC" });
    expect(s.calls.filter((c) => c[0] === "insert").map((c) => (c[1] as { code: string }).code)).toEqual(["AAAAAAA", "CCCCCCC"]);
  });

  it("rejectReferral only moves a pending referral", async () => {
    const s = stub({ table: { data: { ...REF, status: "rejected", reason: "same_card" }, error: null } });
    expect(await s.db.rejectReferral(B, "same_card")).toMatchObject({ status: "rejected" });
    expect(s.calls).toEqual(expect.arrayContaining([["update", { status: "rejected", reason: "same_card" }], ["eq", "referred_user_id", B], ["eq", "status", "pending"]]));
  });

  it("findReferralCode: a malformed code never reaches the database", async () => {
    const s = stub();
    expect(await s.db.findReferralCode("<x>")).toBeNull();
    expect(s.calls).toEqual([]);
  });
});
