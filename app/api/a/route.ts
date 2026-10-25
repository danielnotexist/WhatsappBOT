import { after } from "next/server";
import { isExcludedPath } from "@/lib/analytics/events";
import { BEACON_RATE, beaconSchema, headersOptOut, pageEventRow, readBeacon, sessionUserId } from "@/lib/analytics/ingest";
import { isBotUserAgent } from "@/lib/analytics/visitor";
import { getDb } from "@/lib/db";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/same-origin";

/**
 * POST /api/a — the cookie-less analytics beacon (lib/analytics/send.ts). Answers 204 at once; the row is written after
 * the response (`after()`):
 *   - the body is checked with zod (lib/analytics/ingest.ts): a path, the referring host, utm_*, mobile / desktop,
 *     an optional funnel step;
 *   - per-IP rate limit (lib/rate-limit), crawlers and scripts dropped by their User-Agent, nothing under DNT / GPC,
 *     nothing for /admin, /api, /dev, /pay;
 *   - visitor = sha256(daily salt + IP + User-Agent) — the salt changes every day and is never stored; the IP and the
 *     User-Agent are not stored either, only the hash and the device class;
 *   - linked to the user only when the request carries a valid session.
 */

const empty = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return empty(403);
  const headers = request.headers;
  const ua = headers.get("user-agent") ?? "";
  // nothing is kept for these, and the answer is the same as for a stored one
  if (headersOptOut(headers) || isBotUserAgent(ua)) return empty(204);

  const ip = clientIp(headers);
  if (!getRateLimiter().hit(`analytics:${ip}`, BEACON_RATE.limit, BEACON_RATE.windowMs)) return empty(429);

  const parsed = beaconSchema.safeParse(await readBeacon(request));
  if (!parsed.success) return empty(400);
  if (isExcludedPath(parsed.data.path)) return empty(204);

  const userId = sessionUserId(headers.get("cookie"));
  const now = new Date();
  after(async () => {
    try {
      await getDb().insertPageEvent(pageEventRow(parsed.data, ip, ua, userId, now));
    } catch (e) {
      console.warn(`[analytics] page event not recorded: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return empty(204);
}
