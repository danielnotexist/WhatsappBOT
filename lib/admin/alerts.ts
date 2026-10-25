import "server-only";
import { after } from "next/server";
import { effectivePlan, isPaidPlan, PLANS } from "@/lib/billing/plans";
import { ALERT_TYPE_LABEL, isUrgent, OWNER_ALERT_KINDS, ownerAlertContent, ownerAlertMail, ownerDigestMail, digestWhatsappLine, type OwnerEvent, type SwitchableAlertType } from "@/lib/copy/owner-alerts";
import { getDb } from "@/lib/db";
import type { ConnectionRow, Db, OwnerAlertChannel, OwnerAlertRow, OwnerAlertStatus, OwnerAlertType } from "@/lib/db/types";
import { adminEmails, EnvError, integrationsMocked, ownerAlertWhatsapp, requireEnv } from "@/lib/env";
import { errorMessage, reportError } from "@/lib/errors/report";
import type { Mailer } from "@/lib/mail/types";
import { inRestTime } from "@/lib/time/rest-days";
import { DEFAULT_TZ, zonedParts } from "@/lib/time/zoned";
import type { WaSender } from "@/lib/wa/sender";
import { ownerAlertTemplate } from "@/lib/wa/templates";
import { adminMailer, AdminMailUnavailableError } from "./mail";

export type { OwnerEvent } from "@/lib/copy/owner-alerts";

/**
 * Alerts to the owner (round plan, סבב 1 "התראות לבעלים"): one function, `notifyOwner(event)`, mails ADMIN_EMAILS through
 * the admin mailer (lib/admin/mail.ts — Resend; the console outbox in DATA_MODE=memory dev). WhatsApp (template
 * owner_alert) only with OWNER_ALERT_WA=1 + ADMIN_PHONE, after Meta approved it.
 *
 *   - every event once (owner_alerts.dedupe_key, migration 0016), and a rate limit per type (RATE_LIMITS);
 *   - the settings in ops_flags `owner_alerts:settings`: a switch per type, quiet hours (default 22:00–07:00 Israel
 *     time) and Shabbat / holidays. In quiet time a non-urgent alert is stored as `queued`, and the owner_alerts job
 *     (every quarter-hour, through /api/jobs/tick or pg_cron) sends them as one digest when the quiet time ends;
 *     urgent types (a failed payment, a charge to check, an error spike, the AI budget at 100%) go at once;
 *   - best effort: it never throws into the caller — a failure is recorded on the row and in reportError.
 *
 * The call sites use `ownerAlert(event)`: a one-liner that never blocks the user's request (Next `after()` where a
 * request scope exists, otherwise a promise nobody waits for).
 */

// ---------------------------------------------------------------------------------------------
// settings (ops_flags)
// ---------------------------------------------------------------------------------------------

export const OWNER_ALERT_SETTINGS_KEY = "owner_alerts:settings";

export interface OwnerAlertSettings {
  types: Record<SwitchableAlertType, boolean>;
  /** whole hours, Israel time; start === end means no quiet hours */
  quiet: { enabled: boolean; start: number; end: number; shabbat: boolean };
  /** errors in the last hour that make an error_spike alert */
  errorSpikeThreshold: number;
}

export const DEFAULT_ERROR_SPIKE_THRESHOLD = 10;

export const DEFAULT_ALERT_SETTINGS: OwnerAlertSettings = {
  types: Object.fromEntries(OWNER_ALERT_KINDS.map((k) => [k.type, true])) as Record<SwitchableAlertType, boolean>,
  quiet: { enabled: true, start: 22, end: 7, shabbat: true },
  errorSpikeThreshold: DEFAULT_ERROR_SPIKE_THRESHOLD,
};

const hour = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback);

/** Whatever is stored, read safely: unknown keys dropped, bad values back to the default. */
export function parseAlertSettings(value: unknown): OwnerAlertSettings {
  const d = DEFAULT_ALERT_SETTINGS;
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const types = v.types && typeof v.types === "object" ? (v.types as Record<string, unknown>) : {};
  const quiet = v.quiet && typeof v.quiet === "object" ? (v.quiet as Record<string, unknown>) : {};
  const threshold = typeof v.errorSpikeThreshold === "number" && Number.isInteger(v.errorSpikeThreshold) && v.errorSpikeThreshold >= 1 && v.errorSpikeThreshold <= 10_000 ? v.errorSpikeThreshold : d.errorSpikeThreshold;
  return {
    types: Object.fromEntries(OWNER_ALERT_KINDS.map((k) => [k.type, typeof types[k.type] === "boolean" ? types[k.type] : d.types[k.type]])) as Record<SwitchableAlertType, boolean>,
    quiet: {
      enabled: typeof quiet.enabled === "boolean" ? quiet.enabled : d.quiet.enabled,
      start: hour(quiet.start, d.quiet.start),
      end: hour(quiet.end, d.quiet.end),
      shabbat: typeof quiet.shabbat === "boolean" ? quiet.shabbat : d.quiet.shabbat,
    },
    errorSpikeThreshold: threshold,
  };
}

