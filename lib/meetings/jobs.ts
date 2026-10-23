import { BudgetExceededError } from "@/lib/ai/budget";
import { effectivePlan, entitlements } from "@/lib/billing/plans";
import { copy } from "@/lib/copy/bot";
import { mcopy } from "@/lib/copy/bot-meetings";
import type { Db, JobRow, UserRow } from "@/lib/db/types";
import { GoogleApiError } from "@/lib/google/client";
import { driveReadStatus, googleConsentLink } from "@/lib/google/consent";
import { proactivePaused } from "@/lib/jobs/morning-summary";
import { activePhone } from "@/lib/jobs/proactive";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { GraphError } from "@/lib/ms/graph";
import { alertHoursOpen, nextScanAt } from "@/lib/proactive/alerts";
import { DEFAULT_TZ, zonedParts } from "@/lib/time/zoned";
import { deliverSummary, meetingWhen } from "./deliver";
import { meetTranscript, meetTranscriptsGranted, teamsTranscript, teamsTranscriptsGranted, type TranscriptOutcome } from "./find";
import { isOnlineMeeting, meetingFromGoogle, meetingFromGraph, meetingKey, platformName, type MeetingProvider, type MeetingRef } from "./meeting";
import { summarizeMeeting, type MeetingSummaryContent } from "./summarize";
import type { MeetingDeps, MeetingWorkspace } from "./workspace";

/**
 * Meeting summaries (pro; entitlements.meetingSummaries, checked here on the server) — the two jobs:
 *
 *   meeting_plan     one user, every round hour 07:00–22:59 local (pg_cron schedule_meeting_plans(), migration 0014;
 *                    each run also queues the next one, for the dev loop and DATA_MODE=memory). Reads both calendars
 *                    for meetings that end between 3 hours ago and 2 hours ahead, and queues one `meeting_summary` for
 *                    each online meeting it can read: a Teams meeting on the Microsoft 365 calendar with the transcript
 *                    pair granted, a Meet on Google Calendar with drive.readonly granted. Run at the end + 10 minutes;
 *                    dedupe key meeting_summary:<user>:<provider>:<event>:<end> (a moved meeting gets a new job).
 *   meeting_summary  one meeting: the fresh event → the platform's transcript (lib/meetings/find.ts) → one summary call
 *                    (lib/meetings/summarize.ts, behind the spend guard) → stored (meeting_summaries, the summary only)
 *                    → sent: text + buttons inside the 24-hour window, the `meeting_summary_ready` template outside it.
 *                    Transcript not ready yet → again after 15, 30 and 60 minutes, then it gives up quietly.
 *
 * Automatic summaries respect the quiet hours of the proactive messages (08:00–20:00, not on Shabbat or a holiday —
 * lib/proactive/alerts.ts alertHoursOpen): a meeting that ends at 19:55 is summarised the next morning. They stop with
 * "בלי סיכומי פגישות" (profile.meeting_summaries_disabled) or "הפסקת הודעות יזומות" (proactive_disabled / paused), and
 * never explain a failure (most meetings are not transcribed). A summary the user asked for in the chat (`on_demand`)
 * skips the quiet hours and always says why there is none. Nothing reaches anyone but the user without an approval.
 */

export const SUMMARY_DELAY_MS = 10 * 60_000;
export const RETRY_DELAYS_MIN = [15, 30, 60] as const;
const PLAN_BACK_MS = 3 * 3_600_000;
const PLAN_AHEAD_MS = 2 * 3_600_000;
export const PLAN_FIRST_HOUR = 7;
export const PLAN_LAST_HOUR = 22;

const tzOf = (user: UserRow) => user.timezone || DEFAULT_TZ;
const pad = (n: number) => String(n).padStart(2, "0");

/** Pro (server-side) — the on-demand summary and the buttons. */
export async function meetingSummariesIncluded(db: Db, user: UserRow, now: Date): Promise<boolean> {
  if (user.deleted_at) return false;
  return entitlements(effectivePlan(await db.getSubscription(user.id), now)).meetingSummaries;
}

