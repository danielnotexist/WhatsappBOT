import { createHash } from "node:crypto";

/**
 * The account's number in the website chat (/demo/chat): derived from "demo-<userId>" (sha256 → 12 digits) under +999,
 * a country code no phone has. wa_identities only takes E.164 (`^\+[1-9][0-9]{7,14}$`), so the virtual number is shaped
 * as one; the personal area shows it as "הצ'אט באתר", never as a number.
 */
export function demoChatPhone(userId: string): string {
  const hash = createHash("sha256").update(`demo-${userId}`).digest();
  const digits = (hash.readBigUInt64BE(0) % 1_000_000_000_000n).toString().padStart(12, "0");
  return `+999${digits}`;
}

export const isDemoChatPhone = (e164: string): boolean => /^\+999\d{12}$/.test(e164);
