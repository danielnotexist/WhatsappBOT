import { formatIls } from "./view";
import type { AppErrorRow, AuditRow, BillingApprovalKind, BillingApprovalRow, BillingApprovalStatus, JobKind, JobRow, PendingActionKind } from "@/lib/db/types";

/**
 * The account's story in words (the admin panel's activity views): every audit_log action the code writes, in Hebrew,
 * with its category, plus the app's errors, failed jobs and billing approvals as events of the same timeline.
 * Client-safe, pure. `audit-labels.test.ts` scans the code: a new action string without a label fails the build.
 */

// ---------- categories ----------

export type AuditCategory = "login" | "whatsapp" | "connections" | "billing" | "reminders" | "agents" | "on_behalf" | "admin" | "errors";

export const CATEGORY_ORDER: readonly AuditCategory[] = ["login", "whatsapp", "connections", "billing", "reminders", "agents", "on_behalf", "admin", "errors"];

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  login: "כניסה",
  whatsapp: "וואטסאפ",
  connections: "חיבורים",
  billing: "תשלומים ומנוי",
  reminders: "תזכורות",
  agents: "סוכנים",
  on_behalf: "פעולות בשם המשתמש",
  admin: "ניהול",
  errors: "תקלות",
};

// ---------- the dynamic families (the kinds are typed, so a new kind needs its words here) ----------

/** The draft kinds that wait for a tap (lib/bot/pending.ts writes `<kind>.execute` / `<kind>.cancel`). */
export const PENDING_DONE: Record<PendingActionKind, string> = {
  send_mail: "שלח מייל",
  forward_mail: "העביר מייל",
  create_event: "קבע אירוע ביומן",
  update_event: "עדכן אירוע ביומן",
  delete_event: "מחק אירוע מהיומן",
  share_file: "שיתף קובץ",
};
const PENDING_NOUN: Record<PendingActionKind, string> = {
  send_mail: "שליחת מייל",
  forward_mail: "העברת מייל",
  create_event: "קביעת אירוע",
  update_event: "עדכון אירוע",
  delete_event: "מחיקת אירוע",
  share_file: "שיתוף קובץ",
};

/** The one-tap billing offers (lib/billing/whatsapp.ts, one-tap.ts: `billing.offer|approve|decline.<kind>`). */
export const BILLING_KIND_LABEL: Record<BillingApprovalKind, string> = {
  upgrade: "שדרוג לפרו",
  retry: "חיוב חוזר",
  renew: "חידוש המנוי",
  resume: "המשך המנוי",
  cancel: "ביטול המנוי",
  downgrade: "מעבר לבסיסי",
  keep_pro: "הישארות בפרו",
  renewal: "החיוב החודשי",
};

export const JOB_LABEL: Record<JobKind, string> = {
  morning_summary: "סיכום בוקר",
  reminder: "תזכורת",
  renew_subscription: "חידוש מנוי",
  charge: "חיוב",
  retry: "ניסיון חוזר",
  proactive_scan: "סריקת התראות",
  meeting_plan: "תכנון פגישות",
  meeting_summary: "סיכום פגישה",
};

// ---------- every action name ----------

type Entry = readonly [label: string, category: AuditCategory];