/** The automatic summaries: pro, and not turned off ("בלי סיכומי פגישות", or every proactive message). */
export async function meetingSummariesOn(db: Db, user: UserRow, now: Date): Promise<boolean> {
  if (user.profile.meeting_summaries_disabled === true || user.profile.proactive_disabled === true) return false;
  return meetingSummariesIncluded(db, user, now);
}

/** meeting_plan:<user>:<YYYY-MM-DD>T<HH> (the local hour) — the same key SQL schedule_meeting_plans() writes. */
export function planDedupeKey(userId: string, at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  return `meeting_plan:${userId}:${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}`;
}

/** The next round hour after `after` whose local hour is 07–22. */
export function nextPlanAt(after: Date, tz: string = DEFAULT_TZ): Date {
  let t = Math.floor(after.getTime() / 3_600_000) * 3_600_000 + 3_600_000;
  for (let i = 0; i < 24; i++, t += 3_600_000) {
    const h = zonedParts(new Date(t), tz).hour;
    if (h >= PLAN_FIRST_HOUR && h <= PLAN_LAST_HOUR) return new Date(t);
  }
  return new Date(t);
}

/** Queues the next plan for a pro user with the summaries on (idempotent by dedupe key). */
export async function scheduleMeetingPlan(db: Db, user: UserRow, after: Date): Promise<JobRow | null> {
  if (!(await meetingSummariesOn(db, user, after))) return null;
  const tz = tzOf(user);
  const at = nextPlanAt(after, tz);
  const p = zonedParts(at, tz);
  return db.createJob({ kind: "meeting_plan", user_id: user.id, run_at: at, payload: { slot: `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}` }, dedupe_key: planDedupeKey(user.id, at, tz), max_attempts: 2 });
}

/** A meeting is read through its own platform's account: Teams on Microsoft 365, Meet on Google. */
export function readableHere(m: MeetingRef): boolean {
  return (m.platform === "teams" && m.provider === "microsoft") || (m.platform === "meet" && m.provider === "google");
}

export interface CalendarMeetings {
  meetings: MeetingRef[];
  /** the grants, to know which meetings can be read */
  msScopes: string[] | null;
  googleScopes: string[] | null;
}

/**
 * The online meetings of both calendars that overlap [from, to] (cancelled and declined ones left out), newest end
 * first. A calendar that fails is logged and left out.
 */
export async function listOnlineMeetings(ws: MeetingWorkspace, user: UserRow, from: Date, to: Date): Promise<CalendarMeetings> {
  const tz = tzOf(user);
  const out: MeetingRef[] = [];
  let msScopes: string[] | null = null;
  let googleScopes: string[] | null = null;
  const ms = await ws.microsoft(user).catch(() => null);
  if (ms) {
    msScopes = ms.scopes;
    try {
      out.push(...(await ms.graph.calendarView(from, to, tz)).filter((e) => !e.isAllDay).map((e) => meetingFromGraph(e, tz, [ms.accountEmail ?? "", user.email])));
    } catch (e) {
      console.warn(`[meetings] Microsoft calendar failed for ${user.id}:`, (e as Error).message);
    }
  }
  const g = await ws.google(user).catch(() => null);
  if (g) {
    googleScopes = g.scopes;
    try {
      const events = await g.google.listEvents({ timeMin: from, timeMax: to, timeZone: tz, maxResults: 100 });
      out.push(...events.filter((e) => !e.isAllDay && e.status !== "cancelled" && !e.attendees.some((a) => a.self && a.response === "declined")).map((e) => meetingFromGoogle(e, [g.accountEmail ?? "", user.email])));
    } catch (e) {
      console.warn(`[meetings] Google calendar failed for ${user.id}:`, (e as Error).message);
    }
  }
  return { meetings: out.filter(isOnlineMeeting).sort((a, b) => b.endMs - a.endMs), msScopes, googleScopes };
}

/** The grant lets the job read this meeting's transcript. */
function granted(m: MeetingRef, c: Pick<CalendarMeetings, "msScopes" | "googleScopes">): boolean {
  if (m.platform === "teams") return teamsTranscriptsGranted(c.msScopes ?? []);
  if (m.platform === "meet") return meetTranscriptsGranted(c.googleScopes ?? []);
  return false;
}

