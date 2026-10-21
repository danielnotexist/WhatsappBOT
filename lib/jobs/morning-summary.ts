/**
 * Morning summary (PLAN §11 milestone 5, bot-copy.md §4.5): at the user's `morning_time`, Sunday–Thursday,
 * today's meetings + emails awaiting a reply + today's reminders — free text inside the 24-hour window,
 * the `morning_summary` template outside it.
 *
 * Scheduling: one `morning_summary` job per user per local day, dedupe key
 * `morning_summary:<user>:<YYYY-MM-DD>:<HHMM>` — created by SQL `schedule_morning_summaries()` (pg_cron,
 * migration 0005) and by `scheduleMorningSummary()` here (after each run, and when the time changes).
 * The job re-checks everything at run time, so stale jobs (time changed, turned off) are harmless.
 */
import { copyM5, morningClosers } from "@/lib/copy/bot-m5";
import type { Db, JobRow, UserRow } from "@/lib/db/types";
import type { GraphClient, GraphEvent, GraphMessage } from "@/lib/ms/graph";
import { DEFAULT_TZ, addDays, clockHe, dateKey, dayLabelHe, localDateOf, parseClock, parseDateKey, weekdayOf, zonedParts, zonedToUtc, type LocalDate } from "@/lib/time/zoned";
import { morningSummaryTemplate } from "@/lib/wa/templates";
import { sendProactive, type ProactiveDeps } from "./proactive";

/** Sunday–Thursday (onb.morning_time_ack: "בימי א׳–ה׳") */
export const MORNING_DAYS = [0, 1, 2, 3, 4];
const MAX_MEETINGS = 8;
const MAX_EMAILS = 5;

export interface MorningDeps extends ProactiveDeps {
  /** Graph for the user's active Microsoft connection (null when not connected) */
  graphFor(user: UserRow): Promise<{ graph: GraphClient; accountEmail: string | null } | null>;
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

const AUTOMATED_SENDER = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer-daemon|postmaster|newsletters?|news|marketing|bounces?|billing|invoices?|receipts?|updates?|automated)([._+-]|@)/i;
const BULK_SUBJECT = /newsletter|ניוזלטר|unsubscribe|הסרה מרשימת|webinar|וובינר|מבצע|הנחה של|sale\b/i;
const ASKS = /\?|נשמח|אשמח|אפשר |תוכל|תוכלי|תוכלו|מתי|האם |בבקשה|נא ל|מחכה|ממתין|ממתינה|ממתינים|דחוף|לתשובתך|לתשובתכם|לאשר|אישורך|אישורכם|please|could you|can you|let me know|waiting for/i;

export interface SentRef {
  conversationId: string | null;
  sentDateTime: string;
}

/**
 * "Emails awaiting a reply" heuristic: inbox messages from the last `maxAgeDays` days, from a person
 * (not the user, not no-reply/newsletters), in a conversation the user has not answered since, and either
 * unread or asking something ("?", "נשמח", "מתי", "please"…). Newest first, one per conversation.
 */
export function emailsAwaitingReply(inbox: GraphMessage[], sent: SentRef[], opts: { selfAddress: string | null; now: Date; maxAgeDays?: number; limit?: number }): GraphMessage[] {
  const self = opts.selfAddress?.toLowerCase() ?? null;
  const oldest = opts.now.getTime() - (opts.maxAgeDays ?? 7) * 86_400_000;
  const lastSent = new Map<string, number>();
  for (const s of sent) {
    if (!s.conversationId) continue;
    lastSent.set(s.conversationId, Math.max(lastSent.get(s.conversationId) ?? 0, Date.parse(s.sentDateTime) || 0));
  }
  const seen = new Set<string>();
  return [...inbox]
    .sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))
    .filter((m) => {
      const received = Date.parse(m.receivedDateTime);
      if (!Number.isFinite(received) || received < oldest || received > opts.now.getTime()) return false;
      const from = m.from?.address.toLowerCase() ?? "";
      if (!from || from === self || AUTOMATED_SENDER.test(from) || BULK_SUBJECT.test(m.subject)) return false;
      if (m.conversationId && (lastSent.get(m.conversationId) ?? 0) > received) return false;
      if (m.conversationId) {
        if (seen.has(m.conversationId)) return false;
        seen.add(m.conversationId);
      }
      return !m.isRead || ASKS.test(`${m.subject} ${m.bodyPreview}`);
    })
    .slice(0, opts.limit ?? MAX_EMAILS);
}

