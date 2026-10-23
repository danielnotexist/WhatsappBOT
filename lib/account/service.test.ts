import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { activeGoogleConnection } from "@/lib/google";
import { activeMicrosoftConnection } from "@/lib/ms";
import { DELETE_CONFIRM_WORD, cancelSubscriptionFor, deleteAccountFor, disconnectConnectionFor, replaceOtherConnections, unlinkPhoneFor } from "./service";

describe("account service", () => {
  it("disconnects only the owner's connection and audits it", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    const b = await db.createUser("b@b.co");
    const conn = db.seedConnection(a.id, "microsoft", "a@b.co");
    expect(await disconnectConnectionFor(db, b.id, conn.id)).toMatchObject({ ok: false });
    expect(await disconnectConnectionFor(db, a.id, "")).toMatchObject({ ok: false });
    const r = await disconnectConnectionFor(db, a.id, conn.id);
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("Microsoft 365");
    expect((await db.listConnections(a.id))[0]!.status).toBe("revoked");
    expect(db.audit.some((x) => x.action === "connection.revoke" && x.user_id === a.id)).toBe(true);
  });

  it("one account per provider: a new connect replaces the older one, and the tools use the newest", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    const admin = db.seedConnection(a.id, "microsoft", "admin@tenant.onmicrosoft.com");
    const google = db.seedConnection(a.id, "google", "a@gmail.com");
    const real = db.seedConnection(a.id, "microsoft", "daniel@office.co.il");
    // before the replacement (rows from before this fix): the newest active account wins
    expect(activeMicrosoftConnection(await db.listConnections(a.id))!.id).toBe(real.id);
    const revoked: string[] = [];
    expect(await replaceOtherConnections(db, a.id, real, async (_db, c) => void revoked.push(c.id))).toBe(1);
    expect(revoked).toEqual([admin.id]);
    const rows = await db.listConnections(a.id);
    expect(rows.find((c) => c.id === admin.id)!.status).toBe("revoked");
    expect(rows.find((c) => c.id === real.id)!.status).toBe("active");
    expect(activeGoogleConnection(rows)!.id).toBe(google.id); // the other provider is untouched
  });

  it("unlinks a phone", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    const phone = db.seedWaIdentity(a.id, "+972501234567");
    expect(await unlinkPhoneFor(db, a.id, phone.id)).toMatchObject({ ok: true });
    expect((await db.listWaIdentities(a.id))[0]!.status).toBe("unlinked");
  });

  it("cancels an active subscription once, never a trial", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    expect(await cancelSubscriptionFor(db, a.id)).toMatchObject({ ok: false });
    db.seedSubscription(a.id, "basic", "active");
    const r = await cancelSubscriptionFor(db, a.id);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/פעיל עד \d+\.\d+\.\d{4}/);
    expect(await cancelSubscriptionFor(db, a.id)).toMatchObject({ ok: false, message: "המנוי כבר בוטל." });
  });

  it("deletes the account only with the confirmation word, revoking and cancelling first", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    db.seedConnection(a.id, "google", "a@gmail.com");
    db.seedSubscription(a.id, "pro", "active");
    expect(await deleteAccountFor(db, a.id, "לא")).toMatchObject({ ok: false });
    expect(await db.getUser(a.id)).not.toBeNull();
    expect(await deleteAccountFor(db, a.id, ` ${DELETE_CONFIRM_WORD} `)).toMatchObject({ ok: true });
    expect(await db.getUser(a.id)).toBeNull();
    expect(await db.listConnections(a.id)).toEqual([]);
    expect(db.audit.some((x) => x.action === "account.delete" && x.target === "a@b.co")).toBe(true);
  });
});