const STATIC: Record<string, Entry> = {
  // כניסה וחשבון
  signup: ["נרשם", "login"],
  login: ["נכנס לאתר", "login"],
  "auth.login_whatsapp": ["נכנס לאתר מקישור בוואטסאפ", "login"],
  "account.delete": ["מחק את החשבון", "login"],

  // וואטסאפ
  "wa.link": ["קישר את הוואטסאפ", "whatsapp"],
  "wa.unlink": ["ניתק את הוואטסאפ", "whatsapp"],
  "morning_summary.send": ["קיבל סיכום בוקר", "whatsapp"],
  "proactive.alert": ["קיבל התראה יזומה", "whatsapp"],
  "meeting.summary": ["סיכום פגישה", "whatsapp"],
  "meeting.summary.ask": ["ביקש סיכום פגישה", "whatsapp"],

  // חיבורים
  "google.connect": ["חיבר את Google", "connections"],
  "google.revoke": ["ניתק את Google", "connections"],
  "google.gmail_read_not_kept": ["קריאת Gmail לא אושרה", "connections"],
  "google.drive_read_not_kept": ["קריאת Drive לא אושרה", "connections"],
  "ms.connect": ["חיבר את Microsoft 365", "connections"],
  "ms.admin_consent": ["אישור מנהל ב-Microsoft 365", "connections"],
  "connection.expired": ["חיבור פג תוקף", "connections"],
  "connection.revoke": ["ניתק חיבור", "connections"],
  "graph.notification": ["עדכון מ-Microsoft", "connections"],
  "ops.google_user_cap": ["מכסת המשתמשים של Google", "connections"],
  // seed.sql's older names
  connect_google: ["חיבר את Google", "connections"],
  connect_microsoft: ["חיבר את Microsoft 365", "connections"],

  // תשלומים ומנוי
  "subscription.activate": ["התחיל מנוי", "billing"],
  "subscription.upgrade": ["שדרג תוכנית", "billing"],
  "subscription.renew": ["חידש את המנוי", "billing"],
  "subscription.resume": ["המשיך את המנוי", "billing"],
  "subscription.cancel": ["ביטל את המנוי", "billing"],
  "subscription.charge": ["חיוב חודשי", "billing"],
  "subscription.downgrade_scheduled": ["קבע מעבר לבסיסי", "billing"],
  "subscription.downgrade_cleared": ["ביטל את המעבר לבסיסי", "billing"],
  "subscription.card_wait_ended": ["נגמרה ההמתנה לכרטיס", "billing"],
  "subscription.pause": ["המנוי הושהה", "billing"],
  "payment.return": ["חזר מדף התשלום", "billing"],
  "payment.token": ["שמירת הכרטיס", "billing"],
  "billing.charge": ["חויב", "billing"],
  "billing.card_page": ["פתח את דף עדכון הכרטיס", "billing"],
  "billing.card_update": ["עדכן כרטיס אשראי", "billing"],
  "billing.card_link": ["קיבל קישור לעדכון כרטיס", "billing"],
  "billing.refund_request": ["ביקש החזר", "billing"],
  "billing.approval.reject": ["אישור ממספר אחר נדחה", "billing"],
  charge: ["חויב", "billing"],

  // תזכורות
  "reminder.create": ["יצר תזכורת", "reminders"],
  "reminder.cancel": ["ביטל תזכורת", "reminders"],
  "reminder.snooze": ["דחה תזכורת", "reminders"],
  "reminder.move_next_day": ["העביר תזכורת למחר", "reminders"],
  "reminder.done": ["סימן תזכורת כטופלה", "reminders"],
  "reminder.fire": ["קיבל תזכורת", "reminders"],
  create_reminder: ["יצר תזכורת", "reminders"],

  // סוכנים
  "agent.create": ["יצר סוכן", "agents"],
  "agent.update": ["עדכן סוכן", "agents"],
  "agent.enable": ["הפעיל סוכן", "agents"],
  "agent.disable": ["השבית סוכן", "agents"],
  "agent.delete": ["מחק סוכן", "agents"],
  "agent.limit": ["הגיע למגבלת הסוכנים", "agents"],

  // פעולות בשם המשתמש
  "mail.mark_suspicious": ["סימן מייל כחשוד", "on_behalf"],
  "google.drive.create": ["שמר מסמך ב-Drive", "on_behalf"],
  "google.tasks.create": ["יצר משימה ב-Google Tasks", "on_behalf"],
  "ms.todo.create": ["יצר משימה ב-To Do", "on_behalf"],
  "meeting.tasks": ["הוסיף משימות מהפגישה", "on_behalf"],

  // ניהול
  "admin.login": ["נכנס לפאנל הניהול", "admin"],
  "admin.code_sent": ["קוד לפאנל הניהול נשלח", "admin"],
  "admin.view_user": ["צפה בכרטיס משתמש", "admin"],
  "admin.view_conversation": ["צפה בשיחה בוואטסאפ", "admin"],
  "admin.view_activity": ["צפה בציר הפעולות", "admin"],
  "admin.ticket_status": ["עדכן פנייה", "admin"],
  "demo.restore_user": ["משתמש ההדגמה שוחזר", "admin"],
};