async function sentSince(graph: GraphClient, since: Date): Promise<SentRef[]> {
  const q = new URLSearchParams({ $top: "50", $select: "conversationId,sentDateTime", $filter: `sentDateTime ge ${since.toISOString()}`, $orderby: "sentDateTime desc" });
  const r = await graph.request<{ value?: { conversationId?: string; sentDateTime?: string }[] }>("GET", `/me/mailFolders/sentitems/messages?${q}`);
  return (r?.value ?? []).map((v) => ({ conversationId: v.conversationId ?? null, sentDateTime: v.sentDateTime ?? "" }));
}

const meetingLine = (e: GraphEvent) => (e.isAllDay ? `• כל היום — ${e.subject || "(ללא כותרת)"}` : `• ${e.start.slice(11, 16)} ${e.subject || "(ללא כותרת)"}`);
const emailLine = (m: GraphMessage) => `• ${m.from?.name || m.from?.address || "?"} — ${m.subject || "(ללא נושא)"}`;
const capped = (lines: string[], max: number) => (lines.length > max ? [...lines.slice(0, max), `• ועוד ${lines.length - max}`] : lines);

export interface MorningSummary {
  dayLabel: string;
  meetings: string[];
  emails: string[];
  reminders: string[];
  closer: string;
  /** Graph was reachable (meetings / emails are real, not just missing) */
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

  let meetings: string[] = [];
  let emails: string[] = [];
  let connected = false;
  const g = await deps.graphFor(user).catch(() => null);
  if (g) {
    try {
      const events = await g.graph.calendarView(dayStart, dayEnd, tz);
      meetings = capped(events.map(meetingLine), MAX_MEETINGS);
      connected = true;
    } catch (e) {
      console.warn(`[morning] calendar failed for ${user.id}:`, (e as Error).message);
    }
    try {
      const since = new Date(now.getTime() - 7 * 86_400_000);
      const inbox = await g.graph.listInbox({ top: 30, since });
      const sent = await sentSince(g.graph, since).catch(() => [] as SentRef[]);
      emails = emailsAwaitingReply(inbox, sent, { selfAddress: g.accountEmail, now }).map(emailLine);
      connected = true;
    } catch (e) {
      console.warn(`[morning] mail failed for ${user.id}:`, (e as Error).message);
    }
  }

  const due = await deps.db.listReminders(user.id, { statuses: ["scheduled"], dueFrom: dayStart, dueBefore: dayEnd, limit: 20 });
  const reminders = due.map((r) => {
    const p = zonedParts(new Date(r.due_at), tz);
    return `• ${clockHe(p.hour, p.minute)} ${r.text}`;
  });

  const base = { meetings, emails, reminders, connected };
  return { dayLabel: dayLabelHe(day), ...base, closer: pickCloser(base), empty: !meetings.length && !emails.length && !reminders.length };
}

export function renderMorningText(s: MorningSummary): string {
  return s.empty ? copyM5["act.morning.empty"](s.dayLabel) : copyM5["act.morning.summary"](s);
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

    const summary = await buildMorningSummary(deps, user, day);
    if (!summary.connected && summary.empty) return { status: "skipped", reason: "nothing to report (no connection)" };
    const sent = await sendProactive(deps, user, { text: renderMorningText(summary), template: morningSummaryTemplate(summary) });
    if (!sent.sent) return { status: "skipped", reason: sent.reason };
    await deps.db.mergeUserProfile(user.id, { morning_summary_last_date: localDate, morning_summary_last_sent_at: now.toISOString() });
    await deps.db.addAudit({ user_id: user.id, action: "morning_summary.send", target: localDate, result: sent.mode });
    return { status: "sent", mode: sent.mode, localDate };
  })();

  const fresh = (await deps.db.getUser(user.id)) ?? user;
  await scheduleMorningSummary(deps.db, fresh, now);
  return result;
}
