import { describe, expect, it } from "vitest";
import { MemoryDb } from "./memory";

describe("MemoryDb", () => {
  it("enforces unique email and cascades on delete", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@b.co");
    await expect(db.createUser("a@b.co")).rejects.toThrow(/duplicate/);
    db.seedConnection(u.id, "microsoft", "a@b.co");
    db.seedSubscription(u.id, "basic", "active");
    db.seedWaIdentity(u.id, "+972501234567");
    await db.createLinkToken(u.id, "ABCD-2345", new Date(Date.now() + 60_000));
    await db.deleteUser(u.id);
    expect(await db.getUser(u.id)).toBeNull();
    expect(await db.listConnections(u.id)).toEqual([]);
    expect(await db.listWaIdentities(u.id)).toEqual([]);
    expect(await db.getSubscription(u.id)).toBeNull();
    expect(await db.findLinkToken("ABCD-2345")).toBeNull();
  });

  it("scopes revoke/unlink to the owner", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    const b = await db.createUser("b@b.co");
    const conn = db.seedConnection(a.id, "google", "a@gmail.com");
    const phone = db.seedWaIdentity(a.id, "+972501234567");
    expect(await db.revokeConnection(b.id, conn.id)).toBeNull();
    expect(await db.unlinkWaIdentity(b.id, phone.id)).toBe(false);
    expect((await db.revokeConnection(a.id, conn.id))?.status).toBe("revoked");
    expect(await db.unlinkWaIdentity(a.id, phone.id)).toBe(true);
  });

  it("claimBillingApproval mirrors claim_billing_approval(): only while the number is the account's active linked one", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@b.co");
    const phone = db.seedWaIdentity(u.id, "+972501234567");
    const a = await db.createBillingApproval({ user_id: u.id, kind: "upgrade", plan: "pro", amount_ils: 10, phone_e164: "+972501234567" });
    await db.unlinkWaIdentity(u.id, phone.id);
    expect(await db.claimBillingApproval(a.id, { userId: u.id, phoneE164: "+972501234567", waMessageId: "wamid.1" })).toBeNull();
    expect((await db.getBillingApproval(a.id))!.status).toBe("pending");
    db.seedWaIdentity(u.id, "+972501234567"); // linked again
    expect((await db.claimBillingApproval(a.id, { userId: u.id, phoneE164: "+972501234567", waMessageId: "wamid.2" }))!.status).toBe("processing");
  });

  it("lowerUsageLimit mirrors lower_plan_limit(): the month's quota down, the remainder never below 0", async () => {
    const db = new MemoryDb();
    db.now = () => new Date("2026-11-20T10:00:00Z");
    const u = await db.createUser("a@b.co");
    db.usage.push({ user_id: u.id, period_start: "2026-11-01", counted_messages: 1000, free_remaining: 2000, plan_limit: 3000 });
    expect(await db.lowerUsageLimit(u.id, 750)).toBe(0);
    expect(await db.lowerUsageLimit(u.id, 750)).toBeNull(); // already there
    expect(db.usage[0]).toMatchObject({ plan_limit: 750, free_remaining: 0 });
  });
});
