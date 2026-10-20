import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  META_SIGNATURE_HEADER,
  computeMetaSignature,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
} from "./signature";

const secret = "meta-app-secret-123";
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        { value: { messages: [{ text: { body: "היי! לקשר את החשבון שלי: ABCD-1234" } }] } },
      ],
    },
  ],
});
const sign = (b: string | Uint8Array, s = secret) =>
  "sha256=" + createHmac("sha256", s).update(b).digest("hex");

describe("lib/wa/signature", () => {
  it("exports the Meta header name in lowercase (Fetch API headers)", () => {
    expect(META_SIGNATURE_HEADER).toBe("x-hub-signature-256");
  });

  it("computes the same signature Meta would", () => {
    expect(computeMetaSignature(body, secret)).toBe(sign(body));
  });

  it("accepts a valid signature (string and bytes, any hex case)", () => {
    expect(verifyMetaSignature(body, sign(body), secret)).toBe(true);
    expect(verifyMetaSignature(new TextEncoder().encode(body), sign(body), secret)).toBe(true);
    expect(
      verifyMetaSignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), secret),
    ).toBe(true);
    expect(verifyMetaSignature(body, ` ${sign(body)} `, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = body.replace("ABCD-1234", "ABCD-9999");
    expect(verifyMetaSignature(tampered, sign(body), secret)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyMetaSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyMetaSignature(body, sign(body), "")).toBe(false);
  });

  it("rejects missing or malformed headers without throwing", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "", secret)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).slice(7), secret)).toBe(false); // no prefix
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", secret)).toBe(false); // wrong length
    expect(verifyMetaSignature(body, "sha256=" + "zz".repeat(32), secret)).toBe(false); // not hex
  });

  it("is sensitive to raw bytes, not parsed JSON", () => {
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyMetaSignature(reserialized, sign(body), secret)).toBe(false);
  });

  it("answers the webhook verification challenge only with the right token", () => {
    const ok = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "my-verify-token",
      "hub.challenge": "1158201444",
    });
    expect(verifyMetaWebhookChallenge(ok, "my-verify-token")).toBe("1158201444");
    expect(verifyMetaWebhookChallenge(ok, "wrong")).toBeNull();
    expect(verifyMetaWebhookChallenge(ok, "")).toBeNull();
    const badMode = new URLSearchParams(ok);
    badMode.set("hub.mode", "unsubscribe");
    expect(verifyMetaWebhookChallenge(badMode, "my-verify-token")).toBeNull();
    expect(verifyMetaWebhookChallenge(new URLSearchParams(), "my-verify-token")).toBeNull();
  });
});