function buildLabels(): ReadonlyMap<string, Entry> {
  const map = new Map<string, Entry>(Object.entries(STATIC));
  for (const kind of Object.keys(PENDING_DONE) as PendingActionKind[]) {
    map.set(`${kind}.execute`, [PENDING_DONE[kind], "on_behalf"]);
    map.set(`${kind}.cancel`, [`ביטל ${PENDING_NOUN[kind]}`, "on_behalf"]);
  }
  for (const kind of Object.keys(BILLING_KIND_LABEL) as BillingApprovalKind[]) {
    const what = BILLING_KIND_LABEL[kind];
    map.set(`billing.offer.${kind}`, [`קיבל הצעה: ${what}`, "billing"]);
    map.set(`billing.approve.${kind}`, [`אישר: ${what}`, "billing"]);
    map.set(`billing.decline.${kind}`, [`דחה: ${what}`, "billing"]);
  }
  return map;
}

export const AUDIT_LABELS: ReadonlyMap<string, Entry> = buildLabels();

/** A best guess for an action this file does not know yet (shown with its raw name). */
function guessCategory(action: string): AuditCategory {
  const head = action.split(".")[0] ?? "";
  if (/^(billing|subscription|payment)$/.test(head)) return "billing";
  if (/^(google|ms|connection|graph)$/.test(head)) return "connections";
  if (head === "reminder") return "reminders";
  if (head === "agent") return "agents";
  if (head === "admin" || head === "demo" || head === "ops") return "admin";
  if (head === "wa" || head === "meeting" || head === "proactive") return "whatsapp";
  if (head === "auth" || head === "login" || head === "signup") return "login";
  return "on_behalf";
}

export interface ActionLabel {
  label: string;
  category: AuditCategory;
  /** false: not in the list — the label is the raw action name */
  known: boolean;
}

export function auditLabel(action: string): ActionLabel {
  const hit = AUDIT_LABELS.get(action);
  if (hit) return { label: hit[0], category: hit[1], known: true };
  return { label: action, category: guessCategory(action), known: false };
}

// ---------- results ----------

export type EventStatus = "ok" | "cancelled" | "failed" | "review" | "pending";

export const STATUS_LABEL: Record<EventStatus, string> = { ok: "הצליח", cancelled: "בוטל", failed: "נכשל", review: "לבדיקה", pending: "ממתין" };
export const STATUS_TONE: Record<EventStatus, "ok" | "warn" | "error" | "off"> = { ok: "ok", cancelled: "off", failed: "error", review: "warn", pending: "warn" };

/** Results that only say "it went out" — no reason worth a line under the words. */
const QUIET = new Set(["ok", "text", "template", "sent", "sent_text", "sent_template", "opened", "cancelled"]);

const FAILED = /^(error|failed|invalid|token|token_failed|budget|model_failed|no_executor|denied|invalid_grant|invalid_signature|charged_not_checked|not_claimed)\b/;
const CANCELLED = /^(cancelled|declined|expired|stale|noop|rejected|blocked|duplicate|duplicate_payment)\b/;

/**
 * The outcome of an audit row in one word, and the raw reason behind it when there is more than "ok". The results are
 * free text across the code ("ok", "ok:demo", "error:state_expired", "failed:33:card", "declined:6", "sent_template" …):
 * a failure word first means failed, a stop word means cancelled, "unknown" is for a person to check, anything else
 * (sent, queued, opened, a count) went through.
 */
export function resultOf(action: string, result: string | null | undefined): { status: EventStatus; reason: string | null } {
  const r = (result ?? "").trim();
  const reason = r && !QUIET.has(r) ? r : null;
  if (action === "connection.expired") return { status: "failed", reason };
  if (action === "agent.limit") return { status: "cancelled", reason };
  if (!r) return { status: "ok", reason: null };
  if (r.startsWith("unknown")) return { status: "review", reason };
  if (FAILED.test(r)) return { status: "failed", reason };
  if (CANCELLED.test(r)) return { status: "cancelled", reason };
  return { status: "ok", reason };
}

const APPROVAL_STATUS: Record<BillingApprovalStatus, EventStatus> = {
  pending: "pending",
  processing: "pending",
  succeeded: "ok",
  failed: "failed",
  declined: "cancelled",
  expired: "cancelled",
  unknown: "review",
};

// ---------- one timeline ----------