export function summaryDedupeKey(userId: string, m: Pick<MeetingRef, "provider" | "eventId" | "endMs">): string {
  return `meeting_summary:${userId}:${meetingKey(m)}`;
}

export interface SummaryJobPayload {
  provider: MeetingProvider;
  event_id: string;
  /** the end the job was planned for (ISO) */
  end: string;
  title?: string;
  /** retries so far (transcript not ready) */
  attempt?: number;
  /** asked for in the chat */
  on_demand?: boolean;
}

/** Queues the summary of one meeting at its end + 10 minutes (now at the earliest). */
export async function queueMeetingSummary(db: Db, user: UserRow, m: MeetingRef, now: Date, opts: { onDemand?: boolean } = {}): Promise<JobRow | null> {
  const runAt = new Date(Math.max(now.getTime(), m.endMs + SUMMARY_DELAY_MS));
  const payload: SummaryJobPayload = { provider: m.provider, event_id: m.eventId, end: new Date(m.endMs).toISOString(), title: m.title.slice(0, 200), attempt: 0, ...(opts.onDemand ? { on_demand: true } : {}) };
  // a request in the chat gets its own job (minute bucket): the automatic one may have given up already
  const key = opts.onDemand ? `${summaryDedupeKey(user.id, m)}:ask:${Math.floor(now.getTime() / 60_000)}` : summaryDedupeKey(user.id, m);
  return db.createJob({ kind: "meeting_summary", user_id: user.id, run_at: runAt, payload: payload as unknown as Record<string, unknown>, dedupe_key: key, max_attempts: 2 });
}

export type PlanResult = { status: "done"; queued: number; meetings: number } | { status: "skipped"; reason: string };

/** The `meeting_plan` job. */
export async function runMeetingPlanJob(deps: MeetingDeps, job: Pick<JobRow, "id" | "user_id" | "payload">): Promise<PlanResult> {
  if (!job.user_id) return { status: "skipped", reason: "no user" };
  const user = await deps.db.getUser(job.user_id);
  if (!user) return { status: "skipped", reason: "user not found" };
  const now = deps.now();
  const result = await (async (): Promise<PlanResult> => {
    if (!(await meetingSummariesOn(deps.db, user, now))) return { status: "skipped", reason: "summaries off or not pro" };
    if (proactivePaused(user, now)) return { status: "skipped", reason: "paused" };
    const found = await listOnlineMeetings(deps.workspace, user, new Date(now.getTime() - PLAN_BACK_MS), new Date(now.getTime() + PLAN_AHEAD_MS));
    let queued = 0;
    const candidates = found.meetings.filter((m) => m.endMs >= now.getTime() - PLAN_BACK_MS && m.endMs <= now.getTime() + PLAN_AHEAD_MS && readableHere(m) && granted(m, found));
    for (const m of candidates) if (await queueMeetingSummary(deps.db, user, m, now)) queued++;
    return { status: "done", queued, meetings: candidates.length };
  })();
  const fresh = (await deps.db.getUser(user.id)) ?? user;
  await scheduleMeetingPlan(deps.db, fresh, now).catch(() => null);
  return result;
}

// ---------------------------------------------------------------------------------------------
// one meeting
// ---------------------------------------------------------------------------------------------

