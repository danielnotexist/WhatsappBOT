import { GOOGLE_DOC_MIME, GoogleApiError, driveQueryLiteral, type GoogleClient } from "@/lib/google/client";
import { GOOGLE_SCOPES, hasScope } from "@/lib/google/oauth";
import { GraphError, type GraphClient } from "@/lib/ms/graph";
import { MS_MEETING_SCOPES, msHasScope } from "@/lib/ms/oauth";
import type { MeetingRef } from "./meeting";
import { docTranscriptToText, vttToText } from "./transcript";

/**
 * Finding the transcript of one meeting (lib/meetings), per platform. The outcome says what to do next:
 *   found        → summarise it;
 *   not_ready    → the platform is still processing it: the job tries again (RETRY_DELAYS_MIN, lib/meetings/jobs.ts);
 *   none         → transcription was not on in that meeting (or the platform kept nothing);
 *   consent      → the connection lacks the permission (Teams: the meeting-transcript pair; Meet: drive.readonly);
 *   no_access    → the platform refused (typically: not the organiser, or another organisation's meeting);
 *   unsupported  → Zoom ("בקרוב") or a link we cannot read.
 * Transient errors (429, 5xx, network) are thrown, so the job is retried.
 */
export type TranscriptOutcome =
  | { status: "found"; text: string; source: "teams_vtt" | "meet_doc" }
  | { status: "not_ready" }
  | { status: "none" }
  | { status: "consent"; provider: "microsoft" | "google" }
  | { status: "no_access" }
  | { status: "unsupported" };

/** How long after a meeting ends a missing transcript may still appear (Teams: minutes; Meet: up to ~45 minutes). */
export const TRANSCRIPT_GRACE_MS = 2 * 3_600_000;

const notYet = (m: MeetingRef, now: Date): TranscriptOutcome => (now.getTime() < m.endMs + TRANSCRIPT_GRACE_MS ? { status: "not_ready" } : { status: "none" });

/** The Teams pair is in the connection's grant. */
export function teamsTranscriptsGranted(scopes: readonly string[]): boolean {
  return scopes.length > 0 && MS_MEETING_SCOPES.every((s) => msHasScope(scopes, s));
}

/** drive.readonly (pro's "every Drive file") is in the Google connection's grant. */
export function meetTranscriptsGranted(scopes: readonly string[]): boolean {
  return hasScope(scopes, GOOGLE_SCOPES.driveReadonly);
}

/**
 * Teams: event join link → GET /me/onlineMeetings?$filter=JoinWebUrl eq '…' → /transcripts → the ones started during
 * this occurrence (a recurring meeting keeps one meeting with every date's transcripts) → content as VTT.
 */
export async function teamsTranscript(graph: Pick<GraphClient, "onlineMeetingByJoinUrl" | "meetingTranscripts" | "transcriptVtt">, m: MeetingRef, opts: { scopes: readonly string[]; now: Date }): Promise<TranscriptOutcome> {
  if (m.platform !== "teams" || !m.joinUrl) return { status: "unsupported" };
  if (!teamsTranscriptsGranted(opts.scopes)) return { status: "consent", provider: "microsoft" };
  try {
    const meeting = await graph.onlineMeetingByJoinUrl(m.joinUrl);
    if (!meeting) return { status: "no_access" };
    const from = m.startMs - 30 * 60_000;
    const to = Math.max(m.endMs, opts.now.getTime()) + 60 * 60_000;
    const mine = (await graph.meetingTranscripts(meeting.id))
      .filter((t) => {
        const at = Date.parse(t.createdDateTime);
        return Number.isFinite(at) && at >= from && at <= to;
      })
      .sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
    if (!mine.length) return notYet(m, opts.now);
    const parts: string[] = [];
    for (const t of mine.slice(0, 5)) parts.push(vttToText(await graph.transcriptVtt(meeting.id, t.id)));
    const text = parts.filter(Boolean).join("\n");
    return text.trim() ? { status: "found", text, source: "teams_vtt" } : notYet(m, opts.now);
  } catch (e) {
    if (e instanceof GraphError && !e.retryable && !e.unauthorized) {
      // 403: the grant or the tenant's policy; 404: the meeting / transcript is not this user's to read
      if (e.status === 403 || e.status === 404) return { status: "no_access" };
      if (e.status === 400) return { status: "no_access" };
    }
    throw e;
  }
}

