/**
 * The tabs of the admin panel and the URL of each (pure, client-safe), like app/account/areas.ts:
 *   /admin                → סקירה        /admin?tab=users   → משתמשים     /admin?tab=help   → צריך עזרה
 *   /admin?tab=tickets    → פניות        /admin?tab=chats   → צ'אט באתר   /admin?tab=errors → תקלות
 *   /admin?tab=alerts     → התראות (מה נשלח לבעלים במייל, מתגים ושעות שקט — lib/admin/alerts.ts)
 * Each tab is rendered by the server for its own data; the user page is /admin/users/<id>.
 */
export const ADMIN_TABS = [
  { id: "overview", label: "סקירה" },
  { id: "users", label: "משתמשים" },
  { id: "help", label: "צריך עזרה" },
  { id: "tickets", label: "פניות" },
  { id: "chats", label: "צ'אט באתר" },
  { id: "errors", label: "תקלות" },
  { id: "alerts", label: "התראות" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

const IDS = new Set<string>(ADMIN_TABS.map((t) => t.id));

export function tabFrom(sp: Readonly<Record<string, string | string[] | undefined>> | null | undefined): AdminTab {
  const tab = sp?.tab;
  return typeof tab === "string" && IDS.has(tab) ? (tab as AdminTab) : "overview";
}

export function tabHref(tab: AdminTab, params: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (tab !== "overview") sp.set("tab", tab);
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/admin?${qs}` : "/admin";
}
