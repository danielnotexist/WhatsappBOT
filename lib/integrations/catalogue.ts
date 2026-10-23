import type { PaidPlan } from "@/lib/billing/plans";

/**
 * The systems she works with (the product name is BRAND.name, lib/brand.ts), as shown on the landing page (the "עובדת עם" strip under the hero, the icons under
 * each plan, and the full list in #connectors). One line per system: a new one is added here, and it shows up in all
 * three places (a drawn mark goes in components/brand/integrations/icons.tsx; without one the tile shows `monogram`).
 *
 * Statuses follow the code on this branch, not the plan - flip `soon` to `available` in the commit that ships it:
 *  - Google (lib/google/oauth.ts + tools.ts): Gmail, Calendar, Drive (drive.file), Docs/Sheets/Slides read through
 *    `gdrive_get_file_text`, Google Tasks, and Meet links on the meetings she creates or updates when asked
 *    (`online_meeting` → conferenceData under calendar.events).
 *  - Microsoft (lib/ms/oauth.ts + tools.ts): Outlook mail and calendar, OneDrive and SharePoint search,
 *    Word/Excel/PowerPoint text, To Do, and Teams links on the meetings she creates or updates when asked
 *    (`online_meeting` → isOnlineMeeting under Calendars.ReadWrite; work or school accounts with Teams only).
 *  - Business systems (docs/research/connectors-israel.md): monday.com, Priority, מורנינג, iCount - all planned.
 * Meeting summaries (pro, lib/meetings) are a capability of Teams and Google Meet, not a system of their own: they are
 * listed in the plans (lib/billing/plans.ts), with Zoom's as "בקרוב" there; Zoom is not in this catalogue.
 *
 * Trademarks: every product name and mark here belongs to its owner (Google LLC, Microsoft Corporation, monday.com
 * Ltd., Priority Software Ltd., Morning (Green Invoice) Ltd., iCount Ltd.). They appear only to say that she works
 * with these products ("works with" - nominative use), never as our own brand. Before production, check the use
 * against Google's and Microsoft's brand guidelines (docs/PROGRESS.md).
 */

export type IntegrationStatus = "available" | "soon";
export type IntegrationVendor = "google" | "microsoft" | "business";

export interface Integration {
  /** stable id; also the key of the drawn mark in components/brand/integrations/icons.tsx */
  id: string;
  /** the product's name as its owner writes it */
  name: string;
  /** one line in Hebrew: what she does with it (feminine for her, neutral for the reader, short hyphen only) */
  benefit: string;
  vendor: IntegrationVendor;
  status: IntegrationStatus;
  /** the plan that includes it (lib/billing/plans.ts entitlements): "basic" = basic and pro (one account on basic), "pro" = pro only */
  plan: PaidPlan;
  /** shown in the compact strip under the hero (available systems only) */
  featured?: boolean;
  /** a letter tile for a system without a drawn mark: the letters and the owner's brand colour */
  monogram?: { text: string; color: string };
}

