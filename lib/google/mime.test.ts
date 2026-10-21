import { describe, expect, it } from "vitest";
import { MimeError, buildMimeMessage, encodeHeaderWords, formatAddress, sanitizeHeader, toGmailRaw } from "./mime";

/** Decodes RFC 2047 B-encoded words back to text (test-side only). */
const decodeWords = (s: string) => s.replace(/\r\n /g, "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));
const headerOf = (mime: string, name: string) => {
  const unfolded = mime.split("\r\n\r\n")[0]!.replace(/\r\n /g, " ");
  return unfolded.split("\r\n").find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim() ?? null;
};

describe("MIME builder for Gmail", () => {
  it("encodes Hebrew headers as RFC 2047 words of ≤75 chars and round-trips", () => {
    const subject = "הצעת פשרה בתיק 4471 — נשמח לתשובה עד יום חמישי, תודה רבה מראש על הטיפול המהיר";
    const encoded = encodeHeaderWords(subject);
    for (const word of encoded.split("\r\n ")) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(word.length).toBeLessThanOrEqual(75);
    }
    expect(decodeWords(encoded)).toBe(subject);
    expect(encodeHeaderWords("Plain ASCII")).toBe("Plain ASCII");
    expect(formatAddress({ email: "avraham@example.co.il", name: "יוסי אברהם" })).toBe(`${encodeHeaderWords("יוסי אברהם")} <avraham@example.co.il>`);
    expect(formatAddress({ email: "a@b.co", name: 'John "J" Doe' })).toBe('"John J Doe" <a@b.co>');
  });

  it("strips CR/LF so model-written values cannot inject headers", () => {
    expect(sanitizeHeader("שלום\r\nBcc: evil@x.co")).toBe("שלום Bcc: evil@x.co");
    const mime = buildMimeMessage({ to: [{ email: "a@b.co" }], subject: "hi\r\nBcc: evil@x.co", body: "x" });
    expect(mime.split("\r\n\r\n")[0]!.split("\r\n").filter((l) => /^bcc:/i.test(l))).toEqual([]);
    expect(() => buildMimeMessage({ to: [{ email: "a@b.co\r\nBcc: evil@x.co" }], subject: "s", body: "b" })).toThrow(MimeError);
    expect(() => buildMimeMessage({ to: [{ email: "not-an-email" }], subject: "s", body: "b" })).toThrow(MimeError);
    expect(() => buildMimeMessage({ to: [], subject: "s", body: "b" })).toThrow(MimeError);
  });

  it("builds a text/plain UTF-8 message with To/Cc/Subject/threading headers", () => {
    const mime = buildMimeMessage({ from: { email: "dana.levi@gmail.com", name: "דנה לוי" }, to: [{ email: "avraham@example.co.il", name: "יוסי אברהם" }], cc: [{ email: "office@example.co.il" }], subject: "סיכום הפגישה", body: "שלום יוסי,\nמצורף הסיכום.\nדנה", inReplyTo: "abc@mail.gmail.com" });
    expect(decodeWords(headerOf(mime, "From")!)).toBe("דנה לוי <dana.levi@gmail.com>");
    expect(decodeWords(headerOf(mime, "To")!)).toBe("יוסי אברהם <avraham@example.co.il>");
    expect(headerOf(mime, "Cc")).toBe("office@example.co.il");
    expect(decodeWords(headerOf(mime, "Subject")!)).toBe("סיכום הפגישה");
    expect(headerOf(mime, "In-Reply-To")).toBe("<abc@mail.gmail.com>");
    expect(headerOf(mime, "References")).toBe("<abc@mail.gmail.com>");
    expect(headerOf(mime, "MIME-Version")).toBe("1.0");
    expect(headerOf(mime, "Content-Type")).toBe('text/plain; charset="UTF-8"');
    expect(headerOf(mime, "Content-Transfer-Encoding")).toBe("base64");
    const body = mime.split("\r\n\r\n")[1]!;
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("שלום יוסי,\r\nמצורף הסיכום.\r\nדנה");
    for (const line of mime.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
  });

  it("builds multipart/mixed with a Hebrew-named attachment and base64url raw for Gmail", () => {
    const pdf = new Uint8Array(Buffer.from("%PDF-1.4 test", "latin1"));
    const mime = buildMimeMessage({ to: [{ email: "a@b.co" }], subject: "הסכם", body: "מצורף.", attachments: [{ filename: "הסכם שכירות.pdf", contentType: "application/pdf", bytes: pdf }], boundary: "BOUNDARY" });
    expect(headerOf(mime, "Content-Type")).toBe('multipart/mixed; boundary="BOUNDARY"');
    const parts = mime.split("--BOUNDARY");
    expect(parts).toHaveLength(4); // preamble, text, attachment, closing
    expect(parts[3]).toBe("--\r\n");
    expect(parts[1]).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(parts[2]).toContain("Content-Type: application/pdf; name=");
    expect(parts[2]).toContain(`filename*=UTF-8''${encodeURIComponent("הסכם שכירות.pdf")}`);
    expect(decodeWords(parts[2]!.match(/filename="([^"]+)"/)![1]!)).toBe("הסכם שכירות.pdf");
    const b64 = parts[2]!.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(b64, "base64").toString("latin1")).toBe("%PDF-1.4 test");
    const bad = buildMimeMessage({ to: [{ email: "a@b.co" }], subject: "s", body: "b", attachments: [{ filename: "x.bin", contentType: "text/html\r\nX-Evil: 1", bytes: pdf }], boundary: "B" });
    expect(bad).toContain("Content-Type: application/octet-stream;");
    expect(bad).not.toContain("X-Evil");
    const raw = toGmailRaw(mime);
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(mime);
  });
});
