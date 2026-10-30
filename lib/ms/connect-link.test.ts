import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmac } from "@/lib/auth/keys";
import { MemoryDb } from "@/lib/db/memory";
import { ADMIN_CONNECT_LINK_TTL_SECONDS, CONNECT_LINK_TTL_SECONDS, consumeConnectLink, createConnectLinkToken, verifyConnectLinkToken } from "./connect-link";

const key = randomBytes(32);
const now = new Date("2026-10-30T12:00:00Z");
const UID = "123e4567-e89b-42d3-a456-426614174000";

describe("chat connect links (security round, area C)", () => {
  it("carry the purpose and a random nonce; a user link lasts 30 minutes, an admin link 3 days", () => {
    const a = createConnectLinkToken(UID, "microsoft", { key, now });
    const b = createConnectLinkToken(UID, "microsoft", { key, now });
    expect(a).not.toBe(b); // a fresh nonce each time
    expect(verifyConnectLinkToken(a, { key, now })).toMatchObject({ userId: UID, provider: "microsoft", purpose: "user", exp: now.getTime() / 1000 + CONNECT_LINK_TTL_SECONDS });
    expect(verifyConnectLinkToken(a, { key, now: new Date(now.getTime() + CONNECT_LINK_TTL_SECONDS * 1000) })).toBeNull();
    const admin = createConnectLinkToken(UID, "microsoft", { key, now, purpose: "admin" });
    expect(verifyConnectLinkToken(admin, { key, now: new Date(now.getTime() + 2 * 24 * 3600_000) })).toMatchObject({ purpose: "admin" });
    expect(verifyConnectLinkToken(admin, { key, now: new Date(now.getTime() + ADMIN_CONNECT_LINK_TTL_SECONDS * 1000) })).toBeNull();
    expect(() => createConnectLinkToken(UID, "google", { key, now, purpose: "admin" })).toThrow();
  });

  it("refuses a changed purpose, another key, a trailing part and the old format without a nonce", () => {
    const t = createConnectLinkToken(UID, "google", { key, now });
    const [payload, sig] = t.split(".");
    const raw = Buffer.from(payload!, "base64url").toString("utf8");
    const forged = Buffer.from(raw.replace(".user.", ".admin.")).toString("base64url");
    expect(verifyConnectLinkToken(`${forged}.${sig}`, { key, now })).toBeNull();
    expect(verifyConnectLinkToken(t, { key: randomBytes(32), now })).toBeNull();
    expect(verifyConnectLinkToken(`${t}.x`, { key, now })).toBeNull();
    const old = Buffer.from(`${UID}.google.${Math.floor(now.getTime() / 1000) + 600}`).toString("base64url");
    expect(verifyConnectLinkToken(`${old}.${hmac(key, `connect:${old}`).toString("base64url")}`, { key, now })).toBeNull();
  });

  it("a user link is burned once; an admin link is not single use", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const link = verifyConnectLinkToken(createConnectLinkToken(user.id, "google", { key }), { key })!;
    const [first, second] = await Promise.all([consumeConnectLink(db, link), consumeConnectLink(db, link)]);
    expect([first, second].sort()).toEqual([false, true]);
    expect(await consumeConnectLink(db, verifyConnectLinkToken(createConnectLinkToken(user.id, "google", { key }), { key })!)).toBe(true);
    const admin = verifyConnectLinkToken(createConnectLinkToken(user.id, "microsoft", { key, purpose: "admin" }), { key })!;
    expect(await consumeConnectLink(db, admin)).toBe(true);
    expect(await consumeConnectLink(db, admin)).toBe(true);
  });
});
