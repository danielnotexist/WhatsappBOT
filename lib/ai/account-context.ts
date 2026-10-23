import { BUILTIN_AGENTS, BUILTIN_ORDER } from "@/lib/agents/templates";
import { PLANS, TRIAL_MESSAGES, builtinAgentsIncluded, customAgentLimit, effectivePlan, isPaidPlan, type EffectivePlan, type PaidPlan } from "@/lib/billing/plans";
import type { ConnectionProvider, SubscriptionRow } from "@/lib/db/types";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, hasScope } from "@/lib/google/oauth";
import { MS_SCOPES } from "@/lib/ms/oauth";
import { DEFAULT_TZ, dayLabelHe, localDateOf } from "@/lib/time/zoned";

/**
 * What the assistant knows about the account (docs/PLAN.md §3/§4, Daniel's live test 23.10.2026): the plan in force
 * from the subscription and the usage counter, the agents, and what each connection can do according to its granted
 * scopes. Facts only — the prompt tells the model to answer from these lines and nothing else, so "איזה מנוי אני?",
 * "אפשר ליצור סוכן?" and "תהיה לך גישה ל-Drive?" get the real answer instead of a guess.
 */
export interface AccountContext {
  plan: EffectivePlan;
  /** the subscription's state for a paid plan; "trial" otherwise */
  status: "trial" | "active" | "cancelled" | "past_due";
  /** messages left in the trial / this month after the current one; null = unknown */
  messagesLeft: number | null;
  /** next charge (active) or the end of the paid period (cancelled), ISO */
  periodEnd: string | null;
  /** a downgrade waiting for the next charge */
  scheduledPlan: PaidPlan | null;
}

/** The plan in force and what is left of it — `remaining` is what the usage counter returned for this message. */
export function accountContextOf(sub: SubscriptionRow | null, remaining: number | null, now: Date): AccountContext {
  const plan = effectivePlan(sub, now);
  const paid = plan !== "trial" && sub !== null;
  return {
    plan,
    // a paid plan is in force only while active, past_due or cancelled-with-time-left (paidPlanOf)
    status: paid ? (sub.status as AccountContext["status"]) : "trial",
    messagesLeft: remaining === null ? null : Math.max(0, remaining),
    periodEnd: paid ? sub.next_charge_at : null,
    scheduledPlan: paid && isPaidPlan(sub.scheduled_plan) && sub.scheduled_plan !== sub.plan ? sub.scheduled_plan : null,
  };
}

const dayOf = (iso: string, tz: string) => dayLabelHe(localDateOf(new Date(iso), tz));
const customAgentsHe = (n: number) => (n === 0 ? "בלי סוכנים משלך" : n === 1 ? "סוכן אחד משלך" : `עד ${n} סוכנים משלך`);
const BUILTIN_NAMES = BUILTIN_ORDER.map((r) => BUILTIN_AGENTS[r].name).join(", ");

/** One line per plan, from lib/billing/plans.ts — the only plan facts the model may state. */
export function planFactsLines(): string[] {
  const builtins = (included: boolean, editable: boolean) => (included ? `שלושת הסוכנים המובנים (${BUILTIN_NAMES})${editable ? "" : " כמו שהם"}` : "בלי הסוכנים המובנים");
  const paid = (p: PaidPlan) => {
    const s = PLANS[p];
    return `- מסלול ${s.nameHe}: ${s.priceIls} ₪ לחודש כולל מע״מ, עד ${s.messages.toLocaleString("en-US")} הודעות בחודש, ${builtins(s.builtinAgents, true)}, ${customAgentsHe(s.customAgents)}.`;
  };
  return [`- תקופת ניסיון: ${TRIAL_MESSAGES} הודעות, ${builtins(builtinAgentsIncluded("trial"), false)}, ${customAgentsHe(customAgentLimit("trial"))}.`, paid("basic"), paid("pro")];
}

