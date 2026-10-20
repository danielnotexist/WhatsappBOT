import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, createSessionToken, sessionCookieOptions, verifySessionToken } from "./session";

const key = randomBytes(32);

describe("session tokens", () => {
  it("round-trips a user id and expiry", () => {
    const userId = randomUUID();
    const now = new Date("2026-10-20T10:00:00Z");
    const token = createSessionToken(userId, { key, now });
    const session = verifySessionToken(token, { key, now });
    expect(session?.userId).toBe(userId);
    expect(session?.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_SECONDS * 1000);
  });

  it("rejects tampering, wrong keys, expiry and garbage", () => {
    const userId = randomUUID();
    const now = new Date();
    const token = createSessionToken(userId, { key, now });
    expect(verifySessionToken(token, { key: randomBytes(32), now })).toBeNull();
    expect(verifySessionToken(token.replace(userId, randomUUID()), { key, now })).toBeNull();
    expect(verifySessionToken(token, { key, now: new Date(now.getTime() + (SESSION_TTL_SECONDS + 1) * 1000) })).toBeNull();
    expect(verifySessionToken("", { key })).toBeNull();
    expect(verifySessionToken("v1.x.y", { key })).toBeNull();
    expect(verifySessionToken(undefined, { key })).toBeNull();
  });

  it("uses httpOnly + lax + secure-in-production cookie options", () => {
    expect(sessionCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
