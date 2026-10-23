import { describe, expect, it, vi } from "vitest";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { MemoryDb } from "@/lib/db/memory";
import { isPlanGateReason, planGate, planGateFor, planGateUrl } from "./plan-gate";

const ms = [{ provider: "microsoft" as const, status: "active", created_at: "2026-10-01T00:00:00Z" }];

describe("the plan's gate on the OAuth start routes", () => {
  it("a second account on a one-account plan; the pro consents on basic and in the trial", () => {
    expect(planGate("basic", ms, "google")).toBe("second_account");
    expect(planGate("trial", ms, "google")).toBe("second_account");
    expect(planGate("pro", ms, "google")).toBeNull();
    expect(planGate("basic", ms, "microsoft")).toBeNull();
    expect(planGate("basic", [], "google", "drive_read")).toBe("pro_feature");
    expect(planGate("trial", [], "google", "tasks")).toBe("pro_feature");
    expect(planGate("basic", [], "google", "gmail_read")).toBeNull(); // mail is in every plan
    expect(planGate("pro", [], "google", "drive_read")).toBeNull();
  });

  it("reads the plan in force from the subscription (a lapsed paid plan is the trial again)", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    db.seedConnection(user.id, "microsoft", "dana@contoso.co.il");
    expect(await planGateFor(db, user.id, "google")).toEqual({ plan: "trial", reason: "second_account" });
    await db.upsertSubscription(user.id, { plan: "pro", status: "active", next_charge_at: "2099-01-01T00:00:00Z" });
    expect(await planGateFor(db, user.id, "google")).toEqual({ plan: "pro", reason: null });
    await db.upsertSubscription(user.id, { status: "cancelled", next_charge_at: "2020-01-01T00:00:00Z" });
    expect((await planGateFor(db, user.id, "google")).reason).toBe("second_account");
  });

  it("the refusal lands on the user's own pay link with a fixed code", () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
    const userId = "11111111-2222-3333-4444-555555555555";
    const url = new URL(planGateUrl("https://app.example.co.il", userId, "second_account"));
    expect(url.origin).toBe("https://app.example.co.il");
    expect(url.searchParams.get("why")).toBe("second_account");
    expect(verifyPayLinkToken(url.pathname.split("/")[2]!)).toEqual({ userId });
    expect(isPlanGateReason("pro_feature")).toBe(true);
    expect(isPlanGateReason("<script>")).toBe(false);
    vi.unstubAllEnvs();
  });
});