export type SummaryJobResult =
  | { status: "sent"; mode: "text" | "template"; summaryId: string }
  | { status: "retry"; at: string; attempt: number }
  | { status: "deferred"; at: string }
  | { status: "skipped"; reason: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

function parsePayload(p: Record<string, unknown>): SummaryJobPayload | null {
  const provider = p.provider === "microsoft" || p.provider === "google" ? p.provider : null;
  if (!provider || !str(p.event_id)) return null;
  return { provider, event_id: str(p.event_id), end: str(p.end), title: str(p.title), attempt: typeof p.attempt === "number" ? p.attempt : 0, on_demand: p.on_demand === true };
}

type Fresh = { meeting: MeetingRef; read: (now: Date) => Promise<TranscriptOutcome> };

/**
 * The event as it is now, from its own calendar, and how to read its transcript there. Null when it is gone (deleted,
 * cancelled) or the account is no longer connected.
 */
async function freshMeeting(ws: MeetingWorkspace, user: UserRow, p: SummaryJobPayload): Promise<Fresh | null> {
  const tz = tzOf(user);
  try {
    if (p.provider === "microsoft") {
      const ms = await ws.microsoft(user);
      if (!ms) return null;
      const meeting = meetingFromGraph(await ms.graph.getEvent(p.event_id, tz), tz, [ms.accountEmail ?? "", user.email]);
      return { meeting, read: async (now) => (readableHere(meeting) ? teamsTranscript(ms.graph, meeting, { scopes: ms.scopes, now }) : { status: "unsupported" }) };
    }
    const g = await ws.google(user);
    if (!g) return null;
    const e = await g.google.getEvent(p.event_id, tz);
    if (e.status === "cancelled") return null;
    const meeting = meetingFromGoogle(e, [g.accountEmail ?? "", user.email]);
    return { meeting, read: async (now) => (readableHere(meeting) ? meetTranscript(g.google, meeting, { scopes: g.scopes, now }) : { status: "unsupported" }) };
  } catch (e) {
    if ((e instanceof GraphError && (e.status === 404 || e.status === 410)) || (e instanceof GoogleApiError && e.notFound)) return null;
    throw e;
  }
}

async function say(deps: MeetingDeps, user: UserRow, phone: string, text: string): Promise<void> {
  const r = await deps.wa.sendText(phone, text);
  await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text, wa_message_id: r.messageId || null });
}

/** Why there is no summary, in the chat (on request only). */
async function explain(deps: MeetingDeps, user: UserRow, phone: string, m: MeetingRef, outcome: TranscriptOutcome): Promise<void> {
  const title = m.title || "(ללא כותרת)";
  const now = deps.now();
  switch (outcome.status) {
    case "none":
    case "not_ready":
      return say(deps, user, phone, mcopy["mt.no_transcript"](title, platformName(m.platform)));
    case "no_access":
      return say(deps, user, phone, mcopy["mt.no_access"](title));
    case "unsupported":
      return say(deps, user, phone, m.platform === "zoom" ? mcopy["mt.zoom_soon"]() : mcopy["mt.other_platform"]());
    case "consent": {
      if (outcome.provider === "microsoft") {
        if (user.profile.ms_meetings_consent === "admin_required") {
          const adminLink = new URL("/api/auth/microsoft/start?admin=1", deps.appUrl).toString();
          return say(deps, user, phone, mcopy["mt.consent.teams_admin"](adminLink));
        }
        const link = new URL(`/api/auth/microsoft/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft", { now }))}`, deps.appUrl).toString();
        return say(deps, user, phone, mcopy["mt.consent.teams"](link));
      }
      const g = await deps.workspace.google(user).catch(() => null);
      const status = await driveReadStatus(deps.db, { accountEmail: g?.accountEmail ?? null, consentLink: () => googleConsentLink({ appUrl: deps.appUrl, now: () => now }, user.id, "drive_read") });
      return say(deps, user, phone, `${mcopy["mt.consent.meet"]()}\n${String(status.say ?? "")}`.trim());
    }
    case "found":
      return;
  }
}

/** The same job again later (a new row: the transcript may still come, or the quiet hours end). */
async function requeue(db: Db, user: UserRow, p: SummaryJobPayload, at: Date, suffix: string): Promise<void> {
  const key = `meeting_summary:${user.id}:${p.provider}:${p.event_id}:${p.end}:${suffix}`;
  await db.createJob({ kind: "meeting_summary", user_id: user.id, run_at: at, payload: p as unknown as Record<string, unknown>, dedupe_key: key, max_attempts: 2 });
}

