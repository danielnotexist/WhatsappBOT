import { copyM5, reminderButtons, type ReminderLine } from "@/lib/copy/bot-m5";
import type { Db, JobRow, ReminderRow, UserRow } from "@/lib/db/types";
import { sendProactive, type ProactiveDeps } from "@/lib/jobs/proactive";
import { DEFAULT_TZ, formatStampHe, formatWhenAbs } from "@/lib/time/zoned";
import { reminderTemplate } from "@/lib/wa/templates";
import { parseHebrewWhen } from "./parse";
import { describeRecurrence, isRecurrenceRule, nextOccurrence } from "./recurrence";

/** Per-user cap on open reminders (abuse / runaway loops). */
export const MAX_OPEN_REMINDERS = 100;
const MAX_TEXT = 300;

const tzOf = (user: UserRow) => user.timezone || DEFAULT_TZ;

/** "כל יום, 8:00" for recurring reminders, otherwise the absolute next time ("מחר, 9:00"). */
export function reminderWhenLabel(r: ReminderRow, now: Date, tz: string): string {
  return isRecurrenceRule(r.recurrence) ? describeRecurrence(r.recurrence) : formatWhenAbs(new Date(r.due_at), now, tz);
}

/**
 * Queues the job that fires the reminder at its due_at (dedupe: one job per reminder occurrence; `dedupe: false`
 * re-arms after an early delivery, when the occurrence's key belongs to the job being finished).
 */
export async function scheduleReminderJob(db: Db, reminder: ReminderRow, opts: { dedupe?: boolean } = {}): Promise<ReminderRow> {
  const dedupeKey = opts.dedupe === false ? null : `reminder:${reminder.id}:${Date.parse(reminder.due_at)}`;
  const job = await db.createJob({ kind: "reminder", user_id: reminder.user_id, run_at: new Date(reminder.due_at), payload: { reminder_id: reminder.id, due_at: reminder.due_at }, dedupe_key: dedupeKey, max_attempts: 5 });
  if (!job) return reminder;
  return (await db.updateReminder(reminder.id, { job_id: job.id })) ?? reminder;
}

export type CreateReminderResult =
  | { status: "created"; reminder: ReminderRow; whenAbs: string; recurring: string | null; reply: string }
  | { status: "need_time"; reply: string }
  | { status: "past"; whenAbs: string; reply: string }
  | { status: "error"; error: "empty_text" | "limit"; reply: string };

/**
 * Creates a reminder from the user's own time phrase (`when`, e.g. "מחר ב-9") — the time math is done by
 * the deterministic parser, never by the model — and replies with the absolute time echo.
 */
export async function createReminder(db: Db, user: UserRow, input: { text: string; when: string }, now: Date): Promise<CreateReminderResult> {
  const tz = tzOf(user);
  const when = input.when.trim();
  // no separate time phrase: look for it inside the text, and keep only the rest as the reminder
  const parsed = parseHebrewWhen(when || input.text, { now, timeZone: tz });
  const text = ((when ? input.text.trim() : parsed?.rest || input.text.trim()) || parsed?.rest || "").replace(/\s+/g, " ").slice(0, MAX_TEXT);
  if (!parsed) return { status: "need_time", reply: copyM5["act.reminder.set_ambiguous_time"](text || input.when.trim()) };
  if (!text) return { status: "error", error: "empty_text", reply: "מה להזכיר?" };
  if ((await db.listReminders(user.id, { statuses: ["scheduled"], limit: MAX_OPEN_REMINDERS })).length >= MAX_OPEN_REMINDERS) {
    return { status: "error", error: "limit", reply: copyM5["act.reminder.limit"]() };
  }

  if (parsed.kind === "once") {
    const whenAbs = formatWhenAbs(parsed.at, now, tz);
    if (parsed.inPast) return { status: "past", whenAbs, reply: copyM5["act.reminder.past_time"](whenAbs) };
    const reminder = await scheduleReminderJob(db, await db.createReminder({ user_id: user.id, text, due_at: parsed.at }));
    await db.addAudit({ user_id: user.id, action: "reminder.create", target: reminder.id, result: "ok" });
    return { status: "created", reminder, whenAbs, recurring: null, reply: copyM5["act.reminder.set"](whenAbs, text) };
  }

  const whenAbs = formatWhenAbs(parsed.first, now, tz);
  const label = describeRecurrence(parsed.rule);
  const reminder = await scheduleReminderJob(db, await db.createReminder({ user_id: user.id, text, due_at: parsed.first, recurrence: parsed.rule }));
  await db.addAudit({ user_id: user.id, action: "reminder.create", target: reminder.id, result: "ok" });
  return { status: "created", reminder, whenAbs, recurring: label, reply: copyM5["act.reminder.set_recurring"](label, whenAbs, text) };
}

