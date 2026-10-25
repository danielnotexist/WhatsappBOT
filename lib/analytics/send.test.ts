// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEACON_URL, resetBeaconForTests, trackEvent, trackPageView } from "./send";

let sent: { url: string; body: string }[] = [];

function setNavigator(extra: Record<string, unknown>) {
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(window.navigator, k, { value: v, configurable: true });
}

beforeEach(() => {
  sent = [];
  resetBeaconForTests();
  setNavigator({ doNotTrack: null, globalPrivacyControl: undefined, sendBeacon: (url: string, body: string) => (sent.push({ url, body }), true) });
  window.history.replaceState(null, "", "/?utm_source=e2e&email=x%40y.co");
  Object.defineProperty(document, "referrer", { value: "https://www.linkedin.com/feed/", configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("the browser side (lib/analytics/send.ts)", () => {
  it("one text/plain JSON beacon to /api/a, the referrer on the first page only", () => {
    trackPageView();
    window.history.replaceState(null, "", "/pricing");
    trackPageView();
    expect(sent.map((s) => s.url)).toEqual([BEACON_URL, BEACON_URL]);
    const [a, b] = sent.map((s) => JSON.parse(s.body) as Record<string, unknown>);
    expect(a).toMatchObject({ path: "/", ref: "www.linkedin.com", utm_source: "e2e" });
    expect(b).toMatchObject({ path: "/pricing", ref: null, utm_source: null });
    expect(sent[0]!.body).not.toContain("x@y.co");
  });

  it("a funnel step carries no source (the page views do)", () => {
    trackEvent("signup_start");
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ path: "/", event: "signup_start", ref: null, utm_source: null });
  });

  it("Do-Not-Track → nothing at all", () => {
    setNavigator({ doNotTrack: "1" });
    trackPageView();
    trackEvent("code_ok");
    expect(sent).toEqual([]);
  });

  it("Global Privacy Control → nothing at all", () => {
    setNavigator({ globalPrivacyControl: true });
    trackPageView();
    expect(sent).toEqual([]);
  });

  it("an excluded page → nothing", () => {
    window.history.replaceState(null, "", "/admin?tab=traffic");
    trackPageView();
    window.history.replaceState(null, "", "/pay/abc");
    trackEvent("code_sent");
    expect(sent).toEqual([]);
  });

  it("no sendBeacon, or one that throws → nothing, and no error", () => {
    setNavigator({ sendBeacon: undefined });
    expect(() => trackPageView()).not.toThrow();
    setNavigator({ sendBeacon: () => { throw new Error("blocked"); } });
    expect(() => trackEvent("code_ok")).not.toThrow();
  });
});