export async function loadAlertSettings(db: Db): Promise<OwnerAlertSettings> {
  return parseAlertSettings((await db.getOpsFlag(OWNER_ALERT_SETTINGS_KEY))?.value);
}

export async function saveAlertSettings(db: Db, settings: OwnerAlertSettings): Promise<OwnerAlertSettings> {
  const clean = parseAlertSettings(settings);
  await db.setOpsFlag(OWNER_ALERT_SETTINGS_KEY, clean as unknown as Record<string, unknown>);
  return clean;
}

/**
 * The alerts tab's form → settings: a checkbox per type (`type_<type>`), `quiet_enabled`, `quiet_start` / `quiet_end`
 * (whole hours), `shabbat`, `spike_threshold`. A value out of range → a Hebrew error, nothing saved.
 */
export function alertSettingsFromForm(form: FormData): { ok: true; settings: OwnerAlertSettings } | { ok: false; error: string } {
  const on = (name: string) => form.get(name) === "on" || form.get(name) === "1";
  const int = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" && /^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  };
  const start = int("quiet_start");
  const end = int("quiet_end");
  const threshold = int("spike_threshold");
  if (!(start >= 0 && start <= 23) || !(end >= 0 && end <= 23)) return { ok: false, error: "שעות השקט לא תקינות. צריך לבחור שעה בין 00:00 ל-23:00." };
  if (!(threshold >= 1 && threshold <= 10_000)) return { ok: false, error: "סף הקפיצה בתקלות צריך להיות מספר שלם בין 1 ל-10,000." };
  return {
    ok: true,
    settings: {
      types: Object.fromEntries(OWNER_ALERT_KINDS.map((k) => [k.type, on(`type_${k.type}`)])) as Record<SwitchableAlertType, boolean>,
      quiet: { enabled: on("quiet_enabled"), start, end, shabbat: on("shabbat") },
      errorSpikeThreshold: threshold,
    },
  };
}

