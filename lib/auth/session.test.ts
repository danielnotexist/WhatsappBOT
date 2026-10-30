import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { derivedKey, sessionEpoch } from "./keys";
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

describe("SESSION_EPOCH", () => {
  const master = randomBytes(32);
  afterEach(() => vi.unstubAllEnvs());

  it("unset, 0 or 1 keep today's session key; raising it signs every session out", () => {
    const userId = randomUUID();
    vi.stubEnv("SESSION_EPOCH", "");
    const today = derivedKey("session", master);
    const token = createSessionToken(userId, { key: today });
    vi.stubEnv("SESSION_EPOCH", "1");
    expect(verifySessionToken(token, { key: derivedKey("session", master) })?.userId).toBe(userId);
    vi.stubEnv("SESSION_EPOCH", "2");
    const raised = derivedKey("session", master);
    expect(raised.equals(today)).toBe(false);
    expect(verifySessionToken(token, { key: raised })).toBeNull();
    expect(verifySessionToken(createSessionToken(userId, { key: raised }), { key: raised })?.userId).toBe(userId);
  });

  it("never touches the other sub-keys or the token-encryption key", () => {
    vi.stubEnv("SESSION_EPOCH", "");
    const before = (["otp", "internal", "demo", "admin"] as const).map((p) => derivedKey(p, master));
    const key64 = master.toString("base64");
    const sealed = encryptToken("refresh-token", { key: key64, aad: "u:microsoft" });
    vi.stubEnv("SESSION_EPOCH", "2");
    (["otp", "internal", "demo", "admin"] as const).forEach((p, i) => expect(derivedKey(p, master).equals(before[i]!)).toBe(true));
    expect(decryptToken(sealed, { key: key64, aad: "u:microsoft" })).toBe("refresh-token");
  });

  it("refuses a value that is not a whole number", () => {
    expect(() => sessionEpoch({ SESSION_EPOCH: "two" })).toThrow(/SESSION_EPOCH/);
    expect(sessionEpoch({})).toBe(1);
    expect(sessionEpoch({ SESSION_EPOCH: "2" })).toBe(2);
  });
});
