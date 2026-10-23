import { capsLine } from "@/lib/agents/capabilities";
import type { AgentStatus, ResolvedAgent } from "@/lib/agents/policy";
import { BUILTIN_AGENTS } from "@/lib/agents/templates";
import { PLANS, TRIAL_MESSAGES, customAgentLimit, paidPlanOf, type EffectivePlan } from "@/lib/billing/plans";
import type { AgentRole, BuiltinRole, ConnectionRow, SubscriptionRow, UsageRow, WaIdentityRow } from "@/lib/db/types";
import type { AccountArea } from "./areas";

/**
 * Pure helpers for the personal area (/account): what to say and show for a given account state.
 * No framework imports — unit-tested in app/account/account.test.tsx.
 */

const FALLBACK_TZ = "Asia/Jerusalem";

function zonedParts(now: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt(FALLBACK_TZ);
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

/** "בוקר טוב" / "צהריים טובים" / "ערב טוב" / "לילה טוב" by the user's local hour. */
export function greetingFor(now: Date, timeZone: string = FALLBACK_TZ): string {
  const { hour } = zonedParts(now, timeZone);
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 22) return "ערב טוב";
  return "לילה טוב";
}

/** The first word of the name the user gave in the chat ("דנה לוי" → "דנה"), or null. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 24) : null;
}

/** "+972501234567" → "050-123-4567"; Israeli landlines → "03-123-4567"; anything else → "+<digits>". */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.startsWith("972")) {
    const local = `0${d.slice(3)}`;
    if (/^05\d{8}$/.test(local)) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
    if (/^0[2-489]\d{7}$/.test(local)) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
    if (/^07\d{8}$/.test(local)) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return d ? `+${d}` : e164;
}

/** "21.10.2026" in the user's time zone. */
export function formatDay(iso: string, timeZone: string = FALLBACK_TZ): string {
  const { year, month, day } = zonedParts(new Date(iso), timeZone);
  return `${day}.${month}.${year}`;
}

export type ConnectionState = "active" | "expired" | "error" | "none";

/** The row to show for a provider: the newest one that is not revoked (revoked rows are history). */
export function connectionFor(connections: ConnectionRow[], provider: ConnectionRow["provider"]): { row: ConnectionRow | null; state: ConnectionState } {
  const live = connections.filter((c) => c.provider === provider && c.status !== "revoked").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const row = live[0] ?? null;
  return { row, state: row ? (row.status as Exclude<ConnectionState, "none">) : "none" };
}

export function linkedPhones(phones: WaIdentityRow[]): WaIdentityRow[] {
  return phones.filter((p) => p.status !== "unlinked");
}

export type PlanKindView = "trial" | "basic" | "pro";

export interface UsageView {
  plan: PlanKindView;
  used: number;
  limit: number;
  /** paid plans: the first day of the next month ("1.11"), when the monthly allowance starts again */
  resetsOn: string | null;
}

/** Whether the subscription currently grants a paid plan — moved to lib/billing/plans.ts (shared with the agents). */
export { paidPlanOf };

/**
 * The meter's numbers. The usage table keeps one row per period (trial: one period from signup; paid: the calendar
 * month in the user's zone — supabase/migrations/0003), and getCurrentUsage returns the newest row, which can belong to
 * an older period (the trial row right after paying, last month's row on the 1st). Only the current period counts.
 */
export function usageView(sub: SubscriptionRow | null, usage: UsageRow | null, now: Date, timeZone: string = FALLBACK_TZ): UsageView {
  const paid = paidPlanOf(sub, now);
  if (!paid) {
    const isTrialRow = usage?.plan_limit === TRIAL_MESSAGES;
    // a newer paid-period row means the trial was used up before paying (and the plan has since ended)
    const used = usage ? (isTrialRow ? usage.counted_messages : TRIAL_MESSAGES) : 0;
    return { plan: "trial", used: Math.min(used, TRIAL_MESSAGES), limit: TRIAL_MESSAGES, resetsOn: null };
  }
  const { year, month } = zonedParts(now, timeZone);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const used = usage && usage.period_start.slice(0, 7) === monthKey && usage.plan_limit !== TRIAL_MESSAGES ? usage.counted_messages : 0;
  const next = month === 12 ? { m: 1 } : { m: month + 1 };
  return { plan: paid, used, limit: PLANS[paid].messages, resetsOn: `1.${next.m}` };
}

