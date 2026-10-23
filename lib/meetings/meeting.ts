import type { GoogleEvent } from "@/lib/google/client";
import type { GraphEvent } from "@/lib/ms/graph";
import { fromGoogleEvent, fromGraphEvent } from "@/lib/proactive/calendar";
import { DEFAULT_TZ } from "@/lib/time/zoned";

/**
 * One online meeting from either calendar, in the shape the meeting summaries work with (lib/meetings). A meeting is
 * summarised from the transcript its own platform saved — no bot joins the call:
 *   - Teams (Microsoft 365 calendar, onlineMeeting.joinUrl): Graph online-meeting transcripts (lib/meetings/teams.ts);
 *   - Google Meet (Google Calendar, conferenceData / hangoutLink): the transcript Doc Meet saves to Drive (meet.ts);
 *   - Zoom: not yet ("בקרוב" — a Zoom OAuth app needs Zoom's Marketplace review, docs/PROGRESS.md).
 */
export type MeetingProvider = "microsoft" | "google";
export type MeetingPlatform = "teams" | "meet" | "zoom" | "other";

export interface MeetingAttendee {
  name: string;
  email: string;
}

export interface MeetingRef {
  provider: MeetingProvider;
  eventId: string;
  title: string;
  startMs: number;
  endMs: number;
  joinUrl: string | null;
  platform: MeetingPlatform;
  /** everyone on the invitation but the user: the organiser and the attendees (lower-case addresses, no duplicates) */
  attendees: MeetingAttendee[];
  /** the user organises it (null when the calendar did not say) */
  isOrganizer: boolean | null;
  /** Google: the Meet code and the Drive files Meet attached to the event (the transcript among them, once ready) */
  conferenceId?: string | null;
  attachments?: { fileId: string; title: string; mimeType: string; fileUrl: string }[];
}

/** Which platform a (safe) join link belongs to. */
export function platformOf(joinUrl: string | null | undefined): MeetingPlatform {
  if (!joinUrl) return "other";
  let host: string;
  try {
    host = new URL(joinUrl).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const on = (h: string) => host === h || host.endsWith(`.${h}`);
  if (on("teams.microsoft.com") || on("teams.live.com") || on("teams.microsoft.us")) return "teams";
  if (on("meet.google.com")) return "meet";
  if (on("zoom.us") || on("zoom.com")) return "zoom";
  return "other";
}

/** The platforms summarised today. */
export const SUPPORTED_PLATFORMS: readonly MeetingPlatform[] = ["teams", "meet"];

/** The platform's name as the user knows it. */
export function platformName(p: MeetingPlatform): string {
  return p === "teams" ? "Teams" : p === "meet" ? "Google Meet" : p === "zoom" ? "Zoom" : "הפגישה המקוונת";
}

function people(list: MeetingAttendee[], self: readonly string[]): MeetingAttendee[] {
  const mine = new Set(self.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: MeetingAttendee[] = [];
  for (const p of list) {
    const email = p.email.trim().toLowerCase();
    if (!email || mine.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ name: p.name.trim(), email });
  }
  return out;
}

/** A Microsoft 365 event (times in `tz`, as asked with Prefer: outlook.timezone). */
export function meetingFromGraph(e: GraphEvent, tz: string = DEFAULT_TZ, selfEmails: readonly string[] = []): MeetingRef {
  const c = fromGraphEvent(e, tz);
  const joinUrl = e.joinUrl ?? e.textJoinUrl;
  const everyone = [...(e.organizer ? [{ name: e.organizer.name, email: e.organizer.address }] : []), ...e.attendees.map((a) => ({ name: a.name, email: a.address }))];
  return { provider: "microsoft", eventId: e.id, title: e.subject, startMs: c.startMs, endMs: c.endMs, joinUrl, platform: platformOf(joinUrl), attendees: people(everyone, selfEmails), isOrganizer: e.isOrganizer };
}

/** A Google Calendar event (the user's own entry is marked `self`). */
export function meetingFromGoogle(e: GoogleEvent, selfEmails: readonly string[] = []): MeetingRef {
  const c = fromGoogleEvent(e);
  const joinUrl = e.joinUrl ?? e.textJoinUrl;
  const self = [...selfEmails, ...e.attendees.filter((a) => a.self).map((a) => a.email), ...(e.organizer?.self ? [e.organizer.email] : [])];
  const everyone = [...(e.organizer ? [{ name: e.organizer.name, email: e.organizer.email }] : []), ...e.attendees.map((a) => ({ name: a.name, email: a.email }))];
  return {
    provider: "google",
    eventId: e.id,
    title: e.summary,
    startMs: c.startMs,
    endMs: c.endMs,
    joinUrl,
    platform: platformOf(joinUrl),
    attendees: people(everyone, self),
    isOrganizer: e.organizer ? e.organizer.self : null,
    conferenceId: e.conferenceId ?? null,
    attachments: e.attachments ?? [],
  };
}

/** Not all-day, has a meeting link, real times. Declined / cancelled events are left out by the caller. */
export function isOnlineMeeting(m: MeetingRef): boolean {
  return Number.isFinite(m.startMs) && Number.isFinite(m.endMs) && m.endMs > m.startMs && Boolean(m.joinUrl);
}

/** The meeting's key: one summary per occurrence (a recurring meeting has one per date). */
export function meetingKey(m: Pick<MeetingRef, "provider" | "eventId" | "endMs">): string {
  return `${m.provider}:${m.eventId}:${new Date(m.endMs).toISOString()}`;
}
