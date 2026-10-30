/**
 * Morning summary (PLAN §11 milestone 5, bot-copy.md §4.5): at the user's `morning_time`, Sunday–Thursday,
 * today's meetings + emails awaiting a reply + today's reminders — free text inside the 24-hour window,
 * the `morning_summary` template outside it. Meetings come from Microsoft 365 and/or Google Calendar (merged);
 * emails awaiting a reply from Microsoft 365 and/or Gmail — Gmail only for connections that granted gmail.readonly
 * (the first users of the unverified app, lib/google/user-cap.ts); merged newest first.
 *
 * Scheduling: one `morning_summary` job per user per local day, dedupe key
 * `morning_summary:<user>:<YYYY-MM-DD>:<HHMM>` — created by SQL `schedule_morning_summaries()` (pg_cron,
 * migration 0005) and by `scheduleMorningSummary()` here (after each run, and when the time changes).
 * The job re-checks everything at run time, so stale jobs (time changed, turned off) are harmless.
 *
 * Pro (entitlements.proactive, checked here on the server) with alerts on (profile.alerts_disabled is not true): the
 * section "דברים שכדאי לא לפספס" (lib/proactive/digest.ts) opens the summary, and inside the window a list of actions
 * follows it ("לנסח תשובה", "להזכיר מחר"…). Outside the window the template carries the section's lines in its two
 * sections and its [לנסח תשובה] quick reply carries the first mail. Basic and the trial get the summary as before.
 */
import type { AiProvider } from "@/lib/ai/types";
import { oneLineUntrusted } from "@/lib/ai/untrusted";
import { entitlements, servicePlan } from "@/lib/billing/plans";
import { pcopy } from "@/lib/copy/bot-proactive";
import { copy } from "@/lib/copy/bot";
import { copyM5, morningClosers } from "@/lib/copy/bot-m5";
import type { Db, JobRow, UserRow } from "@/lib/db/types";
import type { GoogleClient, GoogleEvent } from "@/lib/google/client";
import type { GmailReader } from "@/lib/google/gmail";
import type { GraphClient, GraphEvent } from "@/lib/ms/graph";
import { emailsAwaitingReply, type MailLike, type SentRef } from "./awaiting-reply";
import { DEFAULT_TZ, addDays, clockHe, dateKey, dayLabelHe, localDateOf, parseClock, parseDateKey, weekdayOf, zonedParts, zonedToUtc, type LocalDate } from "@/lib/time/zoned";
import { morningSummaryTemplate } from "@/lib/wa/templates";
import { activePhone, sendProactive, type ProactiveDeps } from "./proactive";
import { modelClassifier, noClassifier } from "@/lib/proactive/classify";
import { DIGEST_LIMITS, buildDigest, type Digest } from "@/lib/proactive/digest";
import { gatherSources } from "@/lib/proactive/sources";
import { msHasScope } from "@/lib/ms/oauth";

/** Sunday–Thursday (onb.morning_time_ack: "בימי א׳–ה׳") */
export const MORNING_DAYS = [0, 1, 2, 3, 4];
const MAX_MEETINGS = 8;
const MAX_EMAILS = 5;

export interface MorningDeps extends ProactiveDeps {
  /** Graph for the user's active Microsoft connection (null when not connected); `scopes`: the grant ("לסמן כחשוד" needs Mail.ReadWrite) */
  graphFor(user: UserRow): Promise<{ graph: GraphClient; accountEmail: string | null; scopes?: string[] } | null>;
  /**
   * Google for the user's active Google connection (null / absent when not connected): the calendar always;
   * `gmail` only when the connection granted gmail.readonly (users past the unverified-app cap have none, so their
   * summary has no "emails awaiting a reply" from Gmail).
   */
  googleFor?(user: UserRow): Promise<{ google: Pick<GoogleClient, "listEvents">; gmail?: Pick<GmailReader, "awaitingReplyInputs"> | null; accountEmail?: string | null } | null>;
  /**
   * The cheap model for the proactive checks' open cases (lib/proactive/classify.ts), already behind the spend guard
   * when one is configured; absent → rules only.
   */
  ai?: AiProvider;
}

/**
 * Proactive alerts for this user: pro (server-side entitlement, and not paused for an unpaid renewal — servicePlan) and
 * not turned off ("בלי התראות" / the toggle in /account).
 */
