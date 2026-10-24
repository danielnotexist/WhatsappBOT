import { PLANS } from "@/lib/billing/plans";
import type { AdminDailyRow, AdminUserRow, JobRow, PlanKind, SubscriptionStatus, SupportTicketStatus } from "@/lib/db/types";
import { sourceLabel } from "./source";

/**
 * The admin panel's pure views (app/admin): filters, the "צריך עזרה" list, the overview's figures and the Hebrew words
 * for states. Client-safe: no data access, no request APIs — tested directly.
 */

export const ADMIN_TZ = "Asia/Jerusalem";

// ---------- words ----------

export const PLAN_LABEL: Record<PlanKind, string> = { trial: "ניסיון", basic: "בסיסי", pro: "פרו" };
export const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = { trial: "ניסיון", active: "פעיל", past_due: "תשלום נכשל", cancelled: "בוטל" };
export const TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = { open: "פתוחה", in_progress: "בטיפול", closed: "סגורה" };
export const ONBOARDING_LABEL: Record<string, string> = {
  welcome: "פתיחה",
  first_task: "משימה ראשונה",
  ask_name: "שאלת שם",
  ask_business: "שאלת עסק",
  ask_pain: "מה מעמיס",
  ask_morning_time: "שעת סיכום בוקר",
  connect: "חיבור מייל",
  done: "הסתיימה",
};

/** Where a user stands on the way in: the furthest step reached. */
export type Stage = "signed_up" | "whatsapp" | "connected" | "paid";
export const STAGE_LABEL: Record<Stage, string> = { signed_up: "נרשם", whatsapp: "קישר וואטסאפ", connected: "חיבר מייל", paid: "שילם" };
export const STAGES: readonly Stage[] = ["signed_up", "whatsapp", "connected", "paid"];

export function stageOf(u: Pick<AdminUserRow, "wa_linked" | "connections_ever" | "paid">): Stage {
  if (u.paid) return "paid";
  if (u.connections_ever > 0) return "connected";
  if (u.wa_linked) return "whatsapp";
  return "signed_up";
}

// ---------- numbers and times ----------

const he = new Intl.NumberFormat("he-IL");
const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export const formatInt = (n: number): string => he.format(Math.round(n));
export const formatIls = (n: number): string => ils.format(n);

