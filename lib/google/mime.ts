import { randomBytes } from "node:crypto";

/**
 * RFC 2822 / MIME message for Gmail `users.messages.send` (the `raw` field = base64url of these bytes).
 * Hebrew headers use RFC 2047 encoded-words (UTF-8, B-encoding, ≤75 chars each); the body is UTF-8 base64.
 * Every header value is stripped of CR/LF/control characters — model-written subjects and names can never
 * inject extra headers (Bcc, etc.).
 */
export class MimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimeError";
  }
}

export interface MimeAddress {
  email: string;
  name?: string | null;
}

export interface MimeAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface MimeMessageInput {
  from?: MimeAddress | null;
  to: MimeAddress[];
  cc?: MimeAddress[];
  bcc?: MimeAddress[];
  subject: string;
  /** plain text */
  body: string;
  attachments?: MimeAttachment[];
  /** Message-ID of the mail being answered (RFC 2822 threading; Gmail also needs a matching Subject) */
  inReplyTo?: string | null;
  references?: string | null;
  /** deterministic boundary for tests */
  boundary?: string;
}

const CRLF = "\r\n";
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const MIME_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

/** Removes anything that could end a header line. */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

const isPlainAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 B-encoding, split on code points so no UTF-8 sequence is cut; words joined with folding whitespace. */
export function encodeHeaderWords(value: string): string {
  const clean = sanitizeHeader(value);
  if (isPlainAscii(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const ch of clean) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

export function formatAddress(a: MimeAddress): string {
  const email = sanitizeHeader(a.email);
  if (!isValidEmail(email)) throw new MimeError(`invalid email address: ${email.slice(0, 80)}`);
  const name = a.name ? sanitizeHeader(a.name) : "";
  if (!name) return email;
  if (isPlainAscii(name)) return `"${name.replace(/["\\]/g, "")}" <${email}>`;
  return `${encodeHeaderWords(name)} <${email}>`;
}

const formatList = (list: MimeAddress[]) => list.map(formatAddress).join(`,${CRLF} `);

function base64Lines(bytes: Uint8Array | string): string {
  const b64 = Buffer.from(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes).toString("base64");
  return b64.match(/.{1,76}/g)?.join(CRLF) ?? "";
}

/** RFC 2231 percent-encoding for `filename*=` */
const rfc2231 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function messageIdHeader(id: string): string {
  const v = sanitizeHeader(id);
  return v.startsWith("<") ? v : `<${v}>`;
}

/** Builds the full message (CRLF line endings). */
export function buildMimeMessage(input: MimeMessageInput): string {
  if (!input.to.length) throw new MimeError("no recipients");
  const headers: string[] = [];
  if (input.from) headers.push(`From: ${formatAddress(input.from)}`);
  headers.push(`To: ${formatList(input.to)}`);
  if (input.cc?.length) headers.push(`Cc: ${formatList(input.cc)}`);
  if (input.bcc?.length) headers.push(`Bcc: ${formatList(input.bcc)}`);
  headers.push(`Subject: ${encodeHeaderWords(input.subject)}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${messageIdHeader(input.inReplyTo)}`);
  if (input.references || input.inReplyTo) headers.push(`References: ${sanitizeHeader(input.references ?? messageIdHeader(input.inReplyTo!))}`);
  headers.push("MIME-Version: 1.0");

  const textPart = [`Content-Type: text/plain; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", base64Lines(input.body.replace(/\r?\n/g, CRLF))].join(CRLF);
  if (!input.attachments?.length) return [...headers, textPart].join(CRLF) + CRLF;

  const boundary = input.boundary ?? `=_part_${randomBytes(12).toString("hex")}`;
  const parts = [textPart];
  for (const a of input.attachments) {
    const filename = sanitizeHeader(a.filename).replace(/["\\]/g, "") || "attachment";
    const type = MIME_TYPE_RE.test(a.contentType) ? a.contentType : "application/octet-stream";
    const quoted = isPlainAscii(filename) ? filename : encodeHeaderWords(filename).replace(new RegExp(`${CRLF} `, "g"), "");
    parts.push(
      [
        `Content-Type: ${type}; name="${quoted}"`,
        `Content-Disposition: attachment; filename="${quoted}"; filename*=UTF-8''${rfc2231(filename)}`,
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(a.bytes),
      ].join(CRLF),
    );
  }
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.map((p) => `--${boundary}${CRLF}${p}`), `--${boundary}--`, ""].join(CRLF);
}

/** Gmail's `raw`: base64url (RFC 4648 §5) of the RFC 2822 bytes. */
export function toGmailRaw(mime: string): string {
  return Buffer.from(mime, "utf8").toString("base64url");
}
