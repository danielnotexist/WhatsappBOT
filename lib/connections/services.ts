import type { ConnectionProvider, ConnectionRow } from "@/lib/db/types";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, driveReadActive, gmailReadActive, hasScope, type GoogleFeature, type RestrictedRead } from "@/lib/google/oauth";
import { entitlements, type EffectivePlan } from "@/lib/billing/plans";
import { msHasScope } from "@/lib/ms/oauth";

/**
 * The services behind each connected account (the "חיבורים" icon row in /account, and the assistant's account context).
 * One catalogue per provider: what each service is called, the scopes it needs, and its status for a connection, derived
 * from the connection's granted `scopes` column only (no API calls):
 *   - "connected"      every scope it needs is granted (and, for a restricted read, the read is switched on);
 *   - "needs_consent"  the account is connected but a scope is missing → `href` starts the consent that adds it
 *                      (Google: an incremental consent for just that scope; Microsoft: the normal connect, which
 *                      re-consents, or sends the organisation to its admin);
 *   - "unavailable"    the service rests on a restricted Google read that is switched off or whose user cap is full;
 *   - "pro_only"       the user's plan does not include it (lib/billing/plans.ts entitlements: Tasks / To Do,
 *                      SharePoint, the Docs family's full read; on a one-account plan every service of a second, paused
 *                      account) → `href` opens the upgrade (the pay link), never a consent for a scope the plan
 *                      would not use.
 * A service that works in part while its restricted read is unavailable (Gmail sends but does not read; Drive sees only
 * the files made through עלזה) stays "connected", with a note that says so; the same for Drive on a plan without the
 * full read.
 * All text is site text: Hebrew, short hyphen only (lib/design/dashes.test.tsx scans this file).
 */

export type ServiceStatus = "connected" | "needs_consent" | "unavailable" | "pro_only";

/** Our own solid glyphs (components/brand/service-icons.tsx). */
export type ServiceIcon = "mail" | "calendar" | "tasks" | "folder" | "doc" | "sheet" | "slides" | "cloud" | "sites" | "files";

export type ServiceId =
  | "gmail"
  | "google_calendar"
  | "google_tasks"
  | "google_drive"
  | "google_docs"
  | "google_sheets"
  | "google_slides"
  | "outlook"
  | "outlook_calendar"
  | "onedrive"
  | "sharepoint"
  | "microsoft_todo"
  | "office_files";

/** Per restricted Google read: may the account have it (lib/google/user-cap.ts restrictedReadAccess)? */
export type GateState = "open" | "disabled" | "cap_reached";
export type ReadGates = Record<RestrictedRead, GateState>;

/** Both reads on — the gates when nothing says otherwise (e.g. a Microsoft row). */
export const OPEN_GATES: ReadGates = { gmail_read: "open", drive_read: "open" };

interface ServiceDef {
  id: ServiceId;
  provider: ConnectionProvider;
  icon: ServiceIcon;
  label: string;
  /** without these the service does nothing */
  required: readonly string[];
  /** Google: the incremental consent that adds a missing required scope (none → a plain reconnect) */
  requiredFeature?: GoogleFeature;
  /** a restricted Google read that completes (or, with no `required`, makes) the service */
  gated?: { read: RestrictedRead; scope: string };
  /** tooltip line when connected (with the gated read, if any) */
  does: string;
  /** connected without the gated read (it is unavailable to this account): what still works */
  partly?: string;
  /** needs_consent for the gated read while the required part works: what works, and what the approval adds */
  addsWith?: string;
  /** the plan must include this (lib/billing/plans.ts), else the service is "pro_only" */
  plan?: PlanFlag;
  /**
   * works on every plan, but a plan `without` that entitlement gets less: the tooltip line there (and Drive's restricted
   * read is not asked for: no consent link for a read the plan would not use)
   */
  limited?: { without: PlanFlag; note: string };
}

/** The entitlements a service may rest on. */
type PlanFlag = "tasks" | "sharepoint" | "driveFullRead";

const STATUS_LABEL: Record<ServiceStatus, string> = { connected: "מחובר", needs_consent: "צריך אישור נוסף", unavailable: "לא זמין", pro_only: "במסלול פרו" };

const G = GOOGLE_SCOPES;