/** One sentence in עלזה's own (feminine, first-person) voice about what is set up and what is missing. */
export function statusLine(opts: { phoneLinked: boolean; microsoft: ConnectionState; google: ConnectionState }): string {
  const { phoneLinked, microsoft, google } = opts;
  if (!phoneLinked) return "עוד לא קושר מספר וואטסאפ. זה הצעד שחסר כדי להתחיל לעבוד יחד.";
  const broken = microsoft === "expired" || microsoft === "error" ? "Outlook" : google === "expired" || google === "error" ? "Gmail" : null;
  if (broken) return `החיבור ל-${broken} הפסיק לעבוד. כדאי לחבר אותו מחדש, ואני ממשיכה מאיפה שעצרנו.`;
  const connected = [microsoft === "active" ? "Outlook" : null, google === "active" ? "Gmail" : null].filter(Boolean) as string[];
  if (!connected.length) return "אני זמינה בוואטסאפ. חיבור למייל וליומן יפתח לי את רוב העבודה.";
  return `אני זמינה בוואטסאפ ומחוברת ל-${connected.join(" ול-")}.`;
}

/** 3000 → "3,000" */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("he-IL").format(n);
}

// ---------------------------------------------------------------- the compact overview at the top of every area

export type ChipTone = "ok" | "warn" | "error" | "off";

export interface StatusChip {
  area: AccountArea;
  label: string;
  tone: ChipTone;
  /** the plan chip: the messages used, drawn as a small bar */
  meter?: { used: number; limit: number };
}

const PLAN_SHORT: Record<PlanKindView, string> = { trial: "ניסיון", basic: "בסיסי", pro: "פרו" };

/**
 * The quick status chips under the greeting — each one a link to its area: the connected accounts, the WhatsApp number,
 * the agents at work and the plan with the messages used. Pure — unit-tested.
 */
export function statusChips(opts: {
  microsoft: ConnectionState;
  google: ConnectionState;
  phone: "linked" | "blocked" | "none";
  activeAgents: number;
  meter: UsageView;
  subscriptionStatus: SubscriptionRow["status"] | null;
}): StatusChip[] {
  const { microsoft, google, phone, activeAgents, meter, subscriptionStatus } = opts;
  const states = [microsoft, google];
  const live = states.filter((s) => s === "active").length;
  const connections: StatusChip = states.some((s) => s === "expired" || s === "error")
    ? { area: "connections", label: "חיבור צריך חידוש", tone: "warn" }
    : { area: "connections", label: live === 0 ? "עוד אין חיבורים" : live === 1 ? "חיבור אחד פעיל" : `${live} חיבורים פעילים`, tone: live ? "ok" : "off" };
  const whatsapp: StatusChip =
    phone === "linked"
      ? { area: "whatsapp", label: "וואטסאפ מקושר", tone: "ok" }
      : phone === "blocked"
        ? { area: "whatsapp", label: "המספר חסום", tone: "error" }
        : { area: "whatsapp", label: "וואטסאפ לא מקושר", tone: "warn" };
  const agents: StatusChip = {
    area: "agents",
    label: activeAgents === 0 ? "אין סוכנים פעילים" : activeAgents === 1 ? "סוכן אחד פעיל" : `${activeAgents} סוכנים פעילים`,
    tone: activeAgents ? "ok" : "off",
  };
  const pastDue = meter.plan !== "trial" && subscriptionStatus === "past_due";
  const plan: StatusChip = {
    area: "plan",
    label: pastDue ? `${PLAN_SHORT[meter.plan]}: התשלום נכשל` : `${PLAN_SHORT[meter.plan]}: ${formatCount(meter.used)} מתוך ${formatCount(meter.limit)} הודעות`,
    tone: pastDue ? "error" : meter.used >= meter.limit ? "warn" : meter.plan !== "trial" && subscriptionStatus === "cancelled" ? "off" : "ok",
    meter: { used: meter.used, limit: meter.limit },
  };
  return [connections, whatsapp, agents, plan];
}

