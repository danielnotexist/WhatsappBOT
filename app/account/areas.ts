/**
 * The areas of the personal area, and the URL of each (pure, client-safe — shared by the page and the client nav).
 *   /account                  → סקירה (the default)
 *   /account?tab=connections  → חיבורים      /account?tab=whatsapp → וואטסאפ     /account?tab=agents → סוכנים
 *   /account?tab=plan         → מנוי         /account?tab=settings → הגדרות
 * A result (`?notice=` / `?error=`) is shown inside the area it belongs to. Older links keep working: `?at=agents`
 * (the agent actions' landing before the areas) and `?new=<template>` open the agents; a bare `/account?notice=…`
 * (an old link from WhatsApp) shows its notice on the overview.
 */
export const ACCOUNT_AREAS = [
  { id: "overview", label: "סקירה" },
  { id: "connections", label: "חיבורים" },
  { id: "whatsapp", label: "וואטסאפ" },
  { id: "agents", label: "סוכנים" },
  { id: "plan", label: "מנוי" },
  { id: "settings", label: "הגדרות" },
] as const;

export type AccountArea = (typeof ACCOUNT_AREAS)[number]["id"];

const IDS = new Set<string>(ACCOUNT_AREAS.map((a) => a.id));

export function isAccountArea(value: unknown): value is AccountArea {
  return typeof value === "string" && IDS.has(value);
}

type ParamSource = URLSearchParams | Readonly<Record<string, string | string[] | undefined>> | null | undefined;

function param(sp: ParamSource, name: string): string | null {
  if (!sp) return null;
  if (sp instanceof URLSearchParams) return sp.get(name);
  const v = sp[name];
  return typeof v === "string" ? v : null;
}

/** The area a URL opens: `tab`, then the older `at`, then a new-agent template, else the overview. */
export function areaFrom(sp: ParamSource): AccountArea {
  const tab = param(sp, "tab");
  if (isAccountArea(tab)) return tab;
  const at = param(sp, "at");
  if (isAccountArea(at)) return at;
  if (param(sp, "new") !== null) return "agents";
  return "overview";
}

/** The clean URL of an area (no notice, no form state). */
export function areaHref(area: AccountArea): "/account" | `/account?tab=${Exclude<AccountArea, "overview">}` {
  return area === "overview" ? "/account" : `/account?tab=${area}`;
}