export const GOOGLE_SERVICES: readonly ServiceDef[] = [
  {
    id: "gmail",
    provider: "google",
    icon: "mail",
    label: "Gmail",
    required: [G.gmailSend],
    gated: { read: "gmail_read", scope: G.gmailReadonly },
    does: "קריאה, חיפוש וסיכום של מיילים, ושליחה אחרי אישור",
    partly: "שליחת מיילים אחרי אישור",
    addsWith: "השליחה פעילה. קריאה וסיכום של מיילים מחכים לאישור",
  },
  { id: "google_calendar", provider: "google", icon: "calendar", label: "יומן Google", required: [G.calendarEvents], does: "הצגה, קביעה והזזה של פגישות, כולל Google Meet" },
  { id: "google_tasks", provider: "google", icon: "tasks", label: "Google Tasks", required: [G.tasks], requiredFeature: "tasks", does: "הצגה והוספה של משימות", plan: "tasks" },
  {
    id: "google_drive",
    provider: "google",
    icon: "folder",
    label: "Google Drive",
    required: [G.driveFile],
    gated: { read: "drive_read", scope: G.driveReadonly },
    does: "חיפוש וקריאה בכל הקבצים, ושמירת מסמכים",
    partly: "קבצים שנוצרו או נפתחו דרכי, ושמירת מסמכים",
    addsWith: "כרגע רק קבצים שנוצרו דרכי. חיפוש בכל ה-Drive מחכה לאישור",
    limited: { without: "driveFullRead", note: "קבצים שנפתחו דרכי. חיפוש בכל ה-Drive ושמירת מסמכים: במסלול פרו" },
  },
  { id: "google_docs", provider: "google", icon: "doc", label: "Google Docs", required: [], gated: { read: "drive_read", scope: G.driveReadonly }, does: "קריאה של מסמכים קיימים", plan: "driveFullRead" },
  { id: "google_sheets", provider: "google", icon: "sheet", label: "Google Sheets", required: [], gated: { read: "drive_read", scope: G.driveReadonly }, does: "קריאה של גיליונות קיימים", plan: "driveFullRead" },
  { id: "google_slides", provider: "google", icon: "slides", label: "Google Slides", required: [], gated: { read: "drive_read", scope: G.driveReadonly }, does: "קריאה של מצגות קיימות", plan: "driveFullRead" },
];

export const MICROSOFT_SERVICES: readonly ServiceDef[] = [
  { id: "outlook", provider: "microsoft", icon: "mail", label: "Outlook", required: ["Mail.ReadWrite", "Mail.Send"], does: "קריאה, חיפוש וסיכום של מיילים, ושליחה אחרי אישור" },
  { id: "outlook_calendar", provider: "microsoft", icon: "calendar", label: "יומן Outlook", required: ["Calendars.ReadWrite"], does: "הצגה, קביעה והזזה של פגישות, כולל Teams" },
  { id: "onedrive", provider: "microsoft", icon: "cloud", label: "OneDrive", required: ["Files.Read.All"], does: "חיפוש וקריאה של קבצים" },
  { id: "sharepoint", provider: "microsoft", icon: "sites", label: "SharePoint", required: ["Sites.Read.All", "Files.Read.All"], does: "חיפוש באתרים ובספריות המסמכים של הארגון", plan: "sharepoint" },
  { id: "microsoft_todo", provider: "microsoft", icon: "tasks", label: "Microsoft To Do", required: ["Tasks.ReadWrite"], does: "הצגה והוספה של משימות", plan: "tasks" },
  {
    id: "office_files",
    provider: "microsoft",
    icon: "files",
    label: "קבצי Word, Excel ו-PowerPoint",
    required: ["Files.Read.All"],
    does: "קריאה של מסמכים, גיליונות ומצגות מ-OneDrive ו-SharePoint",
    limited: { without: "sharepoint", note: "קריאה של מסמכים, גיליונות ומצגות מ-OneDrive. SharePoint: במסלול פרו" },
  },
];

export interface ServiceView {
  id: ServiceId;
  provider: ConnectionProvider;
  icon: ServiceIcon;
  label: string;
  status: ServiceStatus;
  statusLabel: string;
  /** the accessible name and the tooltip's first line: "Gmail - מחובר" */
  name: string;
  /** the tooltip's second line: what works, or what is missing */
  note: string;
  /** needs_consent / pro_only: what a click does ("לחיצה פותחת את האישור ב-Google") */
  action: string | null;
  /** needs_consent: the start route that adds the missing scope; pro_only: the upgrade (a click on the icon) */
  href: string | null;
}

export interface ServiceOptions {
  /** the restricted Google reads for this account; default: both open */
  gates?: ReadGates;
  /** where the consent lands afterwards (lib/auth/oauth-return.ts); default: the personal area */
  returnTo?: "account" | "onboarding";
  /** the plan in force (lib/billing/plans.ts entitlements); default: pro, where every service is included */
  plan?: EffectivePlan;
  /** a second account on a one-account plan (providerGate): connected but not in use, every service is "pro_only" */
  paused?: boolean;
  /** where a "pro_only" icon leads: the upgrade (the personal pay link); none → the icon only explains */
  upgradeHref?: string | null;
}

const UNAVAILABLE_NOTE: Record<Exclude<GateState, "open">, string> = {
  cap_reached: "פתוח כרגע רק למשתמשים הראשונים, והמקומות התמלאו",
  disabled: "כבוי כרגע. שאר השירותים ממשיכים לעבוד",
};

function startHref(provider: ConnectionProvider, feature: GoogleFeature | null, returnTo: ServiceOptions["returnTo"]): string {
  const q = new URLSearchParams();
  if (feature) q.set("feature", feature);
  if (returnTo === "onboarding") q.set("returnTo", "onboarding");
  const qs = q.toString();
  return `/api/auth/${provider}/start${qs ? `?${qs}` : ""}`;
}