export async function proactiveAlertsOn(db: Db, user: UserRow, now: Date): Promise<boolean> {
  if (user.profile.alerts_disabled === true || user.profile.proactive_disabled === true || user.deleted_at) return false;
  return entitlements(servicePlan(await db.getSubscription(user.id), now)).proactive;
}

const tzOf = (user: UserRow) => user.timezone || DEFAULT_TZ;

/** "07:30:00" (Postgres time) / "7:30" → "07:30" */
export function normalizeMorningTime(value: string): string | null {
  const c = parseClock(value);
  return c ? `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}` : null;
}

/** Opt-in: only after choosing a time in onboarding or "סיכום בוקר ב-8" ("לא עכשיו" stores false). */
export function morningEnabled(user: UserRow): boolean {
  return user.profile.morning_summary_enabled === true && !user.deleted_at;
}

/** meta.stop_all (proactive_disabled) / meta.pause (proactive_paused_until, ISO). */
export function proactivePaused(user: UserRow, now: Date): boolean {
  if (user.profile.proactive_disabled === true) return true;
  const until = user.profile.proactive_paused_until;
  return typeof until === "string" && Date.parse(until) > now.getTime();
}

export function morningDedupeKey(userId: string, localDate: string, time: string): string {
  return `morning_summary:${userId}:${localDate}:${time.replace(":", "")}`;
}

/** The next Sunday–Thursday occurrence of the user's morning time strictly after `after` (DST-safe). */
export function nextMorningRun(user: UserRow, after: Date, skipDate?: string): { runAt: Date; localDate: string; time: string } | null {
  const time = normalizeMorningTime(user.morning_time);
  if (!time) return null;
  const tz = tzOf(user);
  const clock = parseClock(time)!;
  const start = localDateOf(after, tz);
  for (let i = 0; i < 8; i++) {
    const d = addDays(start, i);
    if (!MORNING_DAYS.includes(weekdayOf(d)) || dateKey(d) === skipDate) continue;
    const runAt = zonedToUtc({ ...d, ...clock }, tz);
    if (runAt.getTime() > after.getTime()) return { runAt, localDate: dateKey(d), time };
  }
  return null;
}

/** Queues the next summary (idempotent by dedupe key). Returns null when off, or already queued. */
export async function scheduleMorningSummary(db: Db, user: UserRow, after: Date): Promise<JobRow | null> {
  if (!morningEnabled(user)) return null;
  const skip = typeof user.profile.morning_summary_last_date === "string" ? user.profile.morning_summary_last_date : undefined;
  const next = nextMorningRun(user, after, skip);
  if (!next) return null;
  return db.createJob({ kind: "morning_summary", user_id: user.id, run_at: next.runAt, payload: { local_date: next.localDate, time: next.time }, dedupe_key: morningDedupeKey(user.id, next.localDate, next.time), max_attempts: 3 });
}

/** After the time changed or the summary was turned on/off: drop queued jobs and queue the next one. */
export async function rescheduleMorningSummary(db: Db, userId: string, now: Date): Promise<JobRow | null> {
  await db.cancelJobs(userId, "morning_summary");
  const user = await db.getUser(userId);
  return user ? scheduleMorningSummary(db, user, now) : null;
}

// ---------------------------------------------------------------------------------------------
// content
// ---------------------------------------------------------------------------------------------

// "Emails awaiting a reply" — one heuristic for Microsoft 365 and Gmail (lib/jobs/awaiting-reply.ts)
export { emailsAwaitingReply };
export type { SentRef };

async function sentSince(graph: GraphClient, since: Date): Promise<SentRef[]> {
  const q = new URLSearchParams({ $top: "50", $select: "conversationId,sentDateTime", $filter: `sentDateTime ge ${since.toISOString()}`, $orderby: "sentDateTime desc" });
  const r = await graph.request<{ value?: { conversationId?: string; sentDateTime?: string }[] }>("GET", `/me/mailFolders/sentitems/messages?${q}`);
  return (r?.value ?? []).map((v) => ({ conversationId: v.conversationId ?? null, sentDateTime: v.sentDateTime ?? "" }));
}

