import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  TokenCryptoError,
  decryptToken,
  encryptToken,
  generateEncryptionKey,
  isEncryptedToken,
  keyFromBase64,
} from "./crypto";

const key = randomBytes(32);

describe("lib/crypto (AES-256-GCM)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips Hebrew, emoji and long tokens", () => {
    for (const plaintext of ["ya29.a0AfH6SMB-שלום-👋", "x", "M.R3_BAY." + "a".repeat(4000)]) {
      const sealed = encryptToken(plaintext, { key });
      // A one-character plaintext can legitimately appear inside random base64url output.
      if (plaintext.length > 1) expect(sealed).not.toContain(plaintext);
      expect(decryptToken(sealed, { key })).toBe(plaintext);
    }
  });

  it("produces a different ciphertext every time (random IV)", () => {
    const a = encryptToken("same", { key });
    const b = encryptToken("same", { key });
    expect(a).not.toBe(b);
    expect(decryptToken(a, { key })).toBe("same");
    expect(decryptToken(b, { key })).toBe("same");
  });

  it("uses the versioned base64url format", () => {
    const sealed = encryptToken("token", { key });
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.split(".")).toHaveLength(4);
    expect(isEncryptedToken(sealed)).toBe(true);
    expect(isEncryptedToken("token")).toBe(false);
    expect(isEncryptedToken(42)).toBe(false);
  });

  it("detects tampering of ciphertext, tag and iv", () => {
    const sealed = encryptToken("secret-token", { key });
    const [v, iv, ct, tag] = sealed.split(".") as [string, string, string, string];
    const flip = (s: string) => s.slice(0, -1) + (s.endsWith("A") ? "B" : "A");
    expect(() => decryptToken([v, iv, flip(ct), tag].join("."), { key })).toThrow(TokenCryptoError);
    expect(() => decryptToken([v, iv, ct, flip(tag)].join("."), { key })).toThrow(TokenCryptoError);
    expect(() => decryptToken([v, flip(iv), ct, tag].join("."), { key })).toThrow(TokenCryptoError);
  });

  it("fails with the wrong key", () => {
    const sealed = encryptToken("secret-token", { key });
    expect(() => decryptToken(sealed, { key: randomBytes(32) })).toThrow(/פענוח נכשל/);
  });

  it("binds the ciphertext to the AAD (user/provider)", () => {
    const sealed = encryptToken("secret-token", { key, aad: "user-a:microsoft" });
    expect(decryptToken(sealed, { key, aad: "user-a:microsoft" })).toBe("secret-token");
    expect(() => decryptToken(sealed, { key, aad: "user-b:microsoft" })).toThrow(TokenCryptoError);
    expect(() => decryptToken(sealed, { key })).toThrow(TokenCryptoError);
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptToken("nope", { key })).toThrow(TokenCryptoError);
    expect(() => decryptToken("v2.a.b.c", { key })).toThrow(TokenCryptoError);
    expect(() => decryptToken("v1.short.b.c", { key })).toThrow(TokenCryptoError);
  });

  it("validates key length", () => {
    expect(() => keyFromBase64(undefined)).toThrow(/TOKEN_ENC_KEY/);
    expect(() => keyFromBase64(randomBytes(16).toString("base64"))).toThrow(/32/);
    expect(() => encryptToken("x", { key: randomBytes(31) })).toThrow(TokenCryptoError);
    expect(keyFromBase64(generateEncryptionKey())).toHaveLength(32);
  });

  it("falls back to TOKEN_ENC_KEY from the environment", () => {
    vi.stubEnv("TOKEN_ENC_KEY", generateEncryptionKey());
    const sealed = encryptToken("from-env");
    expect(decryptToken(sealed)).toBe("from-env");
    vi.stubEnv("TOKEN_ENC_KEY", generateEncryptionKey());
    expect(() => decryptToken(sealed)).toThrow(TokenCryptoError);
  });
});
