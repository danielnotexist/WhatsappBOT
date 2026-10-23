import { describe, expect, it } from "vitest";
import {
  COMING_SOON,
  PLANS,
  PRO_FEATURES,
  TRIAL_MESSAGES,
  connectionsInForce,
  customAgentLimit,
  builtinAgentsIncluded,
  entitlements,
  mayConnect,
  missingProFeatures,
  planFeatures,
  primaryProvider,
  proSoonTexts,
  providerGate,
} from "./plans";

const row = (provider: "microsoft" | "google", created_at: string, status = "active") => ({ provider, status, created_at });

describe("entitlements: the split of 23.10.2026 (Daniel)", () => {
  it("the table: basic is one account without the pro services, pro has everything, the trial is basic in what it connects", () => {
    expect(entitlements("basic")).toEqual({
      plan: "basic",
      messages: 750,
      maxProviders: 1,
      tasks: false,
      sharepoint: false,
      fileCreate: false,
      driveFullRead: false,
      meetingSummaries: false,
      proactive: false,
      businessSystems: false,
      builtinAgents: false,
      customAgents: 1,
    });
    expect(entitlements("pro")).toEqual({
      plan: "pro",
      messages: 3000,
      maxProviders: 2,
      tasks: true,
      sharepoint: true,
      fileCreate: true,
      driveFullRead: true,
      meetingSummaries: true,
      proactive: true,
      businessSystems: true,
      builtinAgents: true,
      customAgents: 3,
    });
    // the trial: basic's connections and services, its own 10 messages, the built-ins as they are (agents.md §0.3)
    const caps = ["maxProviders", "tasks", "sharepoint", "fileCreate", "driveFullRead", "meetingSummaries", "proactive", "businessSystems"] as const;
    for (const k of caps) expect(entitlements("trial")[k], k).toBe(entitlements("basic")[k]);
    expect(entitlements("trial")).toMatchObject({ messages: TRIAL_MESSAGES, builtinAgents: true, customAgents: 0 });
  });

  it("agrees with the plan table and the agent helpers", () => {
    for (const plan of ["basic", "pro"] as const) {
      expect(entitlements(plan).messages).toBe(PLANS[plan].messages);
      expect(entitlements(plan).customAgents).toBe(PLANS[plan].customAgents);
    }
    for (const plan of ["trial", "basic", "pro"] as const) {
      expect(entitlements(plan).customAgents).toBe(customAgentLimit(plan));
      expect(entitlements(plan).builtinAgents).toBe(builtinAgentsIncluded(plan));
    }
  });

  it("the pro services missing on a plan (what pro_feature answers)", () => {
    expect(missingProFeatures("basic")).toEqual(["second_account", "tasks", "sharepoint", "file_create", "drive_full_read", "proactive", "meeting_summaries"]);
    expect(missingProFeatures("trial")).toEqual(missingProFeatures("basic"));
    expect(missingProFeatures("pro")).toEqual([]);
    for (const f of Object.values(PRO_FEATURES)) expect(f.label).not.toMatch(/[–—]/);
  });
});