/** Quiet time now: inside the quiet hours (Israel time), or Shabbat / a holiday (from the eve's afternoon) when that is on. */
export function inQuietTime(settings: OwnerAlertSettings, now: Date): boolean {
  if (settings.quiet.shabbat && inRestTime(now, DEFAULT_TZ)) return true;
  const { enabled, start, end } = settings.quiet;
  if (!enabled || start === end) return false;
  const h = zonedParts(now, DEFAULT_TZ).hour;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

// ---------------------------------------------------------------------------------------------
// once per event, and a rate limit per type
// ---------------------------------------------------------------------------------------------

const HOUR = 3_600_000;

/** At most `max` alerts of a type within `windowMs` (the dedupe key already makes every event once). null = no limit. */
export const RATE_LIMITS: Record<OwnerAlertType, { max: number; windowMs: number } | null> = {
  signup: null,
  ticket: { max: 30, windowMs: HOUR },
  system_request: { max: 30, windowMs: HOUR },
  payment_failed: { max: 20, windowMs: HOUR },
  charge_unknown: { max: 20, windowMs: HOUR },
  error_spike: { max: 1, windowMs: HOUR },
  // once per threshold per day is the dedupe key (ai_budget:<day>:<80|100>); two thresholds a day at most
  ai_budget: { max: 2, windowMs: 24 * HOUR },
  connection_expired_paid: { max: 20, windowMs: HOUR },
  referral: { max: 30, windowMs: HOUR },
  test: { max: 10, windowMs: HOUR },
};

/** The clock hour in Israel, "2026-10-24T09" — the error spike's slot. */
export function israelHourSlot(now: Date): string {
  const p = zonedParts(now, DEFAULT_TZ);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}`;
}

/** What makes an event the same event. */
export function dedupeKey(event: OwnerEvent): string {
  switch (event.type) {
    case "signup":
      return `signup:${event.userId}`;
    case "ticket":
    case "system_request":
      return `ticket:${event.ticketId}`;
    case "payment_failed":
      return `payment_failed:${event.ref}`;
    case "charge_unknown":
      return `charge_unknown:${event.ref}`;
    case "error_spike":
      return `error_spike:${event.slot}`;
    case "ai_budget":
      return `ai_budget:${event.day}:${event.threshold}`;
    case "connection_expired_paid":
      // the same connection may expire again after a reconnect: once a day
      return `connection_expired:${event.connectionId}:${event.day ?? ""}`;
    case "referral":
      return `referral:${event.referralId}`;
    case "test":
      return `test:${event.at}`;
  }
}

// ---------------------------------------------------------------------------------------------
// where it goes
// ---------------------------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

/** The site's address for the links: APP_URL; in the mocked modes (memory dev, the demo) a local fallback. */
export function alertAppUrl(env: Env = process.env): string {
  if (env.APP_URL?.trim()) return requireEnv(["APP_URL"], env).APP_URL;
  if (integrationsMocked(env)) return "http://localhost:3000";
  return requireEnv(["APP_URL"], env).APP_URL; // throws the Hebrew EnvError naming APP_URL
}

/** ADMIN_EMAILS without the addresses that already got this very mail (a ticket sent to a SUPPORT_EMAIL that is an owner's). */
export function ownerRecipients(env: Env = process.env, alreadyMailed: readonly string[] = []): string[] {
  const skip = new Set(alreadyMailed.map((e) => e.trim().toLowerCase()));
  return adminEmails(env).filter((e) => !skip.has(e));
}

const NO_MAIL = "אין שירות מייל אמיתי בסביבה הזו, ולכן ההתראה לא נשלחה. במצב הדגמה צריך LIVE_SUPPORT_MAIL=1 ו-RESEND_API_KEY.";

export interface NotifyDeps {
  db?: Db;
  mailer?: Mailer;
  wa?: WaSender;
  now?: Date;
  env?: Env;
  /** addresses that already received this event's mail (lib/support/notify.ts): they are not mailed again */
  alreadyMailed?: readonly string[];
}

export type NotifyStatus = OwnerAlertStatus | "duplicate" | "off" | "error";
export interface NotifyResult {
  status: NotifyStatus;
  id?: string;
  channel?: OwnerAlertChannel | null;
  error?: string;
}

/** The event as stored on the row (the digest renders it again): plain JSON. */
function payloadOf(event: OwnerEvent): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

async function sendOwnerMail(mailer: Mailer, mail: { to: string[]; subject: string; text: string; html: string; replyTo?: string }): Promise<void> {
  if (mailer.sendOwnerAlert) {
    await mailer.sendOwnerAlert(mail);
    return;
  }
  if (!mailer.sendOperatorAlert) throw new Error("the mailer cannot send owner alerts");
  for (const to of mail.to) await mailer.sendOperatorAlert({ to, subject: mail.subject, text: mail.text });
}

async function waSender(deps: NotifyDeps): Promise<WaSender> {
  return deps.wa ?? (await import("@/lib/wa")).getWaSender();
}

/** Sends one prepared mail (and the WhatsApp line) and records the outcome on the rows. Never throws. */
async function deliver(
  db: Db,
  ids: string[],
  m: { to: string[]; subject: string; text: string; html: string; replyTo?: string; waLine: string; type: OwnerAlertType; digest?: boolean },
  wa: { phone: string } | null,
  waConfigError: string | null,
  deps: NotifyDeps,
  env: Env,
): Promise<NotifyResult> {
  const errors: string[] = waConfigError ? [waConfigError] : [];
  let email = false;
  let whatsapp = false;
  if (m.to.length) {
    try {
      await sendOwnerMail(deps.mailer ?? adminMailer(env), m);
      email = true;
    } catch (e) {
      if (e instanceof AdminMailUnavailableError) {
        console.warn("[owner-alerts] not mailed:", NO_MAIL);
        errors.push(NO_MAIL);
      } else {
        errors.push(errorMessage(e));
        await reportError("owner_alerts", e, { db, context: { type: m.type, stage: "email" } });
      }
    }
  }
  if (wa) {
    try {
      const t = ownerAlertTemplate({ line: m.waLine });
      await (await waSender(deps)).sendTemplate(`+${wa.phone}`, t.name, t.params.map((text) => ({ type: "text" as const, text })), t.buttons);
      whatsapp = true;
    } catch (e) {
      errors.push(errorMessage(e));
      await reportError("owner_alerts", e, { db, context: { type: m.type, stage: "whatsapp" } });
    }
  }
  const channel: OwnerAlertChannel | null = m.digest ? "digest" : email && whatsapp ? "email+whatsapp" : email ? "email" : whatsapp ? "whatsapp" : null;
  const status: OwnerAlertStatus = email || whatsapp ? "sent" : "failed";
  const error = errors.length ? errors.join(" | ").slice(0, 500) : null;
  try {
    await db.finishOwnerAlerts(ids, { status, channel: status === "sent" ? channel : m.digest ? "digest" : null, error });
  } catch (e) {
    await reportError("owner_alerts", e, { db, context: { type: m.type, stage: "record" } });
  }
  return { status, id: ids[0], channel, ...(error ? { error } : {}) };
}

function whatsappConfig(env: Env): { wa: { phone: string } | null; error: string | null } {
  try {
    return { wa: ownerAlertWhatsapp(env), error: null };
  } catch (e) {
    const message = e instanceof EnvError ? e.message : errorMessage(e);
    console.error("[owner-alerts]", message);
    return { wa: null, error: message };
  }
}

/**
 * Tells the owner about one event. Never throws: returns what happened — sent / failed (recorded), queued (quiet
 * time), limited (the type's rate limit), merged (the owner already got that mail), duplicate, off (the type's switch).
 */
export async function notifyOwner(event: OwnerEvent, deps: NotifyDeps = {}): Promise<NotifyResult> {
  const db = deps.db ?? getDb();
  try {
    const now = deps.now ?? new Date();
    const env = deps.env ?? process.env;
    const settings = await loadAlertSettings(db);
    if (event.type !== "test" && !settings.types[event.type]) return { status: "off" };

    const appUrl = alertAppUrl(env);
    const mail = ownerAlertMail(event, appUrl);
    const to = ownerRecipients(env, event.type === "test" ? [] : deps.alreadyMailed);
    const { wa, error: waError } = whatsappConfig(env);
    const merged = to.length === 0 && !wa;
    const queue = !merged && !isUrgent(event) && inQuietTime(settings, now);

    const claim = await db.claimOwnerAlert({ type: event.type, dedupe_key: dedupeKey(event), subject: mail.subject, payload: payloadOf(event), queue, limit: RATE_LIMITS[event.type] });
    if (claim.result === "duplicate" || !claim.alert) return { status: "duplicate" };
    const id = claim.alert.id;
    if (claim.result === "limited" || claim.result === "queued") return { status: claim.result, id };
    if (merged) {
      await db.finishOwnerAlerts([id], { status: "merged", channel: "email" });
      return { status: "merged", id, channel: "email" };
    }
    const replyTo = event.type === "ticket" || event.type === "system_request" ? event.fromEmail : undefined;
    return await deliver(db, [id], { to, ...mail, replyTo, waLine: mail.subject, type: event.type }, wa, waError, deps, env);
  } catch (e) {
    await reportError("owner_alerts", e, { db, context: { type: event.type, stage: "notify" } });
    return { status: "error", error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// the call sites' one-liner
// ---------------------------------------------------------------------------------------------

let captured: { event: OwnerEvent; deps: NotifyDeps }[] | null = null;
const inFlight = new Set<Promise<unknown>>();

/**
 * Tests: from now on `ownerAlert()` records instead of sending (under NODE_ENV=test it does nothing at all unless
 * capturing — a unit test of a call site never mails). Returns the list; `stopCapturingOwnerAlerts()` ends it.
 */
export function captureOwnerAlerts(): { event: OwnerEvent; deps: NotifyDeps }[] {
  captured = [];
  return captured;
}

export function stopCapturingOwnerAlerts(): void {
  captured = null;
}

/** Tests / scripts: waits for the alerts started without a request scope. */
export async function settleOwnerAlerts(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/**
 * Fire and forget: the alert runs after the response (Next `after()`) or, outside a request (a job, a script), as a
 * promise nobody awaits. Never throws and never delays the caller — safe on the WhatsApp path.
 */
export function ownerAlert(event: OwnerEvent, deps: NotifyDeps = {}): void {
  if (captured) {
    captured.push({ event, deps });
    return;
  }
  if (process.env.NODE_ENV === "test") return;
  const run = () => notifyOwner(event, deps).catch(() => undefined);
  try {
    after(run);
  } catch {
    const p = run().finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

// ---------------------------------------------------------------------------------------------
// the hooks that need a little thought before the one-liner
// ---------------------------------------------------------------------------------------------

const budgetFired = new Set<string>();

/** Tests only. */
export function resetBudgetAlertsForTests(): void {
  budgetFired.clear();
}

/**
 * The day's AI spend moved (lib/ai/budget.ts SpendGuard): 80% and 100% of the budget, once per threshold per day and
 * process (the dedupe key covers the other instances). No await, no I/O below the threshold — the bot path stays fast.
 */
export function aiBudgetAlert(db: Db, day: string, totalUsd: number, budgetUsd: number): void {
  if (!(budgetUsd > 0) || !Number.isFinite(totalUsd)) return;
  const threshold = totalUsd >= budgetUsd - 1e-9 ? 100 : totalUsd >= budgetUsd * 0.8 - 1e-9 ? 80 : null;
  if (!threshold) return;
  const key = `${day}:${threshold}`;
  if (budgetFired.has(key)) return;
  budgetFired.add(key);
  ownerAlert({ type: "ai_budget", threshold, spentUsd: Math.round(totalUsd * 100) / 100, budgetUsd, day }, { db });
}

/**
 * A connection was marked expired (lib/google/token-store.ts, lib/ms/token-store.ts): an alert only when its user pays.
 * Runs in the background (the plan lookup included).
 */
export function connectionExpiredAlert(db: Db, connection: Pick<ConnectionRow, "id" | "user_id" | "provider">, now: Date = new Date()): void {
  const run = async () => {
    try {
      const event = await connectionExpiredEvent(db, connection, now);
      if (event) await notifyOwner(event, { db, now });
    } catch (e) {
      await reportError("owner_alerts", e, { db, context: { type: "connection_expired_paid", stage: "lookup" } });
    }
  };
  if (captured) {
    const list = captured;
    const p = connectionExpiredEvent(db, connection, now)
      .then((event) => void (event && list.push({ event, deps: { db } })))
      .catch(() => undefined)
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
    return;
  }
  if (process.env.NODE_ENV === "test") return;
  try {
    after(run);
  } catch {
    const p = run().finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

/** The alert of an expired connection, or null when its user does not pay (trial, ended, unknown). */
export async function connectionExpiredEvent(db: Db, connection: Pick<ConnectionRow, "id" | "user_id" | "provider">, now: Date = new Date()): Promise<OwnerEvent | null> {
  const [user, sub] = await Promise.all([db.getUser(connection.user_id), db.getSubscription(connection.user_id)]);
  const plan = effectivePlan(sub, now);
  if (!user || !isPaidPlan(plan)) return null;
  return { type: "connection_expired_paid", userId: user.id, email: user.email, name: user.name, provider: connection.provider, plan: PLANS[plan].nameHe, connectionId: connection.id, day: israelHourSlot(now).slice(0, 10) };
}

// ---------------------------------------------------------------------------------------------
// the owner_alerts job: the error spike and the morning digest
// ---------------------------------------------------------------------------------------------

/** Sources that never count toward a spike (a failing alert must not alert about itself). */
const SPIKE_IGNORED = new Set(["owner_alerts"]);

/** Errors in the last hour: `count`, and the top sources. */
export async function errorsLastHour(db: Db, now: Date): Promise<{ count: number; top: { source: string; count: number }[] }> {
  const since = now.getTime() - HOUR;
  const rows = (await db.listAppErrors({ limit: 2000 })).filter((e) => Date.parse(e.at) > since && Date.parse(e.at) <= now.getTime() + 60_000 && !SPIKE_IGNORED.has(e.source));
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.source, (by.get(r.source) ?? 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([source, count]) => ({ source, count }));
  return { count: rows.length, top };
}

/** An error_spike alert when the last hour passed the threshold (once per clock hour, at most one an hour). */
export async function checkErrorSpike(deps: NotifyDeps = {}): Promise<NotifyResult | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const settings = await loadAlertSettings(db);
  if (!settings.types.error_spike) return null;
  const { count, top } = await errorsLastHour(db, now);
  if (count < settings.errorSpikeThreshold) return null;
  return notifyOwner({ type: "error_spike", count, threshold: settings.errorSpikeThreshold, top, slot: israelHourSlot(now) }, { ...deps, db, now });
}

/**
 * The quiet time is over: everything queued goes as one mail (oldest first). A failed send puts the rows back once;
 * a second failure marks them failed (no endless retries). Never throws.
 */
export async function flushOwnerDigest(deps: NotifyDeps = {}): Promise<{ status: "skipped"; reason: string } | NotifyResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const env = deps.env ?? process.env;
  try {
    const settings = await loadAlertSettings(db);
    if (inQuietTime(settings, now)) return { status: "skipped", reason: "quiet time" };
    const rows = await db.takeQueuedOwnerAlerts(100);
    if (!rows.length) return { status: "skipped", reason: "nothing queued" };
    const appUrl = alertAppUrl(env);
    const items = rows.map((r) => ({ at: r.created_at, type: r.type, subject: r.subject, href: hrefOf(r, appUrl) }));
    const mail = ownerDigestMail(items, appUrl);
    const { wa, error: waError } = whatsappConfig(env);
    const result = await deliver(db, rows.map((r) => r.id), { to: ownerRecipients(env), ...mail, waLine: digestWhatsappLine(rows.length), type: rows[0]!.type, digest: true }, wa, waError, deps, env);
    if (result.status === "failed") {
      const retry = rows.filter((r) => !r.error).map((r) => r.id);
      if (retry.length) await db.finishOwnerAlerts(retry, { status: "queued", channel: null, error: result.error ?? "digest failed" });
    }
    return result;
  } catch (e) {
    await reportError("owner_alerts", e, { db, context: { stage: "digest" } });
    return { status: "error", error: errorMessage(e) };
  }
}

/** The deep link of a stored alert (its payload is the event). */
function hrefOf(row: OwnerAlertRow, appUrl: string): string {
  try {
    return ownerAlertContent(row.payload as unknown as OwnerEvent, appUrl).link.href;
  } catch {
    return `${appUrl.replace(/\/+$/, "")}/admin?tab=alerts`;
  }
}

/** The job (kind owner_alerts, every quarter-hour): the spike check, then the digest. Never throws. */
export async function runOwnerAlertsJob(deps: NotifyDeps = {}): Promise<{ spike: NotifyStatus | "none"; digest: string }> {
  const db = deps.db ?? getDb();
  let spike: NotifyStatus | "none" = "none";
  try {
    spike = (await checkErrorSpike({ ...deps, db }))?.status ?? "none";
  } catch (e) {
    await reportError("owner_alerts", e, { db, context: { stage: "spike" } });
    spike = "error";
  }
  const digest = await flushOwnerDigest({ ...deps, db });
  return { spike, digest: "reason" in digest ? `skipped: ${digest.reason}` : digest.status };
}

const SLOT_MS = 15 * 60_000;

/** The quarter-hour of `now` in UTC, "2026-10-24T07:15" — the job's dedupe key (SQL schedule_owner_alerts, 0016). */
export function ownerAlertsSlot(now: Date): { key: string; at: Date } {
  const at = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS);
  return { key: `owner_alerts:${at.toISOString().slice(0, 16)}`, at };
}

/** /api/jobs/tick: makes sure this quarter-hour's job exists (idempotent by key; pg_cron does the same in production). */
export async function scheduleOwnerAlertsJob(db: Db, now: Date = new Date()): Promise<boolean> {
  const slot = ownerAlertsSlot(now);
  return (await db.createJob({ kind: "owner_alerts", user_id: null, run_at: slot.at, payload: {}, dedupe_key: slot.key, max_attempts: 1 })) !== null;
}

// ---------------------------------------------------------------------------------------------
// the alerts tab
// ---------------------------------------------------------------------------------------------

/** "שליחת מייל בדיקה": a mail right now to the owner addresses, whatever the switches and the quiet hours say. */
export async function sendTestAlert(by: string, deps: NotifyDeps = {}): Promise<NotifyResult> {
  const now = deps.now ?? new Date();
  return notifyOwner({ type: "test", by, at: now.toISOString() }, { ...deps, now });
}

/** Who gets the alerts, for the tab (names only; never fails). */
export function alertChannelsSummary(env: Env = process.env): { emails: string[]; emailError: string | null; whatsapp: string | null; whatsappError: string | null } {
  let emails: string[] = [];
  let emailError: string | null = null;
  try {
    emails = [...adminEmails(env)];
  } catch (e) {
    emailError = e instanceof EnvError ? e.message : errorMessage(e);
  }
  const { wa, error } = whatsappConfig(env);
  return { emails, emailError, whatsapp: wa ? wa.phone : null, whatsappError: error };
}

export { ALERT_TYPE_LABEL };