/** One meeting of the day from either calendar; `start` is the local wall-clock date-time ("…T09:00…"). */
interface DayEvent {
  allDay: boolean;
  start: string;
  title: string;
  /** Teams / Meet join link, already checked by safeJoinUrl (lib/online-meeting.ts) */
  joinUrl: string | null;
}
const fromGraph = (e: GraphEvent): DayEvent => ({ allDay: e.isAllDay, start: e.start, title: e.subject, joinUrl: e.joinUrl ?? e.textJoinUrl });
const fromGoogle = (e: GoogleEvent): DayEvent => ({ allDay: e.isAllDay, start: e.start, title: e.summary, joinUrl: e.joinUrl ?? e.textJoinUrl });
/** Google: drop cancelled occurrences and invitations the user declined. */
const googleAttending = (e: GoogleEvent) => e.status !== "cancelled" && !e.attendees.some((a) => a.self && a.response === "declined");
/** All-day first, then by local start time (stable: Microsoft before Google on a tie). */
const byStart = (a: DayEvent, b: DayEvent) => (a.allDay === b.allDay ? (a.allDay ? 0 : a.start.slice(11, 16).localeCompare(b.start.slice(11, 16))) : a.allDay ? -1 : 1);
const meetingLine = (e: DayEvent) => (e.allDay ? `• כל היום — ${e.title || "(ללא כותרת)"}` : `• ${e.start.slice(11, 16)} ${e.title || "(ללא כותרת)"}`);
/**
 * Sender and subject come from outside (any sender, RFC 2047 can encode newlines) and land in the assistant's own
 * message: one sanitized line each, capped — never extra lines that look like a section of the summary.
 */
const emailLine = (m: Pick<MailLike, "from" | "subject">) => {
  const who = oneLineUntrusted(m.from?.name || m.from?.address || "", 60) || "?";
  const subject = oneLineUntrusted(m.subject || "", 120) || "(ללא נושא)";
  return `• ${who} — ${subject}`;
};
const capped = (lines: string[], max: number) => (lines.length > max ? [...lines.slice(0, max), `• ועוד ${lines.length - max}`] : lines);

export interface MorningSummary {
  dayLabel: string;
  /** one line per meeting (the template) */
  meetings: string[];
  /** the join link of each of `meetings` (same index; null = not an online meeting), for the free-text message only */
  meetingLinks?: (string | null)[];
  emails: string[];
  reminders: string[];
  /** pro: "דברים שכדאי לא לפספס" (absent on basic / trial / alerts off) */
  dontMiss?: Digest;
  closer: string;
  /** Graph or Google Calendar was reachable (meetings / emails are real, not just missing) */
  connected: boolean;
  empty: boolean;
}

export function pickCloser(s: Pick<MorningSummary, "meetings" | "emails" | "connected">): string {
  if (s.emails.length) return morningClosers.emails;
  if (s.meetings.length >= 4) return morningClosers.busy;
  if (s.connected && s.meetings.length === 0) return morningClosers.free;
  return morningClosers.default;
}

