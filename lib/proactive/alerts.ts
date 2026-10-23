import { oneLineUntrusted } from "@/lib/ai/untrusted";
import { alertButtons, pcopy } from "@/lib/copy/bot-proactive";
import type { Db, JobRow, NewProactiveItem, UserRow } from "@/lib/db/types";
import { activePhone, sendProactive } from "@/lib/jobs/proactive";
import { proactiveAlertsOn, proactivePaused, type MorningDeps } from "@/lib/jobs/morning-summary";
import { inRestTime } from "@/lib/time/rest-days";
import { DEFAULT_TZ, dateKey, dayLabelHe, localDateOf, zonedParts } from "@/lib/time/zoned";
import { proactiveAlertTemplate } from "@/lib/wa/templates";
import type { ReplyButton } from "@/lib/wa/types";
import { clockOf, findConflicts, pairKey, type EventPair } from "./calendar";
import { explicitUrgency, isAutomatedMail, type ProactiveMail } from "./mail";
import { checkPhishing } from "./phishing";
import { gatherSources } from "./sources";

/**
 * Urgent alerts (pro; Daniel's decision of 23.10.2026): besides the morning summary, at most ALERT_DAILY_CAP messages a
 * day, only between QUIET_END_HOUR and QUIET_START_HOUR local time (Asia/Jerusalem unless the user's zone says
 * otherwise), never on Shabbat or a holiday (from the eve's afternoon — lib/time/rest-days.ts). Two kinds:
 *   - a calendar clash in the next 24 hours (two meetings that overlap, either calendar);
 *   - a high-signal urgent mail: a person (not a mailing) the user has written to (Sent Items), who writes that it is
 *     urgent ("דחוף", "urgent", "ASAP"… or the high-importance flag) — and the mail is not flagged as phishing.
 * The scan runs as a `proactive_scan` job (pg_cron schedule_proactive_scans(), migration 0013, every round hour; a
 * Microsoft new-mail notification queues one sooner). Each item is claimed in SQL (proactive_alert_claim: atomic per
 * user, never the same item twice, the daily cap). WhatsApp's 24-hour window: inside it the alert is free text with
 * buttons; outside it the UTILITY template `proactive_alert` (lib/wa/templates.ts, Daniel's approval of 23.10.2026) with
 * the alert in one line and the same action payload on [לטפל עכשיו]. The same cap, hours and opt-out hold either way.
 * When the send fails (the template not approved yet, WhatsApp down) the item is recorded `deferred` and the next
 * morning summary shows it (folded into "דברים שכדאי לא לפספס"). Over the cap: the same.
 */

export const ALERT_DAILY_CAP = 2;
/** Alerts only from 08:00 to 20:00 local time. */
export const QUIET_END_HOUR = 8;
export const QUIET_START_HOUR = 20;
/** Mail is checked since the last scan, at most this far back (a night's mail is checked at 08:00). */
const MAX_LOOKBACK_MS = 16 * 3_600_000;
const MIN_LOOKBACK_MS = 30 * 60_000;

export type AlertDeps = MorningDeps;

const tzOf = (user: UserRow) => user.timezone || DEFAULT_TZ;

