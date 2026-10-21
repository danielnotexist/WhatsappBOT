import { MemoryDb } from "@/lib/db/memory";
import type { Db, UserRow } from "@/lib/db/types";
import { isDemo } from "@/lib/demo";
import { dataMode } from "@/lib/env";
import { derivedKey, hmac } from "./keys";

/**
 * DEMO_MODE (lib/demo.ts) without Supabase runs on several serverless instances, each with its own in-memory db. Two
 * rules keep them in step without shared storage:
 *   1. a user's id is derived from the email (HMAC with the "demo" sub-key of TOKEN_ENC_KEY, shaped as a UUID v4), so
 *      every instance gives the same person the same id;
 *   2. the session carries the email (lib/auth/session.ts v2), so an instance that never saw the user recreates it
 *      from the signed claims.
 * With Supabase configured the demo needs neither: rows persist, ids come from the database.
 */
export function demoUserId(email: string, key: Buffer = derivedKey("demo")): string {
  const bytes = Buffer.from(hmac(key, `user:${email}`).subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The demo's memory db: ids derived from the email. */
export function createDemoDb(): MemoryDb {
  return new MemoryDb({ userIdFor: (email) => demoUserId(email) });
}

/** Extra session claims for `createSessionToken`: the email, only for the demo on the memory store. */
export function demoSessionClaims(email: string): { email?: string } {
  return isDemo() && dataMode() === "memory" ? { email } : {};
}

/**
 * The session's user, recreated from the signed claims when this instance's memory db does not know it (the caller
 * checks `isDemo()`). Untouched — and null when missing — for a v1 token (no email) or any db but the in-memory one.
 */
export async function restoreDemoUser(db: Db, claims: { userId: string; email?: string }): Promise<UserRow | null> {
  const existing = await db.getUser(claims.userId);
  if (existing || !claims.email || !(db instanceof MemoryDb)) return existing;
  return db.restoreUser(claims.userId, claims.email);
}
