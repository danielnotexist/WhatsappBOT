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
});
