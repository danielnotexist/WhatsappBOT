import { buildBeacon, optedOut, type BeaconPayload } from "./beacon";
import type { ClientEvent } from "./events";

/**
 * The browser side of the analytics (lib/analytics/beacon.ts builds the payload): one navigator.sendBeacon to /api/a.
 * sendBeacon survives the navigation that often follows a funnel step (the code card → the next screen). The body is
 * a plain-text JSON string: a text/plain beacon needs no preflight and every browser accepts it.
 * Never throws; does nothing on the server, without sendBeacon, or under Do-Not-Track / Global Privacy Control.
 */
export const BEACON_URL = "/api/a";

let firstSent = false;

/** Tests only. */
export function resetBeaconForTests(): void {
  firstSent = false;
}

function payloadFor(event: ClientEvent | null): BeaconPayload | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const win = window as Window & { doNotTrack?: string | null };
  if (optedOut({ doNotTrack: nav.doNotTrack, windowDoNotTrack: win.doNotTrack, globalPrivacyControl: nav.globalPrivacyControl })) return null;
  return buildBeacon({
    href: window.location.href,
    referrer: document.referrer,
    first: !firstSent,
    viewportWidth: window.innerWidth,
    event,
    ownHosts: [window.location.hostname.toLowerCase()],
  });
}

function send(payload: BeaconPayload): void {
  try {
    if (typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon(BEACON_URL, JSON.stringify(payload));
  } catch {
    // analytics never breaks the page
  }
}

/** A page view (the root layout's PageBeacon, on every route change). */
export function trackPageView(): void {
  const payload = payloadFor(null);
  if (!payload) return;
  firstSent = true;
  send(payload);
}

/** A funnel step reached in the browser: the email card shown, the code sent, the code accepted. */
export function trackEvent(event: ClientEvent): void {
  const payload = payloadFor(event);
  if (payload) send({ ...payload, ref: null, utm_source: null, utm_medium: null, utm_campaign: null });
}