const ACTION: Record<ConnectionProvider, string> = {
  google: "לחיצה פותחת את האישור ב-Google",
  microsoft: "לחיצה פותחת חיבור מחדש ב-Microsoft. בארגון ייתכן שיידרש אישור מנהל",
};

const UPGRADE_ACTION = "לחיצה פותחת את השדרוג לפרו";
/** the tooltip of every service of a paused account */
const PAUSED_NOTE = "במסלול הנוכחי עובדים עם חשבון אחד. Google ו-Microsoft יחד: במסלול פרו";

function view(def: ServiceDef, status: ServiceStatus, note: string, href: string | null): ServiceView {
  const statusLabel = STATUS_LABEL[status];
  const action = href ? (status === "pro_only" ? UPGRADE_ACTION : ACTION[def.provider]) : null;
  return { id: def.id, provider: def.provider, icon: def.icon, label: def.label, status, statusLabel, name: `${def.label} - ${statusLabel}`, note, href, action };
}

/** One service's status for a connection's granted scopes (pure — unit-tested in services.test.ts). */
export function serviceStatus(def: ServiceDef, granted: readonly string[], opts: ServiceOptions = {}): ServiceView {
  const has = (scope: string) => (def.provider === "google" ? hasScope(granted.length ? granted : GOOGLE_BASE_SCOPES, scope) : msHasScope(granted, scope));
  const consent = (feature: GoogleFeature | null) => startHref(def.provider, def.provider === "google" ? feature : null, opts.returnTo);
  const ent = entitlements(opts.plan ?? "pro");
  // not in the plan: the upgrade, never a consent for a scope the plan would not use
  if (opts.paused) return view(def, "pro_only", PAUSED_NOTE, opts.upgradeHref ?? null);
  if (def.plan && !ent[def.plan]) return view(def, "pro_only", def.does, opts.upgradeHref ?? null);
  const missingRequired = def.required.filter((s) => !has(s));
  // the tooltip says what the service would do; the action line says how to get it
  if (missingRequired.length) return view(def, "needs_consent", def.does, consent(def.requiredFeature ?? null));
  if (def.limited && !ent[def.limited.without]) return view(def, "connected", def.limited.note, null);
  if (!def.gated) return view(def, "connected", def.does, null);
  const gate = (opts.gates ?? OPEN_GATES)[def.gated.read];
  // a switched-off read is off also for a connection that granted it earlier (the kill switch)
  if (gate === "disabled" || (gate === "cap_reached" && !has(def.gated.scope))) {
    return def.required.length ? view(def, "connected", def.partly ?? def.does, null) : view(def, "unavailable", UNAVAILABLE_NOTE[gate], null);
  }
  if (has(def.gated.scope)) return view(def, "connected", def.does, null);
  return view(def, "needs_consent", def.addsWith ?? def.does, consent(def.gated.read));
}

export function servicesFor(provider: ConnectionProvider): readonly ServiceDef[] {
  return provider === "google" ? GOOGLE_SERVICES : MICROSOFT_SERVICES;
}

/** Every service of the connection's provider with its status. */
export function connectionServices(connection: Pick<ConnectionRow, "provider" | "scopes">, opts: ServiceOptions = {}): ServiceView[] {
  return servicesFor(connection.provider).map((def) => serviceStatus(def, connection.scopes ?? [], opts));
}

/** A restricted read's gate from the user-cap decision (lib/google/user-cap.ts RestrictedReadAccess). */
export function gateFrom(access: { allowed: boolean; reason: string }): GateState {
  return access.allowed ? "open" : access.reason === "cap_reached" ? "cap_reached" : "disabled";
}

/**
 * The gates from the switches alone (no ledger lookup): enough to tell which services are connected — a read the
 * account has not granted is not connected whatever the cap says. Never throws (a bad value → that read off).
 */
export function envReadGates(source: Record<string, string | undefined> = process.env): ReadGates {
  return { gmail_read: gmailReadActive(source) ? "open" : "disabled", drive_read: driveReadActive(source) ? "open" : "disabled" };
}

/** The connected services of a connection on the plan as one line ("" when none), for the assistant's account context. */
export function activeServicesFor(connection: Pick<ConnectionRow, "provider" | "scopes">, gates: ReadGates = envReadGates(), plan: EffectivePlan = "pro"): string {
  return activeServicesLine(connectionServices(connection, { gates, plan }));
}

/** "Gmail, יומן Google ו-Google Tasks" — the connected services, for the assistant's account context. */
export function activeServicesLine(views: readonly ServiceView[]): string {
  const labels = views.filter((v) => v.status === "connected").map((v) => v.label);
  if (labels.length <= 1) return labels[0] ?? "";
  const last = labels.at(-1)!;
  return `${labels.slice(0, -1).join(", ")} ${/^[A-Za-z]/.test(last) ? "ו-" : "ו"}${last}`;
}
