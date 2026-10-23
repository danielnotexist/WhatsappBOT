import { BRAND } from "@/lib/brand";
import type { ConnectionProvider, SubscriptionRow } from "@/lib/db/types";

/** Pricing decided after the plan (PROGRESS.md): 99 ₪ / 750 messages, 299 ₪ / fair use 3,000. Prices include VAT. */
export type PaidPlan = "basic" | "pro";
/** The plan in force right now (mirrors SQL `user_plan`): a paid plan, or the trial. */
export type EffectivePlan = "trial" | PaidPlan;

export interface PlanSpec {
  priceIls: number;
  messages: number;
  nameHe: string;
  /** custom agents the user may create (SQL `agent_custom_limit` — docs/design/agents.md §2.2) */
  customAgents: number;
  /** the three built-in agents (מזכירה / מתמחה / מנהלת חשבונות), editable and switchable */
  builtinAgents: boolean;
}

export const PLANS: Record<PaidPlan, PlanSpec> = {
  basic: { priceIls: 99, messages: 750, nameHe: "בסיסי", customAgents: 1, builtinAgents: false },
  pro: { priceIls: 299, messages: 3000, nameHe: "פרו", customAgents: 3, builtinAgents: true },
};

export const TRIAL_MESSAGES = 10;
/** Trial: the built-ins as they are (no editing), no custom agents (docs/design/agents.md §0.3). */
export const TRIAL_CUSTOM_AGENTS = 0;
export const TRIAL_BUILTIN_AGENTS = true;
export const VAT_RATE = 0.18;

export function isPaidPlan(p: unknown): p is PaidPlan {
  return p === "basic" || p === "pro";
}

/** Whether the subscription currently grants a paid plan (cancelled plans run until the end of the paid period). */
export function paidPlanOf(sub: Pick<SubscriptionRow, "plan" | "status" | "next_charge_at"> | null, now: Date): PaidPlan | null {
  if (!sub || !isPaidPlan(sub.plan)) return null;
  if (sub.status === "active" || sub.status === "past_due") return sub.plan;
  if (sub.status === "cancelled" && sub.next_charge_at && Date.parse(sub.next_charge_at) > now.getTime()) return sub.plan;
  return null;
}

/** The plan in force — the TypeScript twin of SQL `public.user_plan` (0003). */
export function effectivePlan(sub: Pick<SubscriptionRow, "plan" | "status" | "next_charge_at"> | null, now: Date): EffectivePlan {
  return paidPlanOf(sub, now) ?? "trial";
}

/** Custom agents allowed on a plan: 0 / 1 / 3 (= SQL `agent_custom_limit`). */
export function customAgentLimit(plan: EffectivePlan): number {
  return plan === "trial" ? TRIAL_CUSTOM_AGENTS : PLANS[plan].customAgents;
}

/** Whether the built-in agents are available on a plan (trial: as they are; basic: no; pro: yes, editable). */
export function builtinAgentsIncluded(plan: EffectivePlan): boolean {
  return plan === "trial" ? TRIAL_BUILTIN_AGENTS : PLANS[plan].builtinAgents;
}

// ---------------------------------------------------------------------------------------------
// entitlements: what each plan includes (Daniel's split of 23.10.2026) — the single source for the code that enforces
// it (the OAuth start routes, the tools offered to the model, the services in /account, the account context) and for
// every place that describes it (the landing's price list, the pay page, the support chat, the system prompt)
// ---------------------------------------------------------------------------------------------

export interface Entitlements {
  plan: EffectivePlan;
  messages: number;
  /** connected accounts the assistant works with: 1 = Google OR Microsoft, 2 = both together */
  maxProviders: 1 | 2;
  /** Google Tasks / Microsoft To Do */
  tasks: boolean;
  /** SharePoint sites and libraries (search and read) */
  sharepoint: boolean;
  /** new files in the user's storage (gdrive_save_doc) */
  fileCreate: boolean;
  /** every file in Google Drive: search and read existing Docs / Sheets / Slides (the drive.readonly feature) */
  driveFullRead: boolean;
  /** coming: meeting summaries */
  meetingSummaries: boolean;
  /**
   * proactive alerts from mail and calendar ("דברים שכדאי לא לפספס" in the morning summary, up to 2 urgent alerts a
   * day) and phishing / BEC warnings — lib/proactive
   */
  proactive: boolean;
  /** coming: business systems (monday.com and others) */
  businessSystems: boolean;
  /** the three built-in agents (trial: as they are; pro: editable) */
  builtinAgents: boolean;
  customAgents: number;
}