export async function buildMorningSummary(deps: MorningDeps, user: UserRow, day: LocalDate): Promise<MorningSummary> {
  const tz = tzOf(user);
  const now = deps.now();
  const dayStart = zonedToUtc({ ...day, hour: 0, minute: 0 }, tz);
  const dayEnd = zonedToUtc({ ...addDays(day, 1), hour: 0, minute: 0 }, tz);

  const dayEvents: DayEvent[] = [];
  const awaiting: (MailLike & { id?: string })[] = [];
  let connected = false;
  const g = await deps.graphFor(user).catch(() => null);
  if (g) {
    try {
      dayEvents.push(...(await g.graph.calendarView(dayStart, dayEnd, tz)).map(fromGraph));
      connected = true;
    } catch (e) {
      console.warn(`[morning] calendar failed for ${user.id}:`, (e as Error).message);
    }
    try {
      const since = new Date(now.getTime() - 7 * 86_400_000);
      const inbox = await g.graph.listInbox({ top: 30, since });
      const sent = await sentSince(g.graph, since).catch(() => [] as SentRef[]);
      awaiting.push(...emailsAwaitingReply(inbox, sent, { selfAddress: g.accountEmail, now }));
      connected = true;
    } catch (e) {
      console.warn(`[morning] mail failed for ${user.id}:`, (e as Error).message);
    }
  }
  const google = deps.googleFor ? await deps.googleFor(user).catch(() => null) : null;
  if (google) {
    try {
      dayEvents.push(...(await google.google.listEvents({ timeMin: dayStart, timeMax: dayEnd, timeZone: tz, maxResults: 50 })).filter(googleAttending).map(fromGoogle));
      connected = true;
    } catch (e) {
      // invalid_grant already marked the connection expired (lib/google/token-store.ts); reconnect is prompted in chat
      console.warn(`[morning] google calendar failed for ${user.id}:`, (e as Error).message);
    }
    // Gmail only with gmail.readonly — past the unverified-app user cap there is no `gmail`, so no Gmail section
    if (google.gmail) {
      try {
        const { inbox, sent } = await google.gmail.awaitingReplyInputs({ newerThanDays: 7, maxThreads: 15 });
        awaiting.push(...emailsAwaitingReply(inbox, sent, { selfAddress: google.accountEmail ?? null, now }));
        connected = true;
      } catch (e) {
        console.warn(`[morning] gmail failed for ${user.id}:`, (e as Error).message);
      }
    }
  }
  // pro: the section "דברים שכדאי לא לפספס" — its own reads (headers, 14 days of mail, sent recipients), so the summary
  // of basic and the trial stays exactly as it was
  let dontMiss: Digest | undefined;
  if (await proactiveAlertsOn(deps.db, user, now)) {
    try {
      const sources = await gatherSources(
        g ? { graph: g.graph, accountEmail: g.accountEmail } : null,
        google ? { google: google.google, gmail: google.gmail ?? null, accountEmail: google.accountEmail ?? null } : null,
        { now, mailSince: new Date(now.getTime() - DIGEST_LIMITS.lookbackDays * 86_400_000), sentSince: new Date(now.getTime() - 60 * 86_400_000), eventsFrom: dayStart, eventsTo: dayEnd, tz },
        user.id,
      );
      const canMarkMs = Boolean(g) && msHasScope(g?.scopes ?? [], "Mail.ReadWrite");
      dontMiss = await buildDigest({
        db: deps.db,
        userId: user.id,
        now,
        tz,
        day,
        sources: { ...sources, canMark: (p) => p === "microsoft" && canMarkMs },
        classifier: deps.ai ? modelClassifier(deps.ai, { maxCalls: 3 }) : noClassifier,
      });
      if (!dontMiss.lines.length) dontMiss = undefined;
    } catch (e) {
      console.warn(`[morning] proactive section failed for ${user.id}:`, (e as Error).message);
    }
  }

  const sorted = [...dayEvents].sort(byStart);
  const meetings = capped(sorted.map(meetingLine), MAX_MEETINGS);
  const meetingLinks = sorted.slice(0, MAX_MEETINGS).map((e) => e.joinUrl);
  // both mailboxes, newest first
  const inSection = new Set(dontMiss?.mailIds ?? []);
  const emails = awaiting
    .filter((m) => !m.id || !inSection.has(m.id))
    .sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))
    .slice(0, MAX_EMAILS)
    .map(emailLine);

  const due = await deps.db.listReminders(user.id, { statuses: ["scheduled"], dueFrom: dayStart, dueBefore: dayEnd, limit: 20 });
  const reminders = due.map((r) => {
    const p = zonedParts(new Date(r.due_at), tz);
    return `• ${clockHe(p.hour, p.minute)} ${r.text}`;
  });

  const base = { meetings, emails, reminders, connected };
  return { dayLabel: dayLabelHe(day), ...base, meetingLinks, ...(dontMiss ? { dontMiss } : {}), closer: pickCloser(base), empty: !meetings.length && !emails.length && !reminders.length && !dontMiss };
}

/**
 * The free-text message keeps well under WhatsApp's 4,096 characters (the sender cuts the rest, which would split a
 * link and drop the e-mails and the closer). Join links are long (a Teams link is ~300 characters): they are added
 * under the meetings in order while the whole message stays within this budget; the meetings themselves always stay.
 */
export const MORNING_TEXT_BUDGET = 3_500;

export function renderMorningText(s: MorningSummary): string {
  if (s.empty) return copyM5["act.morning.empty"](s.dayLabel);
  const meetings = [...s.meetings];
  const render = () => copyM5["act.morning.summary"]({ ...s, meetings, dontMiss: s.dontMiss?.lines });
  for (const [i, url] of (s.meetingLinks ?? []).entries()) {
    if (!url || i >= meetings.length) continue;
    const plain = meetings[i]!;
    meetings[i] = `${plain}\n${copy["act.cal.join_link"](url)}`;
    if (render().length > MORNING_TEXT_BUDGET) {
      meetings[i] = plain;
      break;
    }
  }
  return render();
}