export async function listOpenReminders(db: Db, user: UserRow, now: Date): Promise<{ reminders: (ReminderRow & { when: string })[]; reply: string }> {
  const tz = tzOf(user);
  const rows = await db.listReminders(user.id, { statuses: ["scheduled"], limit: 20 });
  const reminders = rows.map((r) => ({ ...r, when: reminderWhenLabel(r, now, tz) }));
  const lines: ReminderLine[] = reminders.map((r) => ({ whenAbs: r.when, text: r.text }));
  return { reminders, reply: lines.length ? copyM5["act.reminder.list"](lines) : copyM5["act.reminder.none"]() };
}

export type CancelResult =
  | { status: "cancelled"; reminder: ReminderRow; reply: string }
  | { status: "ambiguous"; candidates: { id: string; text: string; when: string }[]; reply: string }
  | { status: "not_found"; reply: string };

/** Cancels by id, or by a text match when exactly one open reminder matches. */
export async function cancelReminder(db: Db, user: UserRow, input: { id?: string; query?: string }, now: Date): Promise<CancelResult> {
  const tz = tzOf(user);
  const open = await db.listReminders(user.id, { statuses: ["scheduled"], limit: MAX_OPEN_REMINDERS });
  let matches: ReminderRow[] = [];
  if (input.id) matches = open.filter((r) => r.id === input.id);
  else if (input.query?.trim()) {
    const words = input.query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    matches = open.filter((r) => words.every((w) => r.text.toLowerCase().includes(w)));
    if (!matches.length) matches = open.filter((r) => words.some((w) => r.text.toLowerCase().includes(w)));
  }
  if (!matches.length) return { status: "not_found", reply: copyM5["act.reminder.not_found"]() };
  if (matches.length > 1) {
    const candidates = matches.slice(0, 5).map((r) => ({ id: r.id, text: r.text, when: reminderWhenLabel(r, now, tz) }));
    return { status: "ambiguous", candidates, reply: copyM5["act.reminder.which"](candidates.map((c) => ({ whenAbs: c.when, text: c.text }))) };
  }
  const r = matches[0]!;
  const updated = (await db.updateReminder(r.id, { status: "cancelled" })) ?? r;
  if (r.job_id) await db.cancelJob(r.job_id);
  await db.addAudit({ user_id: user.id, action: "reminder.cancel", target: r.id, result: "cancelled" });
  return { status: "cancelled", reminder: updated, reply: copyM5["act.reminder.cancelled"](r.text) };
}

/**
 * "דחה לשעה" / "דחה למחר" (or the template's "עוד שעה" / "מחר בבוקר"). A one-off reminder moves;
 * a recurring one keeps its rule and gets a separate one-off copy.
 */
export async function snoozeReminder(db: Db, user: UserRow, reminderId: string, mode: "hour" | "tomorrow", now: Date): Promise<string | null> {
  const r = await db.getReminder(reminderId);
  if (!r || r.user_id !== user.id || r.status === "cancelled") return null;
  const tz = tzOf(user);
  const parsed = mode === "hour" ? null : parseHebrewWhen("מחר בבוקר", { now, timeZone: tz });
  const due = mode === "hour" ? new Date(now.getTime() + 3_600_000) : parsed?.kind === "once" ? parsed.at : new Date(now.getTime() + 86_400_000);
  if (isRecurrenceRule(r.recurrence)) {
    await scheduleReminderJob(db, await db.createReminder({ user_id: user.id, text: r.text, due_at: due }));
  } else {
    if (r.job_id) await db.cancelJob(r.job_id);
    const moved = await db.updateReminder(r.id, { status: "scheduled", due_at: due.toISOString(), job_id: null });
    if (moved) await scheduleReminderJob(db, moved);
  }
  await db.addAudit({ user_id: user.id, action: "reminder.snooze", target: r.id, result: mode });
  return copyM5["act.reminder.snoozed"](formatWhenAbs(due, now, tz));
}