/** The capabilities only pro has (basic and the trial have none of them). */
type ProFlag = "tasks" | "sharepoint" | "fileCreate" | "driveFullRead" | "meetingSummaries" | "proactive" | "businessSystems";
const NONE: Record<ProFlag, false> = { tasks: false, sharepoint: false, fileCreate: false, driveFullRead: false, meetingSummaries: false, proactive: false, businessSystems: false };
const ALL: Record<ProFlag, true> = { tasks: true, sharepoint: true, fileCreate: true, driveFullRead: true, meetingSummaries: true, proactive: true, businessSystems: true };

/**
 * What a plan includes. The trial is basic in capabilities (one account, no pro services: the upgrade has something
 * to add), with its own message count and the built-in agents as they are (docs/design/agents.md §0.3).
 */
export function entitlements(plan: EffectivePlan): Entitlements {
  if (plan === "pro") return { plan, messages: PLANS.pro.messages, maxProviders: 2, ...ALL, builtinAgents: PLANS.pro.builtinAgents, customAgents: PLANS.pro.customAgents };
  if (plan === "basic") return { plan, messages: PLANS.basic.messages, maxProviders: 1, ...NONE, builtinAgents: PLANS.basic.builtinAgents, customAgents: PLANS.basic.customAgents };
  return { plan, messages: TRIAL_MESSAGES, maxProviders: 1, ...NONE, builtinAgents: TRIAL_BUILTIN_AGENTS, customAgents: TRIAL_CUSTOM_AGENTS };
}

/**
 * A pro service the model may be asked for on a plan without it: the `pro_feature` tool answers with the plan line
 * (lib/ai/plan-tools.ts). `label` completes "במסלול פרו יש גם …".
 */
export type ProFeature = "second_account" | "tasks" | "sharepoint" | "file_create" | "drive_full_read" | "proactive";
export const PRO_FEATURES: Record<ProFeature, { label: string; included: (e: Entitlements) => boolean }> = {
  second_account: { label: "חיבור של Google ושל Microsoft יחד", included: (e) => e.maxProviders > 1 },
  tasks: { label: "משימות ב-Google Tasks וב-Microsoft To Do", included: (e) => e.tasks },
  sharepoint: { label: "חיפוש וקריאה ב-SharePoint של הארגון", included: (e) => e.sharepoint },
  file_create: { label: "שמירת מסמכים חדשים ב-Google Drive", included: (e) => e.fileCreate },
  drive_full_read: { label: "חיפוש וקריאה בכל הקבצים ב-Google Drive (Docs, Sheets ו-Slides)", included: (e) => e.driveFullRead },
  proactive: { label: "התראות יזומות מהמייל ומהיומן ואזהרות פישינג", included: (e) => e.proactive },
};

/** The pro services a plan does not include (empty on pro). */
export function missingProFeatures(plan: EffectivePlan): ProFeature[] {
  const e = entitlements(plan);
  return (Object.keys(PRO_FEATURES) as ProFeature[]).filter((f) => !PRO_FEATURES[f].included(e));
}

// ---------------------------------------------------------------------------------------------
// the plans in words (site text: the short hyphen only) — generated from the entitlements above
// ---------------------------------------------------------------------------------------------

export interface PlanFeatureLine {
  id: string;
  text: string;
  /** included in the plan once it ships ("בקרוב" next to it) */
  soon?: boolean;
}

const agentsHe = (n: number) => (n === 1 ? "סוכן אחד" : `עד ${n} סוכנים`);

/** Basic's list: what one account gives. */
function basicLines(): PlanFeatureLine[] {
  const b = entitlements("basic");
  return [
    { id: "account", text: "חשבון אחד: Google או Microsoft" },
    { id: "mail", text: "מייל: קריאה, סיכום וניסוח. שליחה רק באישור" },
    { id: "calendar", text: "יומן: קביעה והזזה של פגישות, כולל קישור Meet או Teams" },
    { id: "files", text: `קריאת קבצים: Word ו-Excel ב-OneDrive, וב-Drive קבצים שנפתחו דרך ${BRAND.name}` },
    { id: "routine", text: "תזכורות, סיכום בוקר והודעות קוליות" },
    { id: "agents", text: `${agentsHe(b.customAgents)} משלך, עם הנחיות ויכולות שבוחרים` },
  ];
}

