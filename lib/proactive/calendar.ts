import type { GoogleEvent } from "@/lib/google/client";
import type { GraphEvent } from "@/lib/ms/graph";
import { DEFAULT_TZ, zonedParts, zonedToUtc } from "@/lib/time/zoned";
import { domainOf } from "./mail";

/**
 * Calendar checks for the proactive section of the morning summary and the urgent alerts (lib/proactive): overlapping
 * meetings, back-to-back meetings in two different places, and meetings with someone from outside the business.
 * Both calendars are mapped to one shape first, so a clash between a Microsoft 365 meeting and a Google one counts.
 */
export interface CalEvent {
  provider: "microsoft" | "google";
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  location: string;
  /** has a Teams / Meet / other meeting link — no travel needed */
  online: boolean;
  attendees: { name: string; address: string }[];
  /** shown as free (Google transparency) — never a clash */
  free: boolean;
}

/** Graph returns wall-clock times in the zone we asked for (Prefer: outlook.timezone) — "2026-10-21T09:00:00.0000000". */
function wallClockMs(value: string, tz: string): number {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return zonedToUtc({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) }, tz).getTime();
}

export function fromGraphEvent(e: GraphEvent, tz: string = DEFAULT_TZ): CalEvent {
  return {
    provider: "microsoft",
    id: e.id,
    title: e.subject,
    startMs: wallClockMs(e.start, tz),
    endMs: wallClockMs(e.end, tz),
    allDay: e.isAllDay,
    location: e.location,
    online: e.isOnlineMeeting || Boolean(e.joinUrl) || Boolean(e.textJoinUrl),
    attendees: e.attendees.map((a) => ({ name: a.name, address: a.address.trim().toLowerCase() })),
    free: false,
  };
}

export function fromGoogleEvent(e: GoogleEvent): CalEvent {
  return {
    provider: "google",
    id: e.id,
    title: e.summary,
    startMs: e.isAllDay ? NaN : Date.parse(e.start),
    endMs: e.isAllDay ? NaN : Date.parse(e.end),
    allDay: e.isAllDay,
    location: e.location,
    online: Boolean(e.joinUrl) || Boolean(e.textJoinUrl) || e.hasConference,
    attendees: e.attendees.filter((a) => !a.self).map((a) => ({ name: a.name, address: a.email.trim().toLowerCase() })),
    free: e.transparency === "transparent",
  };
}

const timed = (e: CalEvent) => !e.allDay && !e.free && Number.isFinite(e.startMs) && Number.isFinite(e.endMs) && e.endMs > e.startMs;
/** The same meeting seen in both calendars (an invitation accepted in both): same title and the same times. */
const sameMeeting = (a: CalEvent, b: CalEvent) => a.startMs === b.startMs && a.endMs === b.endMs && a.title.trim() === b.title.trim();

export interface EventPair {
  a: CalEvent;
  b: CalEvent;
}

/** A stable key for a pair, independent of order — the alert's dedupe key. */
export const pairKey = (kind: string, p: EventPair) => `${kind}:${[`${p.a.provider}:${p.a.id}`, `${p.b.provider}:${p.b.id}`].sort().join("|")}`;

/** Meetings that overlap (by start time; the same meeting in both calendars is not a clash). */
export function findConflicts(events: readonly CalEvent[]): EventPair[] {
  const list = events.filter(timed).sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
  const out: EventPair[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j]!.startMs < list[i]!.endMs; j++) {
      if (!sameMeeting(list[i]!, list[j]!)) out.push({ a: list[i]!, b: list[j]! });
    }
  }
  return out;
}

const PLACE_STOP = /^(teams|microsoft teams|zoom|google meet|meet|טלפון|שיחה|online|אונליין)$/i;
const physicalPlace = (e: CalEvent) => {
  const place = e.location.trim();
  return !e.online && place.length > 1 && !PLACE_STOP.test(place) && !/^https?:\/\//i.test(place) ? place : null;
};

/**
 * One meeting ends and the next starts within `maxGapMin` minutes, in two different physical places — no time to get
 * from one to the other. Online meetings and meetings without a place are left out (no travel to judge).
 */
export function findBackToBack(events: readonly CalEvent[], maxGapMin = 10): EventPair[] {
  const list = events.filter(timed).sort((x, y) => x.startMs - y.startMs);
  const out: EventPair[] = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    const gap = b.startMs - a.endMs;
    if (gap < 0 || gap > maxGapMin * 60_000) continue;
    const pa = physicalPlace(a);
    const pb = physicalPlace(b);
    if (pa && pb && pa.toLowerCase() !== pb.toLowerCase()) out.push({ a, b });
  }
  return out;
}

/** Mail providers where the domain says nothing about the business (a gmail.com user's clients are on gmail.com too). */
export const FREE_MAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "walla.co.il", "walla.com", "012.net.il", "bezeqint.net", "netvision.net.il", "zahav.net.il"]);
const ROOM = /(^|[^a-z])(room|rooms|resource|conf)([^a-z]|$)|חדר/i;

/**
 * Who in the meeting is from outside: an attendee whose domain is not one of the user's own (with a free-mail account
 * every other address counts), not the user, not a meeting room.
 */
export function externalAttendees(e: CalEvent, selfAddresses: readonly string[]): { name: string; address: string }[] {
  const self = new Set(selfAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const ownDomains = new Set([...self].map(domainOf).filter((d) => d && !FREE_MAIL_DOMAINS.has(d)));
  return e.attendees.filter((a) => a.address && !self.has(a.address) && !ROOM.test(a.address) && !ROOM.test(a.name) && !ownDomains.has(domainOf(a.address)));
}

/** "09:00" in `tz`. */
export function clockOf(ms: number, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(new Date(ms), tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