export async function markReminderDone(db: Db, user: UserRow, reminderId: string): Promise<string | null> {
  const r = await db.getReminder(reminderId);
  if (!r || r.user_id !== user.id) return null;
  // a recurring reminder stays scheduled for its next occurrence — "טופל" acknowledges this one
  if (!isRecurrenceRule(r.recurrence) && r.status !== "cancelled") await db.updateReminder(r.id, { status: "done" });
  await db.addAudit({ user_id: user.id, action: "reminder.done", target: r.id, result: "ok" });
  return copyM5["act.reminder.done"]();
}

export type ReminderJobResult = { status: "sent"; mode: "text" | "template"; next: string | null } | { status: "skipped"; reason: string };

/**
 * The `reminder` job (jobs.payload = { reminder_id, due_at }). Idempotent: skips cancelled / done /
 * rescheduled reminders and occurrences already sent. Recurring reminders schedule their next occurrence.
 */
export async function runReminderJob(deps: ProactiveDeps, job: Pick<JobRow, "id" | "user_id" | "payload">): Promise<ReminderJobResult> {
  const now = deps.now();
  const r = await deps.db.getReminder(String(job.payload.reminder_id ?? ""));
  if (!r || (job.user_id && r.user_id !== job.user_id)) return { status: "skipped", reason: "reminder not found" };
  if (r.status !== "scheduled") return { status: "skipped", reason: `status ${r.status}` };
  const payloadDue = typeof job.payload.due_at === "string" ? Date.parse(job.payload.due_at) : null;
  if (payloadDue !== null && payloadDue !== Date.parse(r.due_at)) return { status: "skipped", reason: "rescheduled" };
  if (r.last_fired_at && Date.parse(r.last_fired_at) >= Date.parse(r.due_at)) return { status: "skipped", reason: "already sent" };
  if (Date.parse(r.due_at) > now.getTime() + 60_000) {
    // early delivery (clock skew / a job without due_at): queue a fresh job for due_at, then let this one finish
    await scheduleReminderJob(deps.db, r, { dedupe: false });
    return { status: "skipped", reason: "not due yet" };
  }
  const user = await deps.db.getUser(r.user_id);
  if (!user) return { status: "skipped", reason: "user not found" };
  if (user.profile.proactive_disabled === true) {
    // meta.stop_all: proactive messages are off and open reminders are cancelled, not just muted
    await deps.db.updateReminder(r.id, { status: "cancelled" });
    return { status: "skipped", reason: "proactive messages disabled" };
  }

  const tz = tzOf(user);
  const sent = await sendProactive(deps, user, {
    text: copyM5["act.reminder.fired"](r.text),
    buttons: reminderButtons.fired(r.id),
    template: reminderTemplate(r.id, r.text, formatStampHe(new Date(r.created_at), tz)),
  });
  if (!sent.sent) return { status: "skipped", reason: sent.reason };

  let next: string | null = null;
  if (isRecurrenceRule(r.recurrence)) {
    const after = new Date(Math.max(now.getTime(), Date.parse(r.due_at)));
    next = nextOccurrence(r.recurrence, after, tz).toISOString();
    const moved = await deps.db.updateReminder(r.id, { last_fired_at: now.toISOString(), due_at: next, job_id: null });
    if (moved) await scheduleReminderJob(deps.db, moved);
  } else {
    await deps.db.updateReminder(r.id, { last_fired_at: now.toISOString(), status: "sent" });
  }
  await deps.db.addAudit({ user_id: user.id, action: "reminder.fire", target: r.id, result: sent.mode });
  return { status: "sent", mode: sent.mode, next };
}

/** Reminder buttons (`rem:done|hour|tmrw:<id>`) from the free-form message or the template's quick replies. */
export function parseReminderButton(id: string): { verb: "done" | "hour" | "tmrw"; reminderId: string } | null {
  const m = id.match(/^rem:(done|hour|tmrw):([0-9a-f-]{36})$/);
  return m ? { verb: m[1] as "done" | "hour" | "tmrw", reminderId: m[2]! } : null;
}

export async function handleReminderButton(deps: ProactiveDeps, user: UserRow, to: string, buttonId: string): Promise<boolean> {
  const parsed = parseReminderButton(buttonId);
  if (!parsed) return false;
  const now = deps.now();
  const reply = parsed.verb === "done" ? await markReminderDone(deps.db, user, parsed.reminderId) : await snoozeReminder(deps.db, user, parsed.reminderId, parsed.verb === "hour" ? "hour" : "tomorrow", now);
  const text = reply ?? copyM5["act.reminder.not_found"]();
  await deps.wa.sendText(to, text);
  await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
  return true;
}
