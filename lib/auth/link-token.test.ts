import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { LINK_TOKEN_ALPHABET, LINK_TOKEN_TTL_MS, extractLinkToken, generateLinkToken, isLinkTokenFormat, issueLinkToken, linkMessage, linkTokenForId, linkTokenHash, waMeUrl } from "./link-token";

describe("link tokens", () => {
  it("generates XXXX-XXXX without ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const t = generateLinkToken();
      expect(isLinkTokenFormat(t)).toBe(true);
      expect(t).not.toMatch(/[01OI]/);
    }
  });

  it("builds the wa.me link with the branded Hebrew message and extracts the token back", () => {
    const url = waMeUrl("972501234567", "ABCD-2345");
    expect(url.startsWith("https://wa.me/972501234567?text=")).toBe(true);
    expect(linkMessage("ABCD-2345")).toBe("היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)");
    expect(decodeURIComponent(url.split("text=")[1]!)).toBe(linkMessage("ABCD-2345"));
    expect(extractLinkToken(linkMessage("ABCD-2345"))).toBe("ABCD-2345");
    expect(extractLinkToken("abcd2345")).toBe("ABCD-2345");
    expect(extractLinkToken("ABCD–2345")).toBe("ABCD-2345"); // en dash from a phone keyboard
    expect(extractLinkToken("מה יש לי מחר?")).toBeNull();
  });

  it("finds the token through bidi marks, mirrored parentheses and older message formats", () => {
    expect(extractLinkToken("היי עלזה! אפשר לקשר את החשבון שלי (\u200EABCD-2345\u200E)")).toBe("ABCD-2345");
    expect(extractLinkToken("היי עלזה! אפשר לקשר את החשבון שלי )ABCD-2345(")).toBe("ABCD-2345");
    expect(extractLinkToken("\u202Bהיי עלזה! (abcd−2345)\u202C")).toBe("ABCD-2345"); // minus sign, lower case
    expect(extractLinkToken("היי! לקשר את החשבון שלי: ABCD-2345")).toBe("ABCD-2345"); // the previous format
    // the parenthesised token wins over another 8-character word in the same message
    expect(extractLinkToken("REF12345 היי עלזה (WXYZ-6789)")).toBe("WXYZ-6789");
    expect(extractLinkToken("היי עלזה (ABC-12)")).toBeNull();
  });

  it("reuses a fresh token and rotates one that is about to expire or was used", async () => {
    const key = Buffer.alloc(32, 3);
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const now = new Date("2026-10-20T10:00:00Z");
    const t1 = await issueLinkToken(db, user.id, now, key);
    const t2 = await issueLinkToken(db, user.id, new Date(now.getTime() + 60_000), key);
    expect(t2.token).toBe(t1.token);
    expect(Date.parse(t1.expires_at) - now.getTime()).toBe(LINK_TOKEN_TTL_MS);
    const t3 = await issueLinkToken(db, user.id, new Date(now.getTime() + LINK_TOKEN_TTL_MS - 60_000), key);
    expect(t3.token).not.toBe(t1.token);
    db.linkTokens.find((t) => t.id === t3.id)!.used_at = now.toISOString();
    const t4 = await issueLinkToken(db, user.id, new Date(now.getTime() + LINK_TOKEN_TTL_MS - 60_000), key);
    expect(t4.token).not.toBe(t3.token);
  });

  it("stores only an HMAC of the code; the code is derived from the row id with the key", async () => {
    const key = Buffer.alloc(32, 7);
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const t = await issueLinkToken(db, user.id, new Date(), key);
    expect(isLinkTokenFormat(t.token)).toBe(true);
    const row = db.linkTokens[0]!;
    expect(JSON.stringify(row)).not.toContain(t.token);
    expect(row.token_hash).toBe(linkTokenHash(t.token, key));
    expect(linkTokenForId(row.id, key)).toBe(t.token);
    expect(linkTokenForId(row.id, Buffer.alloc(32, 8))).not.toBe(t.token);
    expect([...t.token.replace("-", "")].every((c) => LINK_TOKEN_ALPHABET.includes(c))).toBe(true);
  });
});
