// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AnalyticsReport } from "@/lib/db/types";
import { TrafficTab } from "./_components/traffic-tab";
import { ADMIN_TABS, tabFrom, tabHref } from "./tabs";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const report: AnalyticsReport = {
  daily: [
    { day: "2026-10-24", visitors: 30, views: 70 },
    { day: "2026-10-25", visitors: 10, views: 20 },
  ],
  pages: [
    { path: "/", views: 50, visitors: 30 },
    { path: "/for/lawyers", views: 12, visitors: 9 },
  ],
  sources: [
    { source: null, kind: "direct", visitors: 20 },
    { source: "e2e", kind: "utm", visitors: 12 },
    { source: "www.google.com", kind: "referrer", visitors: 8 },
  ],
  devices: [
    { device: "mobile", visitors: 25 },
    { device: "desktop", visitors: 15 },
  ],
  funnel: [
    { step: "visit", count: 40 },
    { step: "signup_start", count: 10 },
    { step: "code_sent", count: 8 },
    { step: "code_ok", count: 7 },
    { step: "wa_linked", count: 2 },
    { step: "mail_connected", count: 2 },
    { step: "paid", count: 1 },
  ],
};

describe("the admin tab \"תנועה\"", () => {
  it("is a tab of the panel, at /admin?tab=traffic", () => {
    expect(ADMIN_TABS.map((t) => t.label)).toContain("תנועה");
    expect(tabFrom({ tab: "traffic" })).toBe("traffic");
    expect(tabHref("traffic", { range: "7" })).toBe("/admin?tab=traffic&range=7");
  });

  it("totals, the two daily charts with their tables, the funnel with shares and the biggest drop in words", () => {
    render(<TrafficTab report={report} range={30} />);
    expect(screen.getByRole("heading", { level: 2, name: "תנועה באתר" })).toBeInTheDocument();
    const stats = screen.getByText("מבקרים", { selector: "dt" }).parentElement!;
    expect(stats.textContent).toContain("40");
    expect(screen.getAllByRole("img", { name: /מבקרים ייחודיים|צפיות בדפים/ })).toHaveLength(2);
    const funnel = screen.getByRole("region", { name: "משפך ההרשמה" });
    const rows = within(funnel).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("ביקור באתר"),
      expect.stringContaining("התחלת הרשמה"),
      expect.stringContaining("קוד נשלח"),
      expect.stringContaining("קוד אומת"),
      expect.stringContaining("וואטסאפ מחובר"),
      expect.stringContaining("מייל מחובר"),
      expect.stringContaining("תשלום"),
    ]);
    expect(rows[1]!.textContent).toContain("25% מהקודם");
    // 7 → 2 (28.6% went on) is the biggest drop inside the signup
    expect(within(funnel).getByText(/הנפילה הגדולה ביותר בהרשמה/).parentElement!.textContent).toContain("בין ״קוד אומת״ ל״וואטסאפ מחובר״. 71.4% לא המשיכו (5 מתוך 7)");
    expect(rows[4]!.textContent).toContain("כאן הכי הרבה נעצרים");
  });

  it("pages with names, sources with Hebrew labels for direct, devices with shares, the range picker", () => {
    render(<TrafficTab report={report} range={7} />);
    const pages = screen.getByRole("region", { name: "הדפים המובילים" });
    expect(within(pages).getByText("דף הבית")).toBeInTheDocument();
    expect(within(pages).getByText("/for/lawyers")).toBeInTheDocument();
    const sources = screen.getByRole("region", { name: "מאיפה הגיעו" });
    expect(within(sources).getByText("ישיר (בלי מפנה)")).toBeInTheDocument();
    expect(within(sources).getByText("e2e")).toBeInTheDocument();
    expect(within(sources).getByText("google.com")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "טלפון או מחשב" })).getByText("63%")).toBeInTheDocument();
    const picker = screen.getByRole("navigation", { name: "טווח הימים" });
    expect(within(picker).getByRole("link", { name: "7 ימים" })).toHaveAttribute("aria-current", "page");
    expect(within(picker).getByRole("link", { name: "30 ימים" })).toHaveAttribute("href", "/admin?tab=traffic");
    expect(within(picker).getByRole("link", { name: "90 ימים" })).toHaveAttribute("href", "/admin?tab=traffic&range=90");
  });

  it("an empty range says so", () => {
    render(<TrafficTab report={{ ...report, daily: [{ day: "2026-10-25", visitors: 0, views: 0 }], pages: [], sources: [], devices: report.devices.map((d) => ({ ...d, visitors: 0 })), funnel: report.funnel.map((f) => ({ ...f, count: 0 })) }} range={30} />);
    expect(screen.getByText(/עדיין אין ביקורים בטווח הזה/)).toBeInTheDocument();
    expect(screen.queryByText(/הנפילה הגדולה/)).toBeNull();
  });
});