/** Inside 08:00–20:00 local and not Shabbat / a holiday (or its eve). */
export function alertHoursOpen(now: Date, tz: string = DEFAULT_TZ): boolean {
  const h = zonedParts(now, tz).hour;
  return h >= QUIET_END_HOUR && h < QUIET_START_HOUR && !inRestTime(now, tz);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** proactive_scan:<user>:<YYYY-MM-DD>T<HH> (the local hour) — the same key SQL schedule_proactive_scans() writes. */
export function scanDedupeKey(userId: string, at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  return `proactive_scan:${userId}:${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}`;
}

/** The next round hour after `after` at which alerts may go out (up to a week ahead), or null. */
export function nextScanAt(after: Date, tz: string = DEFAULT_TZ): Date | null {
  let t = Math.floor(after.getTime() / 3_600_000) * 3_600_000 + 3_600_000;
  for (let i = 0; i < 24 * 7; i++, t += 3_600_000) if (alertHoursOpen(new Date(t), tz)) return new Date(t);
  return null;
}

/** Queues the next scan for a pro user with alerts on (idempotent by dedupe key). */
export async function scheduleProactiveScan(db: Db, user: UserRow, after: Date): Promise<JobRow | null> {
  if (!(await proactiveAlertsOn(db, user, after))) return null;
  const tz = tzOf(user);
  const at = nextScanAt(after, tz);
  if (!at) return null;
  const p = zonedParts(at, tz);
  return db.createJob({ kind: "proactive_scan", user_id: user.id, run_at: at, payload: { slot: `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}` }, dedupe_key: scanDedupeKey(user.id, at, tz), max_attempts: 2 });
}

/** New mail arrived (a Microsoft Graph notification): a scan in 2 minutes, at most one per 10 minutes, in alert hours only. */
export async function queueScanSoon(db: Db, user: UserRow, now: Date): Promise<JobRow | null> {
  const tz = tzOf(user);
  const at = new Date(now.getTime() + 2 * 60_000);
  if (!alertHoursOpen(at, tz) || !(await proactiveAlertsOn(db, user, now))) return null;
  const bucket = Math.floor(now.getTime() / 600_000);
  return db.createJob({ kind: "proactive_scan", user_id: user.id, run_at: at, payload: { reason: "new_mail" }, dedupe_key: `proactive_scan:${user.id}:mail:${bucket}`, max_attempts: 1 });
}

interface Candidate {
  item: Omit<NewProactiveItem, "user_id" | "local_day">;
  text: string;
  /** {{1}} of the `proactive_alert` template (outside the window) */
  templateLine: string;
}

const who = (m: ProactiveMail) => oneLineUntrusted(m.from?.name || m.from?.address || "", 40) || "?";
const subj = (m: ProactiveMail) => oneLineUntrusted(m.subject || "", 100) || "(ללא נושא)";

export type ScanResult = { status: "done"; sent: number; deferred: number; candidates: number } | { status: "skipped"; reason: string };

/** The `proactive_scan` job: one user, one pass. Throws only on unexpected errors (the job is retried once). */
export async function runProactiveScanJob(deps: AlertDeps, job: Pick<JobRow, "id" | "user_id" | "payload">): Promise<ScanResult> {
  if (!job.user_id) return { status: "skipped", reason: "no user" };
  const user = await deps.db.getUser(job.user_id);
  if (!user) return { status: "skipped", reason: "user not found" };
  const now = deps.now();
  const tz = tzOf(user);
  const result = await scan(deps, user, now, tz);
  // the next round hour (pg_cron does the same in production; this keeps the dev loop and DATA_MODE=memory going)
  const fresh = (await deps.db.getUser(user.id)) ?? user;
  await scheduleProactiveScan(deps.db, fresh, now).catch(() => null);
  return result;
}

async function scan(deps: AlertDeps, user: UserRow, now: Date, tz: string): Promise<ScanResult> {
  if (!(await proactiveAlertsOn(deps.db, user, now))) return { status: "skipped", reason: "alerts off or not pro" };
  if (proactivePaused(user, now)) return { status: "skipped", reason: "paused" };
  if (!alertHoursOpen(now, tz)) return { status: "skipped", reason: "quiet hours" };
  const phone = await activePhone(deps.db, user.id);
  if (!phone) return { status: "skipped", reason: "no phone" };

  const last = typeof user.profile.alerts_last_scan_at === "string" ? Date.parse(user.profile.alerts_last_scan_at) : NaN;
  const since = new Date(Math.min(now.getTime() - MIN_LOOKBACK_MS, Math.max(Number.isFinite(last) ? last : 0, now.getTime() - MAX_LOOKBACK_MS)));
  const g = await deps.graphFor(user).catch(() => null);
  const google = deps.googleFor ? await deps.googleFor(user).catch(() => null) : null;
  if (!g && !google) return { status: "skipped", reason: "no connection" };
  const sources = await gatherSources(
    g ? { graph: g.graph, accountEmail: g.accountEmail } : null,
    google ? { google: google.google, gmail: google.gmail ?? null, accountEmail: google.accountEmail ?? null } : null,
    { now, mailSince: since, sentSince: new Date(now.getTime() - 60 * 86_400_000), eventsFrom: now, eventsTo: new Date(now.getTime() + 24 * 3_600_000), tz, top: 25 },
    user.id,
  );
  await deps.db.mergeUserProfile(user.id, { alerts_last_scan_at: now.toISOString() });

  const candidates: Candidate[] = [];
  // 1. a clash in the next 24 hours (both meetings still ahead)
  for (const p of findConflicts(sources.events).filter((x) => x.a.startMs > now.getTime() && x.b.startMs > now.getTime())) candidates.push(conflictCandidate(p, now, tz));
  // 2. an urgent mail from a known person (newest first)
  const known = new Set(sources.known.map((c) => c.address));
  const ctx = { known: sources.known, selfAddresses: sources.selfAddresses };
  for (const m of [...sources.mails].sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))) {
    if (Date.parse(m.receivedDateTime) < since.getTime() || isAutomatedMail(m)) continue;
    const from = m.from?.address ?? "";
    if (!known.has(from) || sources.selfAddresses.includes(from)) continue;
    if (!(explicitUrgency(m) || m.importance === "high")) continue;
    if (checkPhishing(m, ctx).level !== "none") continue; // an alert never pushes a suspicious mail
    candidates.push({
      item: { item_key: `mail:${m.provider}:${m.id}`, kind: "urgent_mail", payload: { provider: m.provider, message_id: m.id, who: who(m), subject: subj(m) } },
      text: pcopy["alert.urgent.mail"](who(m), subj(m)),
      templateLine: pcopy["alert.template.mail"](who(m), subj(m)),
    });
  }
  if (!candidates.length) return { status: "done", sent: 0, deferred: 0, candidates: 0 };

  const localDay = dateKey(localDateOf(now, tz));
  let sent = 0;
  let deferred = 0;
  for (const c of candidates) {
    // every claim may deliver: inside the window as free text, outside it with the `proactive_alert` template
    const claim = await deps.db.claimProactiveAlert({ ...c.item, user_id: user.id, local_day: localDay }, { cap: ALERT_DAILY_CAP, deliver: true });
    if (claim.result === "duplicate" || !claim.alert) continue;
    if (claim.result !== "claimed") {
      deferred++;
      continue;
    }
    const id = claim.alert.id;
    // the buttons carry the alert's id, so they are set after the claim
    const action = c.item.kind === "urgent_mail" ? `al:reply:${id}` : `al:conf:${id}`;
    const buttons: ReplyButton[] =
      c.item.kind === "urgent_mail"
        ? [{ id: action, title: alertButtons.reply }, { id: `al:remind:${id}`, title: alertButtons.remind }, { id: "al:off", title: alertButtons.off }]
        : [{ id: action, title: alertButtons.conflict }, { id: "al:off", title: alertButtons.off }];
    try {
      const r = await sendProactive(deps, user, { text: c.text, buttons, template: proactiveAlertTemplate({ line: c.templateLine, actionId: action }) });
      if (!r.sent) throw new Error(r.reason);
      await deps.db.addAudit({ user_id: user.id, action: "proactive.alert", target: c.item.kind, result: r.mode === "template" ? "sent_template" : "sent" });
      sent++;
    } catch (e) {
      // WhatsApp failed (outside the window: the template is not approved yet, or Meta refused it): the next morning
      // summary shows it instead
      console.warn(`[proactive] alert send failed for ${user.id}:`, (e as Error).message);
      await deps.db.setProactiveAlertStatus(user.id, id, "deferred");
      deferred++;
    }
  }
  return { status: "done", sent, deferred, candidates: candidates.length };
}

function conflictCandidate(p: EventPair, now: Date, tz: string): Candidate {
  const label = (e: EventPair["a"]) => `${clockOf(e.startMs, tz)} ${oneLineUntrusted(e.title || "(ללא כותרת)", 60)}`;
  const a = label(p.a);
  const b = label(p.b);
  const day = localDateOf(new Date(p.a.startMs), tz);
  const today = localDateOf(now, tz);
  const dayLabel = dateKey(day) === dateKey(today) ? "היום" : `ב${dayLabelHe(day)}`;
  return {
    item: { item_key: pairKey("conflict", p), kind: "conflict", payload: { a, b, day_label: dayLabel, a_id: `${p.a.provider}:${p.a.id}`, b_id: `${p.b.provider}:${p.b.id}` } },
    text: pcopy["alert.urgent.conflict"](dayLabel, a, b),
    templateLine: pcopy["alert.template.conflict"](dayLabel, a, b),
  };
}
