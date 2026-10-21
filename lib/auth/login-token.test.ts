import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { LOGIN_TOKEN_TTL_MS, consumeLoginToken, issueLoginToken, peekLoginToken } from "./login-token";

const key = randomBytes(32);

describe("WhatsApp login tokens", () => {
  it("signs a 10-minute token that works exactly once", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-21T10:00:00Z");
    const { token, expiresAt } = await issueLoginToken(db, user.id, { now, key });
    expect(expiresAt.getTime() - now.getTime()).toBe(LOGIN_TOKEN_TTL_MS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const peek = peekLoginToken(token, { now, key });
    expect(typeof peek === "object" && peek.userId).toBe(user.id);

    expect(await consumeLoginToken(db, token, { now, key })).toEqual({ ok: true, userId: user.id });
    expect(await consumeLoginToken(db, token, { now, key })).toEqual({ ok: false, reason: "used" });
  });

  it("expires after 10 minutes and a newer token replaces the older one", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-21T10:00:00Z");
    const first = await issueLoginToken(db, user.id, { now, key });
    const later = new Date(now.getTime() + LOGIN_TOKEN_TTL_MS + 1000);
    expect(await consumeLoginToken(db, first.token, { now: later, key })).toEqual({ ok: false, reason: "expired" });

    const a = await issueLoginToken(db, user.id, { now, key });
    const b = await issueLoginToken(db, user.id, { now, key });
    expect(await consumeLoginToken(db, a.token, { now, key })).toEqual({ ok: false, reason: "used" });
    expect(await consumeLoginToken(db, b.token, { now, key })).toEqual({ ok: true, userId: user.id });
  });

  it("rejects tampered, foreign-key and malformed tokens", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-21T10:00:00Z");
    const { token } = await issueLoginToken(db, user.id, { now, key });
    const [payload, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(Buffer.from(payload, "base64url").toString().replace(/^[0-9a-f-]{36}/, "00000000-0000-4000-8000-000000000000")).toString("base64url");
    expect(await consumeLoginToken(db, `${forged}.${sig}`, { now, key })).toEqual({ ok: false, reason: "invalid" });
    expect(await consumeLoginToken(db, token, { now, key: randomBytes(32) })).toEqual({ ok: false, reason: "invalid" });
    expect(peekLoginToken("nope", { now, key })).toBe("invalid");
    expect(peekLoginToken(`${token}.x`, { now, key })).toBe("invalid");
  });
});
