import { describe, expect, it } from "vitest";
import { planComparison, trialNote, type CompareCell } from "./compare";
import { COMING_SOON, PLANS, TRIAL_MESSAGES, entitlements, planFeatures } from "./plans";

const rows = () => planComparison().flatMap((s) => s.rows);
const row = (id: string) => rows().find((r) => r.id === id)!;
const kind = (c: CompareCell) => c.kind;

describe("the full comparison (/pricing) comes from the entitlements", () => {
  it("has unique rows in four sections, and no em or en dash", () => {
    const ids = rows().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(planComparison().map((s) => s.title)).toEqual(["המסלול", "מייל, יומן וקבצים", "לאורך היום", "סוכנים"]);
    expect(JSON.stringify(planComparison())).not.toMatch(/[–—]/);
  });

  it("prices, messages and accounts are the plan specs", () => {
    expect(row("price").basic).toEqual({ kind: "text", text: `${PLANS.basic.priceIls} ₪` });
    expect(row("price").pro).toEqual({ kind: "text", text: `${PLANS.pro.priceIls} ₪` });
    expect(row("messages").basic).toEqual({ kind: "text", text: "עד 750 הודעות" });
    expect(row("messages").pro).toEqual({ kind: "text", text: "עד 3,000 הודעות, בשימוש הוגן" });
    expect(row("accounts").basic).toEqual({ kind: "text", text: "אחד: Google או Microsoft" });
    expect(row("accounts").pro).toEqual({ kind: "text", text: "Google ו-Microsoft יחד" });
  });

  it("every pro-only line is 'no' on basic and 'yes' (or 'בקרוב' while it is built) on pro, in pro's own words", () => {
    const b = entitlements("basic");
    const flags = { drive: "driveFullRead", file_create: "fileCreate", sharepoint: "sharepoint", tasks: "tasks", proactive: "proactive", meetings: "meetingSummaries", business: "businessSystems" } as const;
    for (const [id, k] of Object.entries(flags)) {
      const r = row(id);
      expect(kind(r.basic), id).toBe(b[k] ? "yes" : "no");
      expect(kind(r.pro), id).toBe(COMING_SOON.includes(k) ? "soon" : "yes");
      expect(r.label, id).toBe(planFeatures("pro").lines.find((l) => l.id === id)!.text);
    }
    // the shared lines are basic's words, included in both
    for (const id of ["mail", "calendar", "files", "routine"]) {
      expect(row(id).label).toBe(planFeatures("basic").lines.find((l) => l.id === id)!.text);
      expect([kind(row(id).basic), kind(row(id).pro)]).toEqual(["yes", "yes"]);
    }
  });

  it("meeting summaries: Teams and Google Meet included in pro; Zoom 'בקרוב' in pro, not in basic", () => {
    expect([kind(row("meetings").basic), kind(row("meetings").pro)]).toEqual(["no", "yes"]);
    expect(row("meetings_zoom")).toEqual({ id: "meetings_zoom", label: "סיכומי פגישות Zoom", basic: { kind: "no" }, pro: { kind: "soon" } });
  });

  it("agents: the built-ins on pro only, one custom agent on basic and three on pro", () => {
    expect([kind(row("builtin").basic), kind(row("builtin").pro)]).toEqual(["no", "yes"]);
    expect(row("custom").basic).toEqual({ kind: "text", text: "סוכן אחד" });
    expect(row("custom").pro).toEqual({ kind: "text", text: `עד ${PLANS.pro.customAgents} סוכנים` });
  });

  it("the trial note: the free messages, one account like basic", () => {
    expect(trialNote()).toMatch(new RegExp(`^${TRIAL_MESSAGES} ההודעות הראשונות בחינם`));
    expect(trialNote()).toContain("חשבון אחד, כמו בבסיסי");
  });
});