/** The areas that need the user (a honey dot beside them in the navigation): a warning or an error chip. */
export function areasNeedingAttention(chips: readonly StatusChip[]): AccountArea[] {
  return chips.filter((c) => c.tone === "warn" || c.tone === "error").map((c) => c.area);
}

// ---------------------------------------------------------------- agents (docs/design/agents.md §10)

export interface AgentRowView {
  key: string;
  kind: "builtin" | "custom";
  role: AgentRole;
  name: string;
  /** "מובנה" / "על בסיס: מזכירה" / "סוכן משלך" */
  origin: string;
  capsLine: string;
  status: AgentStatus;
  statusLabel: string;
  /** the edit form opens: every custom agent, built-ins on pro */
  editable: boolean;
  deletable: boolean;
  toggle: "enable" | "disable" | null;
  /** one quiet line under the row when there is no form (trial: how to try it; basic: the plan that has it) */
  hint: string | null;
}

export interface AgentsView {
  quotaLine: string;
  rows: AgentRowView[];
  /** a new custom agent fits the plan */
  canCreate: boolean;
  /** the call to action toward a plan that has more (null on pro) */
  upgrade: { label: string } | null;
}

const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  active: "פעיל",
  disabled: "מושבת",
  locked: "נעול: מעבר למכסת המסלול",
  not_in_plan: "כלול במסלול פרו",
};

const TRY_IT: Record<BuiltinRole, string> = {
  secretary: "@מזכירה מה יש לי מחר?",
  intern: "@מתמחה מה כתוב בהסכם של כהן?",
  bookkeeper: "@מנהלת חשבונות אילו חשבוניות הגיעו השבוע?",
};

/** What the "הסוכנים שלי" section shows for the user's agents on their plan. Pure — unit-tested. */
export function agentsView(agents: readonly ResolvedAgent[], plan: EffectivePlan): AgentsView {
  const used = agents.filter((a) => a.kind === "custom").length;
  const limit = customAgentLimit(plan);
  const quotaLine =
    plan === "trial"
      ? "בתקופת הניסיון אפשר לנסות את שלושת הסוכנים המובנים. סוכן משלך נפתח עם מנוי."
      : plan === "basic"
        ? `סוכנים משלך: ${used} מתוך ${limit}. הסוכנים המובנים כלולים במסלול פרו.`
        : `סוכנים משלך: ${used} מתוך ${limit}, בנוסף לשלושת הסוכנים המובנים.`;
  const rows = agents.map((a): AgentRowView => {
    const builtin = a.kind === "builtin";
    const editable = builtin ? plan === "pro" : true;
    return {
      key: a.key,
      kind: a.kind,
      role: a.role,
      name: a.name,
      origin: builtin ? "מובנה" : a.template ? `על בסיס: ${BUILTIN_AGENTS[a.template].name}` : "סוכן משלך",
      capsLine: capsLine(a.capabilities),
      status: a.status,
      statusLabel: AGENT_STATUS_LABEL[a.status],
      editable,
      deletable: !builtin,
      toggle: !editable || a.status === "not_in_plan" ? null : a.status === "disabled" ? "enable" : a.status === "locked" ? null : "disable",
      hint: builtin && plan === "trial" ? `לנסות בוואטסאפ: ״${TRY_IT[a.role as BuiltinRole]}״` : null,
    };
  });
  return {
    quotaLine,
    rows,
    canCreate: used < limit,
    upgrade: plan === "trial" ? { label: "להפעלת מנוי" } : plan === "basic" ? { label: "לשדרוג לפרו" } : null,
  };
}
