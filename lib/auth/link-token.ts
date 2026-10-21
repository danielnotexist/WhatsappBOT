import { randomInt } from "node:crypto";
import { BRAND } from "@/lib/brand";
import type { Db, LinkTokenRow } from "@/lib/db/types";

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
 * Returns a usable token for the user: the latest one if it is still valid for at least 2 minutes
 * (so refreshing the page does not burn tokens), otherwise a fresh one.
 */
export async function issueLinkToken(db: Db, userId: string, now: Date = new Date()): Promise<LinkTokenRow> {
  const latest = await db.latestLinkToken(userId);
  if (latest && !latest.used_at && Date.parse(latest.expires_at) - now.getTime() > 2 * 60_000) return latest;
  for (let i = 0; i < 5; i++) {
    try {
      return await db.createLinkToken(userId, generateLinkToken(), new Date(now.getTime() + LINK_TOKEN_TTL_MS));
    } catch (e) {
      if (i === 4) throw e; // unique collision 5 times in a row is not a collision
    }
  }
  throw new Error("unreachable");
}