/** "## החשבון" — the user's plan, what is left, and the agents available right now. */
export function accountLines(a: AccountContext, agentNames: readonly string[], tz: string = DEFAULT_TZ): string[] {
  const lines: string[] = [];
  const limit = a.plan === "trial" ? TRIAL_MESSAGES : PLANS[a.plan].messages;
  // the basis is stated: this message is counted already (״מצב המנוי״ reports before counting — one more)
  const left = a.messagesLeft === null ? "" : ` נשארו ${a.messagesLeft.toLocaleString("en-US")} מתוך ${limit.toLocaleString("en-US")} הודעות${a.plan === "trial" ? "" : " החודש"} (ההודעה הנוכחית כבר נספרה).`;
  if (a.plan === "trial") {
    lines.push(`- מסלול: תקופת ניסיון (אין מנוי בתשלום).${left}`);
  } else {
    const s = PLANS[a.plan];
    const head = `- מסלול: ${s.nameHe} (${s.priceIls} ₪ לחודש)`;
    if (a.status === "cancelled") lines.push(`${head} — המנוי בוטל, והמסלול פעיל${a.periodEnd ? ` עד ${dayOf(a.periodEnd, tz)}` : " עד סוף התקופה"}.${left}`);
    else if (a.status === "past_due") lines.push(`${head} — מושהה עד להסדרת התשלום.`);
    else lines.push(`${head}, פעיל.${left}${a.periodEnd ? ` החיוב הבא: ${dayOf(a.periodEnd, tz)}.` : ""}`);
    if (a.scheduledPlan && a.periodEnd) lines.push(`- מתוכנן מעבר למסלול ${PLANS[a.scheduledPlan].nameHe} ב-${dayOf(a.periodEnd, tz)}.`);
  }
  lines.push(`- סוכנים במסלול הזה: ${builtinAgentsIncluded(a.plan) ? `שלושת המובנים${a.plan === "trial" ? " (כמו שהם)" : ""}` : "בלי המובנים"}, ${customAgentsHe(customAgentLimit(a.plan))}.`);
  lines.push(agentNames.length ? `- סוכנים פעילים עכשיו: ${agentNames.map((n) => `״${n}״`).join(", ")}.` : "- אין כרגע סוכנים פעילים.");
  if (a.plan !== "pro") lines.push(`- שדרוג${a.plan === "trial" ? " או הפעלת מנוי" : " לפרו"}: הכלי start_upgrade.`);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// connections → what they allow (granted scopes)
// ---------------------------------------------------------------------------------------------

export interface ConnectionFacts {
  provider: ConnectionProvider;
  accountEmail: string | null;
  /** granted scopes as stored on the connection; empty = unknown → the set the app requests */
  scopes: readonly string[];
}

/**
 * drive.file in plain words — including what it does NOT cover. Sonnet once added "או ששותפו איתי" on its own: files
 * shared with the user are outside drive.file, so the line says so explicitly.
 */
const DRIVE_FILE_NOTE =
  "קבצים ב-Google Drive — רק קבצים שנוצרו או נפתחו דרכי (הרשאת drive.file). אין גישה לשאר הקבצים ב-Drive, גם לא לקבצים או לתיקיות ששותפו עם המשתמש — וכך לענות אם שואלים";

/**
 * Google: one phrase per granted scope. Gmail reading needs the scope AND the feature on (`gmailRead`: the read tools
 * exist); `null` = not connected yet — reading is open to the first users only, behind one more consent.
 */
function googleCan(scopes: readonly string[], gmailRead: boolean | null): string[] {
  const can: string[] = [];
  if (hasScope(scopes, GOOGLE_SCOPES.calendarEvents)) can.push("יומן Google — הצגה, קביעה, הזזה וביטול של פגישות (אחרי אישור בכפתור), כולל פגישה עם קישור Google Meet");
  if (hasScope(scopes, GOOGLE_SCOPES.gmailSend)) can.push("שליחת מיילים מ-Gmail — רק אחרי אישור בכפתור");
  if (gmailRead === null) can.push("קריאת מיילים ב-Gmail — בשלב הזה רק למשתמשים הראשונים, עם אישור נוסף מ-Google");
  else can.push(hasScope(scopes, GOOGLE_SCOPES.gmailReadonly) && gmailRead ? "קריאה, חיפוש וסיכום של מיילים ב-Gmail" : "קריאת מיילים ב-Gmail — עדיין אין הרשאה (הכלי gmail_read_status מסביר מה אפשר)");
  if (hasScope(scopes, GOOGLE_SCOPES.driveFile)) can.push(DRIVE_FILE_NOTE);
  return can;
}

const msHas = (scopes: readonly string[], scope: string) => scopes.some((s) => s.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase() === scope.toLowerCase());

/** Microsoft 365: Mail.ReadWrite / Mail.Send / Calendars.ReadWrite / Files.Read.All (lib/ms/oauth.ts MS_SCOPES). */
function microsoftCan(scopes: readonly string[]): string[] {
  const can: string[] = [];
  if (msHas(scopes, "Mail.ReadWrite")) can.push("מייל Outlook — קריאה, חיפוש, סיכום והעברה (העברה אחרי אישור בכפתור)");
  if (msHas(scopes, "Mail.Send")) can.push("שליחת מיילים מ-Outlook — רק אחרי אישור בכפתור");
  if (msHas(scopes, "Calendars.ReadWrite")) can.push("יומן Outlook — הצגה, קביעה, הזזה וביטול של פגישות (אחרי אישור בכפתור), כולל פגישה עם קישור Teams");
  if (msHas(scopes, "Files.Read.All")) can.push("קבצים ב-OneDrive וב-SharePoint — חיפוש וקריאה בלבד (בלי שמירה ובלי שיתוף)");
  return can;
}

const LABEL: Record<ConnectionProvider, string> = { microsoft: "Microsoft 365", google: "Google" };

/**
 * "## חיבורים": each connected provider (only active ones, the newest per provider — the one the tools use) with what
 * its granted scopes allow; a provider that is not connected with what a connection would allow (the scopes the app
 * asks for), so "תהיה לך גישה ל-Drive?" has a factual answer before connecting too.
 */
export function connectionLines(connections: readonly ConnectionFacts[], opts: { gmailRead: boolean }): string[] {
  const lines: string[] = [];
  for (const provider of ["microsoft", "google"] as const) {
    const c = connections.findLast((x) => x.provider === provider);
    if (c) {
      const can = provider === "google" ? googleCan(c.scopes.length ? c.scopes : GOOGLE_BASE_SCOPES, opts.gmailRead) : microsoftCan(c.scopes.length ? c.scopes : MS_SCOPES);
      const again = `חשבון אחר או חיבור מחדש: אפשר לכתוב ״לחבר מחדש את ${provider === "google" ? "גוגל" : "המייל"}״`;
      lines.push(`- ${LABEL[provider]} מחובר${c.accountEmail ? ` (${c.accountEmail})` : ""}:`, ...[...can, again].map((x) => `  • ${x}`));
    } else {
      const can = provider === "google" ? googleCan(GOOGLE_BASE_SCOPES, null) : microsoftCan(MS_SCOPES);
      lines.push(`- ${LABEL[provider]} לא מחובר. אחרי חיבור (״לחבר את ${provider === "google" ? "גוגל" : "המייל"}״):`, ...can.map((x) => `  • ${x}`));
    }
  }
  return lines;
}