export interface TimelineEvent {
  /** stable within one render */
  id: string;
  at: string;
  category: AuditCategory;
  label: string;
  /** the raw action name (audit rows), for the title tooltip */
  action: string | null;
  status: EventStatus;
  reason: string | null;
  /** a short extra: the agent's name, the account, the source of an error */
  detail: string | null;
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** The target when it says something to a person (an address, a plan, a provider) — never an id. */
function readableTarget(target: string | null | undefined): string | null {
  if (!target) return null;
  const t = target.trim();
  if (!t || UUIDISH.test(t) || t.length > 64 || /^wamid\./.test(t)) return null;
  return t;
}

export function auditEvent(a: AuditRow, i: number): TimelineEvent {
  const { label, category } = auditLabel(a.action);
  const { status, reason } = resultOf(a.action, a.result);
  return {
    id: `a${i}:${a.created_at}`,
    at: a.created_at,
    category,
    label,
    action: a.action,
    status,
    reason,
    detail: a.agent_name ?? readableTarget(a.target),
  };
}

export function errorEvent(e: AppErrorRow): TimelineEvent {
  return { id: `e:${e.id}`, at: e.at, category: "errors", label: "תקלה", action: null, status: "failed", reason: e.message, detail: e.source };
}

export function jobEvent(j: JobRow): TimelineEvent {
  return { id: `j:${j.id}`, at: j.run_at, category: "errors", label: `עבודה שנכשלה: ${JOB_LABEL[j.kind] ?? j.kind}`, action: null, status: "failed", reason: j.last_error, detail: `${j.attempts}/${j.max_attempts} ניסיונות` };
}

export function approvalEvent(a: BillingApprovalRow): TimelineEvent {
  return {
    id: `b:${a.id}`,
    at: a.created_at,
    category: "billing",
    label: `בקשת אישור: ${BILLING_KIND_LABEL[a.kind] ?? a.kind}`,
    action: null,
    status: APPROVAL_STATUS[a.status] ?? "review",
    reason: a.error ?? (a.ccode && a.ccode !== "0" ? `CCode ${a.ccode}` : null),
    detail: a.amount_ils ? formatIls(a.amount_ils) : null,
  };
}

/** The audit rows, the app's errors, the failed jobs and the billing approvals — one list, newest first. */
export function mergeTimeline(input: { audit?: readonly AuditRow[]; errors?: readonly AppErrorRow[]; jobs?: readonly JobRow[]; approvals?: readonly BillingApprovalRow[] }): TimelineEvent[] {
  const events = [
    ...(input.audit ?? []).map(auditEvent),
    ...(input.errors ?? []).map(errorEvent),
    ...(input.jobs ?? []).filter((j) => j.status === "failed").map(jobEvent),
    ...(input.approvals ?? []).map(approvalEvent),
  ];
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// ---------- the activity page's filters ----------

export type ActivityRange = "7" | "30" | "all";
export const RANGE_LABEL: Record<ActivityRange, string> = { "7": "7 ימים", "30": "30 יום", all: "הכול" };
export const ACTIVITY_PAGE_SIZE = 60;

export interface ActivityQuery {
  category: AuditCategory | null;
  range: ActivityRange;
  page: number;
}

const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

export function activityQueryFrom(sp: Readonly<Record<string, string | string[] | undefined>>): ActivityQuery {
  const cat = one(sp.cat);
  const range = one(sp.range);
  const page = Number(one(sp.page));
  return {
    category: cat && (CATEGORY_ORDER as readonly string[]).includes(cat) ? (cat as AuditCategory) : null,
    range: range === "7" || range === "30" || range === "all" ? range : "30",
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

/** Events within the range (counted per category, for the chips), then the category, then one page. */
export function filterActivity(
  events: readonly TimelineEvent[],
  q: ActivityQuery,
  now: Date = new Date(),
): { rows: TimelineEvent[]; total: number; page: number; pages: number; counts: Record<AuditCategory, number>; inRange: number } {
  const since = q.range === "all" ? -Infinity : now.getTime() - Number(q.range) * 86_400_000;
  const ranged = events.filter((e) => Date.parse(e.at) >= since);
  const counts = categoryCounts(ranged);
  const picked = q.category ? ranged.filter((e) => e.category === q.category) : ranged;
  const pages = Math.max(1, Math.ceil(picked.length / ACTIVITY_PAGE_SIZE));
  const page = Math.min(q.page, pages);
  return { rows: picked.slice((page - 1) * ACTIVITY_PAGE_SIZE, page * ACTIVITY_PAGE_SIZE), total: picked.length, page, pages, counts, inRange: ranged.length };
}

export function categoryCounts(events: readonly TimelineEvent[]): Record<AuditCategory, number> {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<AuditCategory, number>;
  for (const e of events) counts[e.category] += 1;
  return counts;
}
