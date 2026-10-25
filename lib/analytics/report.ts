import type { AnalyticsReport, FunnelStep } from "@/lib/db/types";
import { UNKNOWN_REFERRER } from "./events";

/**
 * The "תנועה" tab's view math (pure, client-safe): the range in the URL, the funnel with the share of each step out
 * of the one before it and the biggest drop, the sources and devices with Hebrew labels.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function rangeFrom(sp: Readonly<Record<string, string | string[] | undefined>> | null | undefined): RangeDays {
  const v = Number(typeof sp?.range === "string" ? sp.range : NaN);
  return (RANGES as readonly number[]).includes(v) ? (v as RangeDays) : 30;
}

export const FUNNEL_LABEL: Record<FunnelStep, string> = {
  visit: "ביקור באתר",
  signup_start: "התחלת הרשמה",
  code_sent: "קוד נשלח",
  code_ok: "קוד אומת",
  wa_linked: "וואטסאפ מחובר",
  mail_connected: "מייל מחובר",
  paid: "תשלום",
};

export interface FunnelRow {
  step: FunnelStep;
  label: string;
  count: number;
  /** percent of the step before (null for the first step, or when the step before had nobody) */
  ofPrevious: number | null;
  /** percent of the first step (null when it had nobody) */
  ofFirst: number | null;
  /** how many were lost on the way into this step from the one before (never negative) */
  lost: number;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export function funnelRows(funnel: AnalyticsReport["funnel"]): FunnelRow[] {
  const first = funnel[0]?.count ?? 0;
  return funnel.map((f, i) => {
    const prev = i > 0 ? funnel[i - 1]!.count : null;
    return {
      step: f.step,
      label: FUNNEL_LABEL[f.step] ?? f.step,
      count: f.count,
      ofPrevious: prev === null ? null : pct(f.count, prev),
      ofFirst: pct(f.count, first),
      lost: prev === null ? 0 : Math.max(0, prev - f.count),
    };
  });
}

/**
 * Where the signup loses most people: the step with the lowest share of the step before it (ties → the earlier one),
 * among steps whose previous step had someone. Measured as a share, not a count, and from the signup's first step on:
 * visit → signup_start is the site's conversion (shown on its own as "התחילו הרשמה"), and it would win every time.
 * null when nothing was lost inside the signup.
 */
export function biggestDrop(rows: readonly FunnelRow[]): { from: FunnelRow; to: FunnelRow; dropPct: number } | null {
  let best: { from: FunnelRow; to: FunnelRow; dropPct: number } | null = null;
  for (let i = 2; i < rows.length; i++) {
    const to = rows[i]!;
    if (to.ofPrevious === null || to.lost === 0) continue;
    const dropPct = Math.round((100 - Math.min(100, to.ofPrevious)) * 10) / 10;
    if (!best || dropPct > best.dropPct) best = { from: rows[i - 1]!, to, dropPct };
  }
  return best;
}

export const DIRECT_LABEL = "ישיר (בלי מפנה)";
export const UNKNOWN_LABEL = "לא ידוע";

/** "www.google.com" → "google.com"; a utm source as it was written; no source → "ישיר"; an unreadable referrer → "לא ידוע". */
export function sourceLabelOf(row: AnalyticsReport["sources"][number]): string {
  if (row.kind === "direct" || row.source === null) return DIRECT_LABEL;
  if (row.source === UNKNOWN_REFERRER) return UNKNOWN_LABEL;
  return row.kind === "referrer" ? row.source.replace(/^www\./, "") : row.source;
}

export function sourceRows(sources: AnalyticsReport["sources"]): { key: string; label: string; count: number; kind: string }[] {
  return sources.map((s) => ({ key: `${s.kind}:${s.source ?? ""}`, label: sourceLabelOf(s), count: s.visitors, kind: s.kind === "utm" ? "קמפיין" : s.kind === "referrer" ? "אתר מפנה" : "" }));
}

export const DEVICE_LABEL = { mobile: "טלפון", desktop: "מחשב" } as const;

export function deviceRows(devices: AnalyticsReport["devices"]): { key: string; label: string; count: number; share: number | null }[] {
  const total = devices.reduce((s, d) => s + d.visitors, 0);
  return devices.map((d) => ({ key: d.device, label: DEVICE_LABEL[d.device], count: d.visitors, share: pct(d.visitors, total) }));
}

export function totals(daily: AnalyticsReport["daily"]): { visitors: number; views: number; perVisitor: number | null } {
  const visitors = daily.reduce((s, d) => s + d.visitors, 0);
  const views = daily.reduce((s, d) => s + d.views, 0);
  return { visitors, views, perVisitor: visitors ? Math.round((views / visitors) * 10) / 10 : null };
}

const PAGE_LABEL: Record<string, string> = {
  "/": "דף הבית",
  "/pricing": "מחירים",
  "/start": "הרשמה: פתיחה",
  "/start/email": "הרשמה: מייל",
  "/start/code": "הרשמה: קוד",
  "/start/connect": "הרשמה: חיבור המייל",
  "/start/ready": "הרשמה: וואטסאפ",
  "/login": "כניסה",
  "/account": "האזור האישי",
  "/privacy": "מדיניות פרטיות",
  "/terms": "תנאי שימוש",
  "/accessibility": "הצהרת נגישות",
  "/for": "לפי מקצוע",
};

/** A page's name in the panel (the path itself is shown next to it); null for a path without a name. */
export function pageLabel(path: string): string | null {
  if (PAGE_LABEL[path]) return PAGE_LABEL[path]!;
  if (path.startsWith("/for/")) return "לפי מקצוע";
  if (path.startsWith("/login/")) return "כניסה";
  if (path.startsWith("/connect/")) return "הרשמה: מעבר לחיבור";
  return null;
}

/** "47.5%" / "100%" in the panel's figures. */
export function formatPct(v: number | null): string {
  if (v === null) return "-";
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}