/** The list of actions under the summary; a failure is logged, the summary itself already went out. */
async function sendDigestActions(deps: MorningDeps, user: UserRow, digest: Digest): Promise<void> {
  const phone = await activePhone(deps.db, user.id);
  if (!phone) return;
  try {
    const body = pcopy["alert.actions.body"]();
    const r = await deps.wa.sendList(phone, body, pcopy["alert.actions.button"](), [{ rows: digest.rows }]);
    await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "button", text: body, wa_message_id: r.messageId || null });
  } catch (e) {
    console.warn(`[morning] actions list failed for ${user.id}:`, (e as Error).message);
  }
}

// ---------------------------------------------------------------------------------------------
// the job
// ---------------------------------------------------------------------------------------------

export type MorningJobResult = { status: "sent"; mode: "text" | "template"; localDate: string } | { status: "skipped"; reason: string };

/**
 * The `morning_summary` job (payload = { local_date, time }). Idempotent per user per local day
 * (profile.morning_summary_last_date); respects "לא עכשיו" / turned off / paused; queues the next one.
 */
export async function runMorningSummaryJob(deps: MorningDeps, job: Pick<JobRow, "id" | "user_id" | "payload">): Promise<MorningJobResult> {
  if (!job.user_id) return { status: "skipped", reason: "no user" };
  const user = await deps.db.getUser(job.user_id);
  if (!user) return { status: "skipped", reason: "user not found" };
  if (!morningEnabled(user)) return { status: "skipped", reason: "morning summary off" };

  const now = deps.now();
  const tz = tzOf(user);
  const result = await (async (): Promise<MorningJobResult> => {
    const time = normalizeMorningTime(user.morning_time);
    const payloadTime = typeof job.payload.time === "string" ? normalizeMorningTime(job.payload.time) : time;
    if (payloadTime !== time) return { status: "skipped", reason: "morning time changed" };
    const today = localDateOf(now, tz);
    const localDate = typeof job.payload.local_date === "string" ? job.payload.local_date : dateKey(today);
    if (localDate !== dateKey(today)) return { status: "skipped", reason: "stale (another day)" };
    const day = parseDateKey(localDate)!;
    if (!MORNING_DAYS.includes(weekdayOf(day))) return { status: "skipped", reason: "weekend" };
    if (user.profile.morning_summary_last_date === localDate) return { status: "skipped", reason: "already sent today" };
    if (proactivePaused(user, now)) return { status: "skipped", reason: "paused" };
    // a paused account (an unpaid renewal) gets no scheduled service until it pays (the next day stays scheduled)
    if ((await deps.db.getSubscription(user.id))?.status === "past_due") return { status: "skipped", reason: "account paused (past_due)" };

    const summary = await buildMorningSummary(deps, user, day);
    if (!summary.connected && summary.empty) return { status: "skipped", reason: "nothing to report (no connection)" };
    const template = morningSummaryTemplate(
      summary.dontMiss
        ? { ...summary, meetings: [...summary.meetings, ...summary.dontMiss.calendarLines], emails: [...summary.dontMiss.mailLines, ...summary.emails], replyAlertId: summary.dontMiss.replyId }
        : summary,
    );
    const sent = await sendProactive(deps, user, { text: renderMorningText(summary), template });
    if (!sent.sent) return { status: "skipped", reason: sent.reason };
    // pro, inside the window: the section's actions as one list right under the summary (outside it the template's
    // quick reply carries the first mail, and a reply to the summary opens the window for the rest)
    if (sent.mode === "text" && summary.dontMiss?.rows.length) await sendDigestActions(deps, user, summary.dontMiss);
    await deps.db.mergeUserProfile(user.id, { morning_summary_last_date: localDate, morning_summary_last_sent_at: now.toISOString() });
    await deps.db.addAudit({ user_id: user.id, action: "morning_summary.send", target: localDate, result: sent.mode });
    return { status: "sent", mode: sent.mode, localDate };
  })();

  const fresh = (await deps.db.getUser(user.id)) ?? user;
  await scheduleMorningSummary(deps.db, fresh, now);
  return result;
}
