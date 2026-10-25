import { describe, expect, it } from "vitest";
import type { AnalyticsReport, FunnelStep } from "@/lib/db/types";
import { biggestDrop, deviceRows, formatPct, funnelRows, pageLabel, rangeFrom, sourceLabelOf, sourceRows, totals } from "./report";

const steps: FunnelStep[] = ["visit", "signup_start", "code_sent", "code_ok", "wa_linked", "mail_connected", "paid"];
const funnel = (counts: number[]): AnalyticsReport["funnel"] => steps.map((step, i) => ({ step, count: counts[i] ?? 0 }));

describe("the funnel math", () => {
  it("each step: the count, the share of the step before and of the first, and how many were lost", () => {
    const rows = funnelRows(funnel([1000, 200, 150, 120, 90, 45, 20]));
    expect(rows.map((r) => r.label)).toEqual(["ביקור באתר", "התחלת הרשמה", "קוד נשלח", "קוד אומת", "וואטסאפ מחובר", "מייל מחובר", "תשלום"]);
    expect(rows[0]).toMatchObject({ count: 1000, ofPrevious: null, ofFirst: 100, lost: 0 });
    expect(rows[1]).toMatchObject({ count: 200, ofPrevious: 20, ofFirst: 20, lost: 800 });
    expect(rows[2]).toMatchObject({ ofPrevious: 75, lost: 50 });
    expect(rows[5]).toMatchObject({ ofPrevious: 50, ofFirst: 4.5, lost: 45 });
    expect(rows[6]).toMatchObject({ ofPrevious: 44.4, ofFirst: 2 });
  });

  it("the biggest drop is the lowest share inside the signup (the site's own conversion is shown apart)", () => {
    const d = biggestDrop(funnelRows(funnel([1000, 200, 150, 120, 90, 45, 20])))!;
    expect(d.from.step).toBe("mail_connected");
    expect(d.to.step).toBe("paid");
    expect(d.dropPct).toBe(55.6);
    // by share, not by count: 100 → 60 loses more people than 20 → 5, but a smaller share
    const e = biggestDrop(funnelRows(funnel([500, 100, 60, 60, 20, 5, 5])))!;
    expect(e.to.step).toBe("mail_connected");
    expect(e.dropPct).toBe(75);
  });

  it("ties → the earlier step; a step that grew is no drop; nobody in the funnel → no drop", () => {
    expect(biggestDrop(funnelRows(funnel([100, 10, 5, 5, 5, 5, 2.5])))!.to.step).toBe("code_sent");
    expect(biggestDrop(funnelRows(funnel([100, 10, 10, 12, 12, 12, 12])))).toBeNull();
    expect(biggestDrop(funnelRows(funnel([0, 0, 0, 0, 0, 0, 0])))).toBeNull();
    expect(biggestDrop(funnelRows(funnel([40, 0, 0, 0, 0, 0, 0])))).toBeNull();
    const grew = funnelRows(funnel([10, 4, 2, 3, 1, 0, 0]));
    expect(grew[3]).toMatchObject({ ofPrevious: 150, lost: 0 });
  });

  it("an empty first step: no shares, no division by zero", () => {
    const rows = funnelRows(funnel([0, 1, 0, 0, 0, 0, 0]));
    expect(rows[1]).toMatchObject({ ofPrevious: null, ofFirst: null, lost: 0 });
    expect(formatPct(null)).toBe("-");
    expect(formatPct(15.9)).toBe("15.9%");
    expect(formatPct(100)).toBe("100%");
  });
});

describe("labels and totals", () => {
  it("sources: the utm source as written, a referrer without www, direct and unknown in Hebrew", () => {
    expect(sourceLabelOf({ source: "facebook", kind: "utm", visitors: 3 })).toBe("facebook");
    expect(sourceLabelOf({ source: "www.google.com", kind: "referrer", visitors: 3 })).toBe("google.com");
    expect(sourceLabelOf({ source: null, kind: "direct", visitors: 3 })).toBe("ישיר (בלי מפנה)");
    expect(sourceLabelOf({ source: "unknown", kind: "referrer", visitors: 3 })).toBe("לא ידוע");
    expect(sourceRows([{ source: "e2e", kind: "utm", visitors: 2 }])).toEqual([{ key: "utm:e2e", label: "e2e", count: 2, kind: "קמפיין" }]);
  });

  it("devices with their share; totals; page names", () => {
    expect(deviceRows([{ device: "mobile", visitors: 3 }, { device: "desktop", visitors: 1 }])).toEqual([
      { key: "mobile", label: "טלפון", count: 3, share: 75 },
      { key: "desktop", label: "מחשב", count: 1, share: 25 },
    ]);
    expect(totals([{ day: "2026-10-24", visitors: 4, views: 9 }, { day: "2026-10-25", visitors: 1, views: 3 }])).toEqual({ visitors: 5, views: 12, perVisitor: 2.4 });
    expect(totals([])).toEqual({ visitors: 0, views: 0, perVisitor: null });
    expect(pageLabel("/")).toBe("דף הבית");
    expect(pageLabel("/for/clinics")).toBe("לפי מקצוע");
    expect(pageLabel("/something-new")).toBeNull();
  });

  it("the range in the URL: 7 / 30 / 90, anything else 30", () => {
    expect(rangeFrom({ range: "7" })).toBe(7);
    expect(rangeFrom({ range: "90" })).toBe(90);
    expect(rangeFrom({ range: "365" })).toBe(30);
    expect(rangeFrom({ range: ["7"] })).toBe(30);
    expect(rangeFrom(null)).toBe(30);
  });
});