/** The `meeting_summary` job (payload: SummaryJobPayload). Throws only on transient errors (the job is retried once). */
export async function runMeetingSummaryJob(deps: MeetingDeps, job: Pick<JobRow, "id" | "user_id" | "payload">): Promise<SummaryJobResult> {
  if (!job.user_id) return { status: "skipped", reason: "no user" };
  const p = parsePayload(job.payload);
  if (!p) return { status: "skipped", reason: "bad payload" };
  const user = await deps.db.getUser(job.user_id);
  if (!user) return { status: "skipped", reason: "user not found" };
  const now = deps.now();
  const tz = tzOf(user);
  const onDemand = p.on_demand === true;
  if (!(await meetingSummariesIncluded(deps.db, user, now))) return { status: "skipped", reason: "not pro" };
  if (!onDemand && !(await meetingSummariesOn(deps.db, user, now))) return { status: "skipped", reason: "summaries off" };
  if (!onDemand && proactivePaused(user, now)) return { status: "skipped", reason: "paused" };
  const phone = await activePhone(deps.db, user.id);
  if (!phone) return { status: "skipped", reason: "no phone" };

  const fresh = await freshMeeting(deps.workspace, user, p);
  if (!fresh) {
    if (onDemand) await say(deps, user, phone, mcopy["mt.not_found"](p.title ?? ""));
    return { status: "skipped", reason: "event gone" };
  }
  const m = fresh.meeting;
  // moved: the plan queues the new time under its own key
  if (!onDemand && p.end && Math.abs(Date.parse(p.end) - m.endMs) > 60_000) return { status: "skipped", reason: "meeting moved" };

  const existing = await deps.db.findMeetingSummary(user.id, meetingKey(m));
  if (existing) {
    if (!onDemand) return { status: "skipped", reason: "already summarised" };
    return { status: "sent", mode: await deliverSummary(deps, user, phone, existing), summaryId: existing.id };
  }

  if (!onDemand && !alertHoursOpen(now, tz)) {
    const at = nextScanAt(now, tz);
    if (!at) return { status: "skipped", reason: "quiet hours" };
    await requeue(deps.db, user, p, at, `quiet:${at.toISOString()}`);
    return { status: "deferred", at: at.toISOString() };
  }

  const outcome = await fresh.read(now);
  const attempt = p.attempt ?? 0;
  if (outcome.status === "not_ready" && attempt < RETRY_DELAYS_MIN.length) {
    const at = new Date(now.getTime() + RETRY_DELAYS_MIN[attempt]! * 60_000);
    await requeue(deps.db, user, { ...p, attempt: attempt + 1 }, at, `r${attempt + 1}`);
    if (onDemand && attempt === 0) await say(deps, user, phone, mcopy["mt.not_ready"](m.title || "(ללא כותרת)"));
    return { status: "retry", at: at.toISOString(), attempt: attempt + 1 };
  }
  if (outcome.status !== "found") {
    await deps.db.addAudit({ user_id: user.id, action: "meeting.summary", target: m.platform, result: outcome.status });
    if (onDemand) await explain(deps, user, phone, m, outcome);
    return { status: "skipped", reason: `transcript: ${outcome.status}` };
  }

  let content: MeetingSummaryContent;
  try {
    content = await summarizeMeeting(deps.ai, m, outcome.text, { tz });
  } catch (e) {
    console.warn(`[meetings] summary failed for ${user.id}:`, (e as Error).message);
    await deps.db.addAudit({ user_id: user.id, action: "meeting.summary", target: m.platform, result: e instanceof BudgetExceededError ? `budget:${e.reason}` : "model_failed" });
    if (onDemand) await say(deps, user, phone, e instanceof BudgetExceededError ? copy["err.model"]() : mcopy["mt.failed"]());
    return { status: "skipped", reason: "summary failed" };
  }
  const row = await deps.db.saveMeetingSummary({
    user_id: user.id,
    provider: m.provider,
    event_key: meetingKey(m),
    event_id: m.eventId,
    title: m.title.slice(0, 300),
    meeting_start: new Date(m.startMs).toISOString(),
    meeting_end: new Date(m.endMs).toISOString(),
    attendees: m.attendees.slice(0, 50),
    content: content as unknown as Record<string, unknown>,
  });
  const mode = await deliverSummary(deps, user, phone, row);
  await deps.db.addAudit({ user_id: user.id, action: "meeting.summary", target: m.platform, result: `sent_${mode}` });
  return { status: "sent", mode, summaryId: row.id };
}

/** When the meeting began, for the chat ("יום ה׳ 22.10, 10:00"). */
export const meetingWhenOf = (m: Pick<MeetingRef, "startMs">, tz: string) => meetingWhen(new Date(m.startMs).toISOString(), tz);
