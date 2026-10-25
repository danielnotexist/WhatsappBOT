import "server-only";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import type { NewPageEvent } from "@/lib/db/types";
import { CLIENT_EVENTS, DEVICES, MAX_PATH, MAX_VALUE } from "./events";
import { analyticsDay, dailySalt, visitorId } from "./visitor";

/** The server side of the beacon (app/api/a/route.ts): the body's shape, the row it becomes, the session's user. */

export const MAX_BEACON_BYTES = 2048;
/** per IP: generous for an office behind one address, tight for a script */
export const BEACON_RATE = { limit: 120, windowMs: 60_000 } as const;

const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim() || null);

export const beaconSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(MAX_PATH)
      .regex(/^\/[^\s?#]*$/),
    ref: text(MAX_VALUE).refine((v) => v === null || /^[a-z0-9.-]+$/i.test(v)),
    utm_source: text(MAX_VALUE),
    utm_medium: text(MAX_VALUE),
    utm_campaign: text(MAX_VALUE),
    device: z.enum(DEVICES),
    event: z
      .enum(CLIENT_EVENTS)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .strict();

export type Beacon = z.infer<typeof beaconSchema>;

/** The beacon's JSON (sent as text/plain), or undefined when it is too big or not JSON. */
export async function readBeacon(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BEACON_BYTES) return undefined;
  const raw = await request.text().catch(() => null);
  if (raw === null || raw.length > MAX_BEACON_BYTES) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Do-Not-Track / Global Privacy Control sent as headers: the browser asked for nothing to be kept. */
export function headersOptOut(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}

/** The signed-in user of a Cookie header (signature and expiry only), or null. */
export function sessionUserId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      try {
        return verifySessionToken(decodeURIComponent(part.slice(i + 1).trim()))?.userId ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The row for a valid beacon. Nothing of the IP or the User-Agent is in it — only their daily hash. */
export function pageEventRow(body: Beacon, ip: string, userAgent: string, userId: string | null, now: Date = new Date()): NewPageEvent {
  const day = analyticsDay(now);
  return {
    day,
    visitor: visitorId(dailySalt(day), ip, userAgent),
    user_id: userId,
    path: body.path,
    referrer_host: body.ref ? body.ref.toLowerCase() : null,
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
    device: body.device,
    event: body.event,
    at: now.toISOString(),
  };
}