/** Pro's list after "כל מה שבבסיסי, ובנוסף:" — each line only when pro has it and basic does not. */
function proLines(): PlanFeatureLine[] {
  const b = entitlements("basic");
  const p = entitlements("pro");
  const adds = (k: ProFlag | "builtinAgents") => p[k] && !b[k];
  const lines: (PlanFeatureLine | false)[] = [
    p.maxProviders > b.maxProviders && { id: "accounts", text: "חיבור של Google ו-Microsoft יחד" },
    adds("tasks") && { id: "tasks", text: "משימות ב-Google Tasks וב-Microsoft To Do" },
    adds("driveFullRead") && { id: "drive", text: "חיפוש וקריאה בכל ה-Drive: Docs, Sheets ו-Slides" },
    adds("sharepoint") && { id: "sharepoint", text: "חיפוש ב-SharePoint, בספריות המסמכים של הארגון" },
    adds("fileCreate") && { id: "file_create", text: "שמירת מסמכים חדשים ב-Drive" },
    adds("builtinAgents") && { id: "agents", text: `שלושת הסוכנים המובנים, ו${agentsHe(p.customAgents)} משלך` },
    adds("meetingSummaries") && { id: "meetings", text: "סיכומי פגישות", soon: true },
    adds("proactive") && { id: "proactive", text: "התראות יזומות ואזהרות פישינג" },
    adds("businessSystems") && { id: "business", text: "חיבור למערכות העסק, כמו monday.com", soon: true },
  ];
  return lines.filter((l): l is PlanFeatureLine => Boolean(l));
}

/** A paid plan in words: the lead line ("כל מה שבבסיסי, ובנוסף:") and its features. */
export function planFeatures(plan: PaidPlan): { lead: string | null; lines: PlanFeatureLine[] } {
  return plan === "basic" ? { lead: null, lines: basicLines() } : { lead: "כל מה שבבסיסי, ובנוסף:", lines: proLines() };
}

// ---------------------------------------------------------------------------------------------
// one account on basic and in the trial
// ---------------------------------------------------------------------------------------------

type ConnectionLike = { provider: ConnectionProvider; status: string; created_at: string };

/**
 * The account a one-account plan works with: the provider of the newest active connection (the user's latest choice;
 * a reconnect keeps a row's created_at). Null when nothing is active.
 */
export function primaryProvider(connections: readonly ConnectionLike[]): ConnectionProvider | null {
  let best: ConnectionLike | null = null;
  for (const c of connections) if (c.status === "active" && (!best || c.created_at >= best.created_at)) best = c;
  return best?.provider ?? null;
}

/**
 * Which connected accounts the plan works with. Pro: every active one. Basic and the trial: one, the newest active
 * connection's provider. A second account connected before the split (or kept after a downgrade) is neither deleted
 * nor disconnected: it is `paused` (the tools, the morning summary and the account context leave it out) until the
 * user disconnects one of the two or upgrades (docs/PROGRESS.md, "מסלולים").
 */
export function providerGate(connections: readonly ConnectionLike[], plan: EffectivePlan): { inForce: ConnectionProvider[]; paused: ConnectionProvider[] } {
  const active = [...new Set(connections.filter((c) => c.status === "active").map((c) => c.provider))];
  if (entitlements(plan).maxProviders > 1 || active.length < 2) return { inForce: active, paused: [] };
  const primary = primaryProvider(connections)!;
  return { inForce: [primary], paused: active.filter((p) => p !== primary) };
}

/** The connections the assistant uses on this plan: the rows of a paused account are left out. */
export function connectionsInForce<T extends ConnectionLike>(connections: readonly T[], plan: EffectivePlan): T[] {
  const { paused } = providerGate(connections, plan);
  return paused.length ? connections.filter((c) => !paused.includes(c.provider)) : [...connections];
}

/** May the user connect (or reconnect) this provider on this plan? One-account plans: only the account in force. */
export function mayConnect(connections: readonly ConnectionLike[], plan: EffectivePlan, provider: ConnectionProvider): boolean {
  if (entitlements(plan).maxProviders > 1) return true;
  const primary = primaryProvider(connections);
  return primary === null || primary === provider;
}

/**
 * Monthly renewal attempts by day, day 1 = the due date (PLAN §4 + the owner's decision of 21.10.2026):
 * the charge on day 1 and automatic retries on days 3, 5 and 7. A WhatsApp nudge with [ניסיון חוזר] [עדכון כרטיס]
 * follows the day 1 / 3 / 5 failures; after the day-7 failure the account is paused gracefully (past_due).
 * A "card" failure (blocked / invalid token) is never retried automatically — the account waits for a card update
 * and is paused on day 7.
 */
export const CHARGE_RETRY_DAYS = [1, 3, 5, 7] as const;
export const MAX_CHARGE_FAILURES = CHARGE_RETRY_DAYS.length;
export const PAUSE_DAY = CHARGE_RETRY_DAYS[CHARGE_RETRY_DAYS.length - 1];

/** When attempt number `attempt` (0 = the due-date charge) of the cycle due at `due` runs. */
export function chargeAttemptAt(due: Date, attempt: number): Date {
  const day = CHARGE_RETRY_DAYS[Math.min(attempt, CHARGE_RETRY_DAYS.length - 1)]!;
  return new Date(due.getTime() + (day - 1) * 86_400_000);
}

/** Next monthly due date: same day next month, clamped to the month's length. */
export function addOneMonth(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}