describe("planFeatures: the plans in words, generated from the entitlements", () => {
  it("basic: one account, mail, calendar with Meet / Teams, file reading, the routine, one agent; nothing 'soon'", () => {
    const basic = planFeatures("basic");
    expect(basic.lead).toBeNull();
    expect(basic.lines.map((l) => l.id)).toEqual(["account", "mail", "calendar", "files", "routine", "agents"]);
    expect(basic.lines[0]!.text).toBe("חשבון אחד: Google או Microsoft");
    expect(basic.lines.find((l) => l.id === "calendar")!.text).toContain("Meet או Teams");
    expect(basic.lines.find((l) => l.id === "agents")!.text).toContain("סוכן אחד משלך");
    expect(basic.lines.some((l) => l.soon)).toBe(false);
  });

  it("pro: 'כל מה שבבסיסי, ובנוסף:' and only what pro adds; alerts, phishing warnings and Teams / Meet summaries available; Zoom summaries and business systems 'soon'", () => {
    const pro = planFeatures("pro");
    expect(pro.lead).toBe("כל מה שבבסיסי, ובנוסף:");
    expect(pro.lines.map((l) => [l.id, Boolean(l.soon)])).toEqual([
      ["accounts", false],
      ["tasks", false],
      ["drive", false],
      ["sharepoint", false],
      ["file_create", false],
      ["agents", false],
      ["meetings", false],
      ["proactive", false],
      ["business", true],
    ]);
    expect(pro.lines.find((l) => l.id === "agents")!.text).toBe(`שלושת הסוכנים המובנים, ועד ${PLANS.pro.customAgents} סוכנים משלך`);
    // meeting summaries shipped for Teams and Google Meet (lib/meetings); Zoom is the truthful "בקרוב"
    expect(pro.lines.find((l) => l.id === "meetings")!.text).toBe("סיכומי פגישות Teams ו-Google Meet");
    // Zoom: "בקרוב" where the coming things are listed, not a line of the compact card
    expect(pro.lines.map((l) => l.id)).not.toContain("meetings_zoom");
    expect(proSoonTexts()).toEqual(["סיכומי פגישות Zoom", "חיבור למערכות העסק, כמו monday.com"]);
    expect(COMING_SOON).not.toContain("meetingSummaries");
  });

  it("site text: the short hyphen only, no slash gender forms", () => {
    for (const plan of ["basic", "pro"] as const) {
      for (const l of planFeatures(plan).lines) {
        expect(l.text, l.id).not.toMatch(/[–—]/);
        expect(l.text, l.id).not.toMatch(/[א-ת]\/[א-ת]/);
      }
    }
  });
});

describe("one account on basic and in the trial", () => {
  it("the account in force is the newest active connection; revoked and expired rows do not count", () => {
    expect(primaryProvider([])).toBeNull();
    expect(primaryProvider([row("microsoft", "2026-10-01T00:00:00Z"), row("google", "2026-10-20T00:00:00Z")])).toBe("google");
    expect(primaryProvider([row("microsoft", "2026-10-01T00:00:00Z"), row("google", "2026-10-20T00:00:00Z", "revoked")])).toBe("microsoft");
    expect(primaryProvider([row("google", "2026-10-20T00:00:00Z", "expired")])).toBeNull();
  });

  it("both connected before the split: basic keeps the newest in force and pauses the other, nothing removed; pro uses both", () => {
    const both = [row("microsoft", "2026-10-01T00:00:00Z"), row("google", "2026-10-20T00:00:00Z")];
    expect(providerGate(both, "basic")).toEqual({ inForce: ["google"], paused: ["microsoft"] });
    expect(providerGate(both, "trial")).toEqual({ inForce: ["google"], paused: ["microsoft"] });
    expect(providerGate(both, "pro")).toEqual({ inForce: ["microsoft", "google"], paused: [] });
    expect(connectionsInForce(both, "basic").map((c) => c.provider)).toEqual(["google"]);
    expect(connectionsInForce(both, "pro")).toEqual(both);
    expect(both).toHaveLength(2); // the input is never changed
    // one active and one expired: nothing to pause
    expect(providerGate([row("microsoft", "2026-10-01T00:00:00Z"), row("google", "2026-10-20T00:00:00Z", "expired")], "basic")).toEqual({ inForce: ["microsoft"], paused: [] });
  });

  it("may connect: the first account, or the one in force again; a second one only on pro", () => {
    const ms = [row("microsoft", "2026-10-01T00:00:00Z")];
    expect(mayConnect([], "trial", "google")).toBe(true);
    expect(mayConnect(ms, "basic", "microsoft")).toBe(true);
    expect(mayConnect(ms, "basic", "google")).toBe(false);
    expect(mayConnect(ms, "trial", "google")).toBe(false);
    expect(mayConnect(ms, "pro", "google")).toBe(true);
    // an expired account does not hold the place: another may be connected instead
    expect(mayConnect([row("microsoft", "2026-10-01T00:00:00Z", "expired")], "basic", "google")).toBe(true);
  });
});
