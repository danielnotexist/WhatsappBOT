/**
 * First-party, cookie-less analytics (round plan "אנליטיקה ו-SEO"): the names shared by the browser beacon
 * (./beacon.ts), the /api/a route, the server-side events (./track.ts), the data layer and the admin tab "תנועה".
 * Client-safe: constants and pure functions only.
 */

/** The signup funnel, in order. A visit (a page view) comes before them. */
export const FUNNEL_EVENTS = ["signup_start", "code_sent", "code_ok", "wa_linked", "mail_connected", "paid"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** The steps the browser reports itself; the rest are written by the server where they happen. */
export const CLIENT_EVENTS = ["signup_start", "code_sent", "code_ok"] as const satisfies readonly FunnelEvent[];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
/**
 * What the server writes: its own steps, and `code_ok` of a sign-in with Microsoft / Google (lib/auth/sso-flow.ts) —
 * that sign-in has no code card in the browser to report it, so the server marks the same step.
 */
export type ServerEvent = Exclude<FunnelEvent, ClientEvent> | "code_ok";

/**
 * Named events outside the signup funnel (migration 0018): `referral_visit` — a visit through a friend's link
 * (/r/<code>, lib/referrals). Written by the server; never a funnel step and never a page view.
 */
export const OTHER_EVENTS = ["referral_visit"] as const;
export type OtherEvent = (typeof OTHER_EVENTS)[number];
/** Every value page_events.event may hold. */
export type AnalyticsEvent = FunnelEvent | OtherEvent;

export const DEVICES = ["mobile", "desktop"] as const;
export type DeviceClass = (typeof DEVICES)[number];

/** Narrower than this (CSS px) counts as a phone. */
export const MOBILE_MAX_WIDTH = 767;

export function deviceOf(viewportWidth: number): DeviceClass {
  return viewportWidth > 0 && viewportWidth <= MOBILE_MAX_WIDTH ? "mobile" : "desktop";
}

/**
 * Paths that never report: the panel, the app's own machinery, the dev tools and every page whose address carries a
 * token (the payment links, the WhatsApp sign-in link, the invoice).
 */
const EXCLUDED = /^\/(admin|api|dev|pay|invoice|_next)(\/|$)|^\/login\/w(\/|$)/;

export function isExcludedPath(path: string): boolean {
  return EXCLUDED.test(path);
}

export const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type UtmField = (typeof UTM_FIELDS)[number];

/** A referrer that is there but not a URL we can read (an app, a custom scheme). */
export const UNKNOWN_REFERRER = "unknown";

/** The longest path / host / utm value kept (the database checks the same). */
export const MAX_PATH = 200;
export const MAX_VALUE = 120;
