import { deviceOf, isExcludedPath, MAX_PATH, MAX_VALUE, UNKNOWN_REFERRER, UTM_FIELDS, type ClientEvent, type DeviceClass } from "./events";

/**
 * What the browser sends to /api/a (navigator.sendBeacon) — built here, pure, so the rules are tested without a DOM:
 *   - the path only: the query is dropped (it can hold an email or a token); utm_source / utm_medium / utm_campaign
 *     travel as their own fields;
 *   - the referring site's host only, on the first page of a visit (later route changes keep document.referrer, which
 *     would count the same arrival again), never this site's own host;
 *   - the viewport class (mobile / desktop), and an optional named funnel step;
 *   - nothing at all under Do-Not-Track / Global Privacy Control, or on an excluded path (lib/analytics/events.ts).
 * No cookie, no id: the server makes the anonymous daily visitor id (lib/analytics/visitor.ts).
 */
export interface BeaconPayload {
  path: string;
  ref: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: DeviceClass;
  event: ClientEvent | null;
}

export interface BeaconInput {
  /** location.href */
  href: string;
  /** document.referrer ("" when none) */
  referrer: string;
  /** whether this is the first report of the page load (the only one that carries the referrer) */
  first: boolean;
  viewportWidth: number;
  event?: ClientEvent | null;
  /** this site's hosts: a referrer from them is not a source */
  ownHosts: readonly string[];
}

const clean = (v: string | null | undefined, max: number = MAX_VALUE): string | null => {
  if (typeof v !== "string") return null;
  // printable text on one line, capped
  const t = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return t || null;
};

/** navigator.doNotTrack ("1" / "yes"), window.doNotTrack, or navigator.globalPrivacyControl: true → send nothing. */
export function optedOut(signals: { doNotTrack?: string | null; windowDoNotTrack?: string | null; globalPrivacyControl?: boolean | null }): boolean {
  const on = (v: string | null | undefined) => v === "1" || v === "yes";
  return on(signals.doNotTrack) || on(signals.windowDoNotTrack) || signals.globalPrivacyControl === true;
}

export function referrerHost(referrer: string, ownHosts: readonly string[]): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return UNKNOWN_REFERRER;
    const host = url.hostname.toLowerCase();
    if (!host) return UNKNOWN_REFERRER;
    return ownHosts.includes(host) ? null : clean(host);
  } catch {
    return UNKNOWN_REFERRER;
  }
}

/** The payload for this page (or step), or null when nothing may be sent. */
export function buildBeacon(input: BeaconInput): BeaconPayload | null {
  let url: URL;
  try {
    url = new URL(input.href);
  } catch {
    return null;
  }
  const path = clean(url.pathname, MAX_PATH);
  if (!path || !path.startsWith("/") || isExcludedPath(path)) return null;
  const utm = Object.fromEntries(UTM_FIELDS.map((k) => [k, clean(url.searchParams.get(k))])) as Record<(typeof UTM_FIELDS)[number], string | null>;
  return {
    path,
    ref: input.first ? referrerHost(input.referrer, input.ownHosts) : null,
    ...utm,
    device: deviceOf(input.viewportWidth),
    event: input.event ?? null,
  };
}