const TRANSCRIPT_NAME = /transcript|תמליל/i;

interface RawDriveHit {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
}

/**
 * Google Meet: the transcript is a Google Doc Meet saves to the organiser's Drive ("<title> (date) - Transcript" /
 * "… - תמליל"; Workspace editions with transcription) and attaches to the organiser's event. First the event's
 * attachments, then a Drive search (drive.readonly) for a transcript Doc changed after the meeting began — the one
 * named after the meeting first. Exported as text/plain.
 * The Meet REST API (conferenceRecords.transcripts) is not used: it needs meetings.space.readonly, a restricted scope
 * (CASA assessment), for meetings the app did not create (docs/google-setup.md).
 */
export async function meetTranscript(google: Pick<GoogleClient, "json" | "exportFile">, m: MeetingRef, opts: { scopes: readonly string[]; now: Date }): Promise<TranscriptOutcome> {
  if (m.platform !== "meet") return { status: "unsupported" };
  if (!meetTranscriptsGranted(opts.scopes)) return { status: "consent", provider: "google" };
  try {
    let fileId = (m.attachments ?? []).find((a) => a.mimeType === GOOGLE_DOC_MIME && TRANSCRIPT_NAME.test(a.title))?.fileId ?? null;
    if (!fileId) {
      const since = new Date(m.startMs - 10 * 60_000).toISOString();
      const q = [`mimeType = ${driveQueryLiteral(GOOGLE_DOC_MIME)}`, "trashed = false", `(name contains 'Transcript' or name contains 'תמליל')`, `modifiedTime > ${driveQueryLiteral(since)}`].join(" and ");
      const u = new URL("https://www.googleapis.com/drive/v3/files");
      u.searchParams.set("q", q);
      u.searchParams.set("pageSize", "20");
      u.searchParams.set("orderBy", "modifiedTime");
      u.searchParams.set("spaces", "drive");
      u.searchParams.set("fields", "files(id,name,mimeType,modifiedTime)");
      const r = await google.json<{ files?: RawDriveHit[] }>("GET", u.toString());
      const title = m.title.trim().toLowerCase();
      const hits = (r.files ?? []).filter((f) => (f.mimeType ?? GOOGLE_DOC_MIME) === GOOGLE_DOC_MIME && TRANSCRIPT_NAME.test(f.name ?? "") && (!f.modifiedTime || Date.parse(f.modifiedTime) >= m.startMs - 10 * 60_000));
      const named = title ? hits.filter((f) => (f.name ?? "").toLowerCase().includes(title)) : [];
      // the Doc named after the meeting; without one, only the single transcript Doc of the meeting's own window
      const inWindow = hits.filter((f) => !f.modifiedTime || Date.parse(f.modifiedTime) <= m.endMs + TRANSCRIPT_GRACE_MS);
      fileId = named[0]?.id ?? (inWindow.length === 1 ? inWindow[0]!.id : null);
    }
    if (!fileId) return notYet(m, opts.now);
    const { bytes } = await google.exportFile(fileId, "text/plain");
    const text = docTranscriptToText(new TextDecoder("utf-8").decode(bytes));
    return text.trim() ? { status: "found", text, source: "meet_doc" } : notYet(m, opts.now);
  } catch (e) {
    if (e instanceof GoogleApiError && !e.retryable && !e.unauthorized) {
      if (e.insufficientScope) return { status: "consent", provider: "google" };
      if (e.notFound || e.status === 403) return { status: "no_access" };
    }
    throw e;
  }
}
