import "server-only";
import { after } from "next/server";
import type { Db, NewPageEvent } from "@/lib/db/types";
import { MAX_PATH, MAX_VALUE, type AnalyticsEvent, type ServerEvent } from "./events";
import { analyticsDay, dailySalt, isBotUserAgent, userVisitorId, visitorId } from "./visitor";

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

/**
 * A named event of a browser with no session row to hash (round 3: `referral_visit`, a visit through /r/<code>) — the
 * same anonymous daily id as a page view (sha256 of the day's salt + IP + User-Agent; neither is stored). Crawlers
 * and link previews (their User-Agent) and browsers that ask for nothing to be kept (DNT / GPC) are not recorded.
 * Fire and forget like trackServerEvent.
 */
export function trackVisitorEvent(
  db: Db,
  event: AnalyticsEvent,
  v: { ip: string; userAgent: string; headers?: Headers; path: string; referrer?: string | null; utm?: Partial<Record<"utm_source" | "utm_medium" | "utm_campaign", string | null>> },
  now: Date = new Date(),
): void {
  if (isBotUserAgent(v.userAgent) || (v.headers && (v.headers.get("dnt") === "1" || v.headers.get("sec-gpc") === "1"))) return;
  const day = analyticsDay(now);
  const clean = (s: string | null | undefined) => (s ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_VALUE) || null : null);
  let referrer: string | null = null;
  try {
    referrer = v.referrer ? clean(new URL(v.referrer).hostname.toLowerCase()) : null;
  } catch {
    referrer = null;
  }
  const row: NewPageEvent = {
    day,
    visitor: visitorId(dailySalt(day), v.ip, v.userAgent),
    user_id: null,
    path: v.path.slice(0, MAX_PATH),
    referrer_host: referrer,
    utm_source: clean(v.utm?.utm_source),
    utm_medium: clean(v.utm?.utm_medium),
    utm_campaign: clean(v.utm?.utm_campaign),
    device: null,
    event,
    at: now.toISOString(),
  };
  const run = async () => {
    try {
      await db.insertPageEvent(row);
    } catch (e) {
      if (process.env.NODE_ENV !== "test") console.warn(`[analytics] ${event} not recorded: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  try {
    after(run);
  } catch {
    const p = run().finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

/** Tests: waits for the writes started outside a request. */
export async function flushServerEvents(): Promise<void> {
  await Promise.all([...inFlight]);
}
