import { describe, expect, it } from "vitest";
import { buildBeacon, optedOut, referrerHost } from "./beacon";
import { deviceOf, isExcludedPath } from "./events";

const base = { referrer: "", first: true, viewportWidth: 1440, ownHosts: ["alze.ai"] };

describe("buildBeacon — what the browser sends to /api/a", () => {
  it("the path only: the query is dropped, utm_* travel as fields", () => {
    const b = buildBeacon({ ...base, href: "https://alze.ai/pricing?utm_source=fb&utm_medium=paid&utm_campaign=oct&email=dana%40example.com&t=SECRET#faq" });
    expect(b).toEqual({ path: "/pricing", ref: null, utm_source: "fb", utm_medium: "paid", utm_campaign: "oct", device: "desktop", event: null });
    expect(JSON.stringify(b)).not.toMatch(/dana|SECRET|email|faq|\?/);
  });

  it("the code card's address in the URL never travels", () => {
    const b = buildBeacon({ ...base, href: "https://alze.ai/start/code?email=a%40b.co&updates=1", event: "code_sent" });
    expect(b).toMatchObject({ path: "/start/code", event: "code_sent", utm_source: null });
    expect(JSON.stringify(b)).not.toContain("a@b.co");
  });

  it("the referring host only, on the first report of the page load, never this site", () => {
    expect(buildBeacon({ ...base, href: "https://alze.ai/", referrer: "https://www.Google.com/search?q=%D7%A2%D7%9C%D7%96%D7%94" })!.ref).toBe("www.google.com");
    expect(buildBeacon({ ...base, first: false, href: "https://alze.ai/pricing", referrer: "https://www.google.com/" })!.ref).toBeNull();
    expect(buildBeacon({ ...base, href: "https://alze.ai/pricing", referrer: "https://alze.ai/" })!.ref).toBeNull();
    expect(referrerHost("android-app://com.whatsapp", [])).toBe("unknown");
    expect(referrerHost("not a url", [])).toBe("unknown");
    expect(referrerHost("", [])).toBeNull();
  });

  it("utm values are cleaned and capped", () => {
    const b = buildBeacon({ ...base, href: `https://alze.ai/?utm_source=${"x".repeat(300)}&utm_medium=%0Aline%0D` })!;
    expect(b.utm_source).toHaveLength(120);
    expect(b.utm_medium).toBe("line");
  });

  it("mobile below 768px, desktop from there", () => {
    expect(buildBeacon({ ...base, href: "https://alze.ai/", viewportWidth: 390 })!.device).toBe("mobile");
    expect(deviceOf(767)).toBe("mobile");
    expect(deviceOf(768)).toBe("desktop");
    expect(deviceOf(0)).toBe("desktop");
  });

  it.each(["/admin", "/admin?tab=traffic", "/admin/users/1", "/api/a", "/dev", "/dev/x", "/pay/abc.def", "/pay/card/tok", "/pay/done", "/invoice/tok", "/login/w/tok"])("nothing on %s", (path) => {
    expect(buildBeacon({ ...base, href: `https://alze.ai${path}` })).toBeNull();
  });

  it.each(["/", "/pricing", "/start", "/start/email", "/for/lawyers", "/login", "/account", "/payments-info", "/administrator-guide"])("reports %s", (path) => {
    expect(isExcludedPath(path)).toBe(false);
    expect(buildBeacon({ ...base, href: `https://alze.ai${path}` })!.path).toBe(path);
  });

  it("a broken href → nothing", () => {
    expect(buildBeacon({ ...base, href: "::" })).toBeNull();
  });
});

describe("Do-Not-Track / Global Privacy Control", () => {
  it("any of the signals → opted out", () => {
    expect(optedOut({ doNotTrack: "1" })).toBe(true);
    expect(optedOut({ doNotTrack: "yes" })).toBe(true);
    expect(optedOut({ windowDoNotTrack: "1" })).toBe(true);
    expect(optedOut({ globalPrivacyControl: true })).toBe(true);
    expect(optedOut({ doNotTrack: "0", globalPrivacyControl: false })).toBe(false);
    expect(optedOut({ doNotTrack: null, windowDoNotTrack: "unspecified" })).toBe(false);
  });
});
