import type { Db } from "@/lib/db/types";
import { globalSingleton } from "@/lib/global-singleton";

/** users.last_seen_at moves at most once an hour (the database checks it too, across instances). */
export const LAST_SEEN_INTERVAL_MS = 3_600_000;

/**
 * "נראה לאחרונה" for the admin panel: on sign-in, an inbound WhatsApp message and a load of /account. Best effort —
 * never throws (a missing migration 0015 must not break a sign-in or a reply), and skips the database when this
 * instance already wrote it within the hour.
 */
export async function touchLastSeen(db: Db, userId: string, now: Date = new Date()): Promise<void> {
  const seen = globalSingleton("last-seen", () => new Map<string, number>());
  const last = seen.get(userId);
  if (last !== undefined && now.getTime() - last < LAST_SEEN_INTERVAL_MS) return;
  seen.set(userId, now.getTime());
  if (seen.size > 5000) seen.clear();
  try {
    await db.touchLastSeen(userId, now, LAST_SEEN_INTERVAL_MS);
  } catch (e) {
    seen.delete(userId);
    console.warn("[last-seen] not recorded:", (e as Error).message);
  }
}
