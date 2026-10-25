import "server-only";
import { after } from "next/server";
import type { Db, NewPageEvent } from "@/lib/db/types";
import type { ServerEvent } from "./events";
import { analyticsDay, dailySalt, userVisitorId } from "./visitor";

/**
 * The funnel steps that happen on the server, where no browser is in the request: the WhatsApp number linked (the
 * webhook), the mail connected (the OAuth callback), the first payment (the payment return). The row is written
 * directly — no path, no source, no device; the visitor id is the user's daily hash (lib/analytics/visitor.ts).
 * Fire and forget like ownerAlert(): after the response (Next `after()`) or, outside a request, as a promise nobody
 * awaits. Never throws and never delays the caller — safe on the WhatsApp path.
 */

const inFlight = new Set<Promise<void>>();

export function serverEventRow(event: ServerEvent, userId: string, now: Date = new Date()): NewPageEvent {
  const day = analyticsDay(now);
  return {
    day,
    visitor: userVisitorId(dailySalt(day), userId),
    user_id: userId,
    path: null,
    referrer_host: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    device: null,
    event,
    at: now.toISOString(),
  };
}

async function write(db: Db, event: ServerEvent, userId: string, now: Date): Promise<void> {
  try {
    await db.insertPageEvent(serverEventRow(event, userId, now));
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.warn(`[analytics] ${event} not recorded: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function trackServerEvent(db: Db, event: ServerEvent, userId: string, now: Date = new Date()): void {
  const run = () => write(db, event, userId, now);
  try {
    after(run);
  } catch {
    // outside a request (a test, a job): run now, unawaited
    const p = run().finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

/** Tests: waits for the writes started outside a request. */
export async function flushServerEvents(): Promise<void> {
  await Promise.all([...inFlight]);
}
