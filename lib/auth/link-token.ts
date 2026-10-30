import { randomInt, randomUUID } from "node:crypto";
import { BRAND } from "@/lib/brand";
import type { Db } from "@/lib/db/types";
import { derivedKey, hmac } from "./keys";

/** 8 characters, XXXX-XXXX, 15 minutes, single use (PLAN §1). No 0/O/1/I to avoid misreads. */
export const LINK_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_TOKEN_TTL_MS = 15 * 60_000;

export function generateLinkToken(): string {
  const pick = () => LINK_TOKEN_ALPHABET[randomInt(0, LINK_TOKEN_ALPHABET.length)]!;
  const part = () => pick() + pick() + pick() + pick();
  return `${part()}-${part()}`;
}

export function isLinkTokenFormat(s: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s);
}

/**
 * The message the user sends to the bot from the wa.me link (round plan §1):
 * "היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)". The bot extracts the token with `extractLinkToken`.
 */
export function linkMessage(token: string): string {
  return `היי ${BRAND.name}! אפשר לקשר את החשבון שלי (${token})`;
}

/** Bidi controls and zero-width characters a phone keyboard / WhatsApp may insert around Latin text in RTL. */
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const DASHES = "-‐‑‒–—―−";
const TOKEN_PART = "[A-Z0-9]{4}";

/**
 * Finds the XXXX-XXXX token in a free-text message. Prefers a token inside parentheses (our own message format,
 * also when bidi rendering mirrors them), then any standalone 8-character token with or without a dash.
 */
export function extractLinkToken(text: string): string | null {
  const t = text.replace(INVISIBLES, "").toUpperCase();
  const dash = `[${DASHES}]?`;
  const inParens = t.match(new RegExp(`[(\\[)\\]]\\s*(${TOKEN_PART})${dash}(${TOKEN_PART})\\s*[)\\]([]`));
  const m = inParens ?? t.match(new RegExp(`\\b(${TOKEN_PART})${dash}(${TOKEN_PART})\\b`));
  return m ? `${m[1]}-${m[2]}` : null;
}

export function waMeUrl(publicNumber: string, token: string): string {
  return `https://wa.me/${publicNumber}?text=${encodeURIComponent(linkMessage(token))}`;
}

/**
 * The code is never stored (security round B, 0020): the row keeps only `token_hash` = HMAC(link sub-key, code), and
 * the code itself is derived from the row id with the same key — so the page can show it again on a refresh, while a
 * copy of the database alone reveals no usable code.
 */
export function linkTokenForId(id: string, key: Buffer = derivedKey("link")): string {
  const bytes = hmac(key, `link-token:${id}`);
  let out = "";
  for (let i = 0; i < 8; i++) out += LINK_TOKEN_ALPHABET[bytes[i]! % LINK_TOKEN_ALPHABET.length]!; // 256 % 32 = 0: no bias
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function linkTokenHash(token: string, key: Buffer = derivedKey("link")): string {
  return hmac(key, `link-lookup:${token}`).toString("base64url");
}

/** The phone in the trial ledger (wa_trial_phones, 0020): an HMAC, never the number. */
export function trialPhoneHash(phoneE164: string, key: Buffer = derivedKey("ledger")): string {
  return hmac(key, `trial-phone:${phoneE164}`).toString("base64url");
}

export interface IssuedLinkToken {
  id: string;
  token: string;
  expires_at: string;
}

/**
 * Returns a usable token for the user: the latest one if it is still valid for at least 2 minutes
 * (so refreshing the page does not burn tokens), otherwise a fresh one.
 */
export async function issueLinkToken(db: Db, userId: string, now: Date = new Date(), key: Buffer = derivedKey("link")): Promise<IssuedLinkToken> {
  const latest = await db.latestLinkToken(userId);
  if (latest && !latest.used_at && Date.parse(latest.expires_at) - now.getTime() > 2 * 60_000) {
    return { id: latest.id, token: linkTokenForId(latest.id, key), expires_at: latest.expires_at };
  }
  for (let i = 0; i < 5; i++) {
    const id = randomUUID();
    const token = linkTokenForId(id, key);
    try {
      const row = await db.createLinkToken(userId, { id, tokenHash: linkTokenHash(token, key) }, new Date(now.getTime() + LINK_TOKEN_TTL_MS));
      return { id: row.id, token, expires_at: row.expires_at };
    } catch (e) {
      if (i === 4) throw e; // unique collision 5 times in a row is not a collision
    }
  }
  throw new Error("unreachable");
}