/** Dollars: cents below $10, whole dollars above; a tiny non-zero cost is "פחות מסנט". */
export function formatUsd(n: number): string {
  if (!n) return "$0";
  if (n < 0.01) return "פחות מסנט";
  return n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "לפני 5 דקות", "אתמול", "לפני 4 ימים"; older than a month → the date. */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "אף פעם";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "לא ידוע";
  const diff = (ms - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "עכשיו";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return formatDate(iso);
}

export function formatDate(iso: string, timeZone: string = ADMIN_TZ): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone, day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string = ADMIN_TZ): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone, day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** "3.10" for a YYYY-MM-DD day key (chart axes). */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}`;
}

/** +972501234567 → 050-123-4567 (Israeli numbers), anything else as it is. */
export function formatPhoneIl(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length === 12) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return e164;
}

/** "העתקת פרטים": who the user is, as plain lines to paste into a reply or a note. */
export function userDetails(user: { id: string; name: string | null; business_name: string | null; email: string }, phone: string | null, plan?: string): string {
  return [`שם: ${user.name ?? "-"}`, `עסק: ${user.business_name ?? "-"}`, `מייל: ${user.email}`, `טלפון: ${phone ? formatPhoneIl(phone) : "-"}`, ...(plan ? [`תוכנית: ${plan}`] : []), `מזהה: ${user.id}`].join("\n");
}

/** wa.me link for a number (digits only). */
export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

/** Where on the site a chat was opened, in words ("בדף הבית"); null for any other path (shown as it is). */
const PAGE_PLACE: Record<string, string> = {
  "/": "בדף הבית",
  "/pricing": "בדף המחירים",
  "/account": "באזור האישי",
  "/terms": "בתנאי השימוש",
  "/privacy": "במדיניות הפרטיות",
  "/accessibility": "בהצהרת הנגישות",
};
export function pagePlace(path: string): string | null {
  return PAGE_PLACE[path] ?? null;
}

// ---------- the users list ----------

export type UserProblem = "help" | "broken" | "billing" | "stuck" | "errors" | "limit";
export type UserSort = "created" | "seen" | "messages" | "cost" | "errors";

export interface UserQuery {
  q?: string;
  plan?: PlanKind;
  status?: SubscriptionStatus | "none";
  problem?: UserProblem;
  sort?: UserSort;
  page?: number;
}

export const USER_PAGE_SIZE = 50;
export const USER_SORT_LABEL: Record<UserSort, string> = { created: "נרשמו לאחרונה", seen: "נראו לאחרונה", messages: "הכי הרבה הודעות", cost: "עלות AI", errors: "הכי הרבה תקלות" };
export const PROBLEM_LABEL: Record<UserProblem, string> = {
  help: "צריך עזרה (הכול)",
  broken: "חיבור שפג או נכשל",
  billing: "תשלום שנכשל",
  stuck: "נתקע בהרשמה",
  errors: "תקלות חוזרות",
  limit: "הגיע למגבלה",
};

const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

/** The query from the URL (anything unknown is dropped). */
export function userQueryFrom(sp: Readonly<Record<string, string | string[] | undefined>>): UserQuery {
  const plan = one(sp.plan);
  const status = one(sp.status);
  const problem = one(sp.problem);
  const sort = one(sp.sort);
  const page = Number(one(sp.page));
  return {
    q: one(sp.q)?.trim().slice(0, 120) || undefined,
    plan: plan && plan in PLAN_LABEL ? (plan as PlanKind) : undefined,
    status: status === "none" || (status && status in SUB_STATUS_LABEL) ? (status as UserQuery["status"]) : undefined,
    problem: problem && problem in PROBLEM_LABEL ? (problem as UserProblem) : undefined,
    sort: sort && sort in USER_SORT_LABEL ? (sort as UserSort) : undefined,
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 1000) : undefined,
  };
}

/** Which problems a user has right now (the "צריך עזרה" rules, per user). */
export function problemsOf(u: AdminUserRow, now: Date = new Date()): Exclude<UserProblem, "help">[] {
  const out: Exclude<UserProblem, "help">[] = [];
  if (u.connections_broken > 0) out.push("broken");
  if (u.sub_status === "past_due" || u.charge_failures > 0) out.push("billing");
  if (!u.wa_linked && now.getTime() - Date.parse(u.created_at) > 24 * 3_600_000) out.push("stuck");
  if (u.errors_7d >= 3 || u.failed_jobs_7d > 0) out.push("errors");
  if (u.usage_limit !== null && u.usage_used !== null && u.usage_limit > 0 && u.usage_used >= u.usage_limit) out.push("limit");
  return out;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

export function filterUsers(rows: readonly AdminUserRow[], query: UserQuery, now: Date = new Date()): { rows: AdminUserRow[]; total: number; page: number; pages: number } {
  const q = query.q?.toLowerCase();
  const qDigits = q ? digitsOf(q) : "";
  let out = rows.filter((u) => {
    if (q) {
      const hay = [u.email, u.name ?? "", u.business_name ?? ""].join(" ").toLowerCase();
      const phone = u.phone ? digitsOf(u.phone) : "";
      // a local number (050…) matches the stored +97250…
      const local = qDigits.startsWith("0") ? `972${qDigits.slice(1)}` : qDigits;
      if (!hay.includes(q) && !(qDigits.length >= 4 && phone && (phone.includes(qDigits) || phone.includes(local)))) return false;
    }
    if (query.plan && u.plan !== query.plan) return false;
    if (query.status && (query.status === "none" ? u.sub_status !== null : u.sub_status !== query.status)) return false;
    if (query.problem) {
      const p = problemsOf(u, now);
      if (query.problem === "help" ? p.length === 0 : !p.includes(query.problem)) return false;
    }
    return true;
  });
  const key: Record<UserSort, (u: AdminUserRow) => number> = {
    created: (u) => Date.parse(u.created_at),
    seen: (u) => (u.last_seen_at ? Date.parse(u.last_seen_at) : 0),
    messages: (u) => u.messages_30d,
    cost: (u) => u.ai_cost_30d,
    errors: (u) => u.errors_7d + u.failed_jobs_7d,
  };
  const by = key[query.sort ?? "created"];
  out = out.slice().sort((a, b) => by(b) - by(a) || b.created_at.localeCompare(a.created_at));
  const total = out.length;
  const pages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
  const page = Math.min(query.page ?? 1, pages);
  return { rows: out.slice((page - 1) * USER_PAGE_SIZE, page * USER_PAGE_SIZE), total, page, pages };
}

// ---------- "צריך עזרה" ----------

export interface HelpItem {
  kind: Exclude<UserProblem, "help">;
  userId: string;
  who: string;
  /** what exactly, in a few words */
  detail: string;
  /** when it started, as far as we know (ISO) */
  since: string | null;
}

export const HELP_ORDER: readonly Exclude<UserProblem, "help">[] = ["billing", "broken", "errors", "limit", "stuck"];

/** One list across users: a failed payment first, then broken connections, failing work, the limit, stuck sign-ups. */
export function helpItems(rows: readonly AdminUserRow[], failedJobs: readonly JobRow[], now: Date = new Date()): HelpItem[] {
  const jobsBy = new Map<string, JobRow[]>();
  for (const j of failedJobs) if (j.user_id) jobsBy.set(j.user_id, [...(jobsBy.get(j.user_id) ?? []), j]);
  const items: HelpItem[] = [];
  for (const u of rows) {
    const who = u.name || u.business_name || u.email;
    for (const kind of problemsOf(u, now)) {
      let detail = "";
      let since: string | null = null;
      if (kind === "billing") detail = u.sub_status === "past_due" ? `החיוב החודשי נכשל (${formatInt(u.charge_failures)} ניסיונות)` : `${formatInt(u.charge_failures)} חיובים שנכשלו`;
      else if (kind === "broken") detail = u.connections_broken === 1 ? "חיבור אחד פג או נכשל" : `${formatInt(u.connections_broken)} חיבורים פגו או נכשלו`;
      else if (kind === "errors") {
        const jobs = jobsBy.get(u.id) ?? [];
        const parts = [u.errors_7d ? `${formatInt(u.errors_7d)} תקלות בשבוע` : "", u.failed_jobs_7d ? `${formatInt(u.failed_jobs_7d)} עבודות שנכשלו` : ""].filter(Boolean);
        detail = parts.join(", ") + (jobs[0]?.last_error ? `: ${jobs[0].last_error.slice(0, 80)}` : "");
      } else if (kind === "limit") detail = `${formatInt(u.usage_used ?? 0)} מתוך ${formatInt(u.usage_limit ?? 0)} הודעות`;
      else {
        detail = "עוד לא קישר וואטסאפ מאז ההרשמה";
        since = u.created_at;
      }
      items.push({ kind, userId: u.id, who, detail, since });
    }
  }
  return items.sort((a, b) => HELP_ORDER.indexOf(a.kind) - HELP_ORDER.indexOf(b.kind));
}

// ---------- the overview ----------

export interface Kpis {
  users: number;
  newThisWeek: number;
  activeToday: number;
  activeWeek: number;
  mrrIls: number;
  paying: number;
  aiToday: number;
  aiMonth: number;
}

/** The headline figures. `daily` must cover the last 30 days, oldest first, ending today. */
export function kpis(rows: readonly AdminUserRow[], daily: readonly AdminDailyRow[], now: Date = new Date()): Kpis {
  const week = now.getTime() - 7 * 86_400_000;
  const today = daily.at(-1);
  const paying = rows.filter((u) => (u.sub_status === "active" || u.sub_status === "past_due") && u.plan !== "trial");
  const monthKey = today?.day.slice(0, 7);
  return {
    users: rows.length,
    newThisWeek: rows.filter((u) => Date.parse(u.created_at) >= week).length,
    activeToday: today?.active_users ?? 0,
    activeWeek: rows.filter((u) => u.last_seen_at && Date.parse(u.last_seen_at) >= week).length,
    mrrIls: paying.reduce((sum, u) => sum + (u.plan === "trial" ? 0 : PLANS[u.plan].priceIls), 0),
    paying: paying.length,
    aiToday: today?.ai_cost ?? 0,
    aiMonth: daily.filter((d) => monthKey && d.day.startsWith(monthKey)).reduce((sum, d) => sum + d.ai_cost, 0),
  };
}

export interface Share {
  key: string;
  label: string;
  count: number;
}

export function funnel(rows: readonly AdminUserRow[]): Share[] {
  const reached = (s: Stage) => rows.filter((u) => STAGES.indexOf(stageOf(u)) >= STAGES.indexOf(s)).length;
  return STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], count: reached(s) }));
}

export function planSplit(rows: readonly AdminUserRow[]): Share[] {
  return (["trial", "basic", "pro"] as const).map((p) => ({ key: p, label: PLAN_LABEL[p], count: rows.filter((u) => u.plan === p).length }));
}

/** The sign-up sources, biggest first; past `top` they fold into "אחר". */
export function sourceSplit(rows: readonly AdminUserRow[], top = 6): Share[] {
  const counts = new Map<string, number>();
  for (const u of rows) {
    const label = sourceLabel(u.signup_source);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, top).map(([label, count]) => ({ key: label, label, count }));
  const rest = sorted.slice(top).reduce((sum, [, n]) => sum + n, 0);
  return rest ? [...head, { key: "other", label: "אחר", count: rest }] : head;
}