export const INTEGRATIONS: readonly Integration[] = [
  // Google - one OAuth connection (lib/google/oauth.ts)
  { id: "gmail", name: "Gmail", vendor: "google", status: "available", plan: "basic", featured: true, benefit: "מסכמת מה מחכה ומנסחת תשובות לאישור" },
  { id: "google-calendar", name: "Google Calendar", vendor: "google", status: "available", plan: "basic", featured: true, benefit: "מוצאת שעה פנויה ושולחת זימון אחרי אישור" },
  { id: "google-drive", name: "Google Drive", vendor: "google", status: "available", plan: "basic", featured: true, benefit: "מצרפת קבצים למייל, ובפרו גם שומרת מסמכים" },
  { id: "google-docs", name: "Google Docs", vendor: "google", status: "available", plan: "basic", featured: true, benefit: "קוראת מסמך ועונה עליו בכמה שורות" },
  { id: "google-sheets", name: "Google Sheets", vendor: "google", status: "available", plan: "basic", benefit: "שולפת מספר או שורה מתוך גיליון" },
  { id: "google-slides", name: "Google Slides", vendor: "google", status: "available", plan: "pro", benefit: "מסכמת מצגת לפני פגישה" },
  { id: "google-meet", name: "Google Meet", vendor: "google", status: "available", plan: "basic", benefit: "מצרפת קישור Meet לפגישה כשמבקשים" },
  { id: "google-tasks", name: "Google Tasks", vendor: "google", status: "available", plan: "pro", benefit: "מוסיפה משימות לרשימה ישר מהשיחה" },

  // Microsoft 365 - one OAuth connection (lib/ms/oauth.ts)
  { id: "outlook", name: "Outlook", vendor: "microsoft", status: "available", plan: "basic", featured: true, benefit: "מייל ויומן: מסכמת, קובעת ומנסחת לאישור" },
  { id: "onedrive", name: "OneDrive", vendor: "microsoft", status: "available", plan: "basic", featured: true, benefit: "מוצאת קובץ לפי שם או לקוח וקוראת אותו" },
  { id: "word", name: "Word", vendor: "microsoft", status: "available", plan: "basic", featured: true, benefit: "עונה על שאלות מתוך מסמך, כמו סעיף בחוזה" },
  { id: "excel", name: "Excel", vendor: "microsoft", status: "available", plan: "basic", featured: true, benefit: "קוראת גיליון ומוציאה ממנו את המספר" },
  { id: "powerpoint", name: "PowerPoint", vendor: "microsoft", status: "available", plan: "basic", benefit: "מסכמת מצגת בכמה שורות" },
  { id: "sharepoint", name: "SharePoint", vendor: "microsoft", status: "available", plan: "pro", benefit: "חיפוש בספריות המסמכים של הצוות" },
  { id: "teams", name: "Microsoft Teams", vendor: "microsoft", status: "available", plan: "basic", benefit: "מצרפת קישור Teams לפגישה בחשבון עבודה" },
  { id: "todo", name: "Microsoft To Do", vendor: "microsoft", status: "available", plan: "pro", benefit: "מוסיפה משימות ומזכירה ביום היעד" },

  // business systems (docs/research/connectors-israel.md)
  { id: "monday", name: "monday.com", vendor: "business", status: "soon", plan: "pro", benefit: "מה הסטטוס של לקוח או פרויקט בבורד" },
  { id: "priority", name: "Priority", vendor: "business", status: "soon", plan: "pro", benefit: "הזמנות, לקוחות ומלאי מתוך ה-ERP", monogram: { text: "P", color: "#3B37E6" } },
  { id: "morning", name: "מורנינג (חשבונית ירוקה)", vendor: "business", status: "soon", plan: "pro", benefit: "מי עוד לא שילם, וקבלה חדשה באישור", monogram: { text: "מ", color: "#0DAC81" } },
  { id: "icount", name: "iCount", vendor: "business", status: "soon", plan: "pro", benefit: "חשבוניות פתוחות ותזכורות תשלום ללקוחות", monogram: { text: "iC", color: "#7133D9" } },
];

export interface IntegrationGroup {
  vendor: IntegrationVendor;
  /** the group's heading in the full list */
  title: string;
  items: readonly Integration[];
}

const GROUP_TITLES: Record<IntegrationVendor, string> = {
  google: "Google",
  microsoft: "Microsoft 365",
  business: "מערכות העסק",
};

const VENDORS: readonly IntegrationVendor[] = ["google", "microsoft", "business"];

/** Available systems first, then the ones coming soon; otherwise the catalogue's order. */
function byStatus(list: readonly Integration[]): Integration[] {
  return [...list].sort((a, b) => Number(a.status === "soon") - Number(b.status === "soon"));
}

/** The catalogue by vendor (Google, Microsoft 365, business systems), for the full list. Empty groups are left out. */
export function integrationGroups(list: readonly Integration[] = INTEGRATIONS): IntegrationGroup[] {
  return VENDORS.map((vendor) => ({ vendor, title: GROUP_TITLES[vendor], items: byStatus(list.filter((i) => i.vendor === vendor)) })).filter((g) => g.items.length > 0);
}

export function availableIntegrations(list: readonly Integration[] = INTEGRATIONS): Integration[] {
  return list.filter((i) => i.status === "available");
}

/** The compact strip under the hero: available systems marked `featured`, grouped by vendor. */
export function featuredGroups(list: readonly Integration[] = INTEGRATIONS): IntegrationGroup[] {
  return integrationGroups(availableIntegrations(list).filter((i) => i.featured));
}

/**
 * What a plan connects to (Daniel's split of 23.10.2026, lib/billing/plans.ts entitlements). Basic - and the trial -
 * work with one account, Google or Microsoft: the available systems marked "basic", from both vendors, since either can
 * be the one. Pro: every system, the business systems with their "בקרוב".
 */
export function integrationsForPlan(plan: PaidPlan, list: readonly Integration[] = INTEGRATIONS): IntegrationGroup[] {
  return plan === "basic" ? integrationGroups(availableIntegrations(list).filter((i) => i.plan === "basic")) : integrationGroups(list);
}
