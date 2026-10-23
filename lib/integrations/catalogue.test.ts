import { describe, expect, it } from "vitest";
import { PLANS, type PaidPlan } from "@/lib/billing/plans";
import { GOOGLE_BASE_SCOPES, GOOGLE_FEATURE_SCOPES } from "@/lib/google/oauth";
import { MS_SCOPES } from "@/lib/ms/oauth";
import {
  INTEGRATIONS,
  availableIntegrations,
  featuredGroups,
  integrationGroups,
  integrationsForPlan,
  type Integration,
} from "./catalogue";

const byId = (id: string): Integration => {
  const found = INTEGRATIONS.find((i) => i.id === id);
  if (!found) throw new Error(`no integration ${id}`);
  return found;
};
const googleScopes: string[] = [...GOOGLE_BASE_SCOPES, ...Object.values(GOOGLE_FEATURE_SCOPES).flat()];
const msScopes: string[] = [...MS_SCOPES];

describe("the catalogue", () => {
  it("has unique ids, a known vendor and a known status on every line", () => {
    expect(new Set(INTEGRATIONS.map((i) => i.id)).size).toBe(INTEGRATIONS.length);
    for (const i of INTEGRATIONS) {
      expect(["google", "microsoft", "business"], i.id).toContain(i.vendor);
      expect(["available", "soon"], i.id).toContain(i.status);
      expect(i.name.trim(), i.id).not.toBe("");
    }
  });

  it("covers what Daniel asked for: Google, Microsoft 365 (SharePoint and OneDrive too), monday.com and Priority", () => {
    for (const id of ["gmail", "google-calendar", "google-drive", "google-docs", "google-sheets", "google-slides", "google-tasks", "google-meet"])
      expect(byId(id).vendor).toBe("google");
    for (const id of ["outlook", "onedrive", "sharepoint", "word", "excel", "powerpoint", "teams", "todo"]) expect(byId(id).vendor).toBe("microsoft");
    expect(byId("monday").vendor).toBe("business");
    expect(byId("priority").vendor).toBe("business");
  });
});

describe("statuses are truthful (they follow the code, not the plan)", () => {
  it("available today: exactly what the Google and Microsoft connections already do", () => {
    expect(availableIntegrations().map((i) => i.id)).toEqual([
      "gmail",
      "google-calendar",
      "google-drive",
      "google-docs",
      "google-sheets",
      "google-slides",
      "google-meet",
      "google-tasks",
      "outlook",
      "onedrive",
      "word",
      "excel",
      "powerpoint",
      "sharepoint",
      "teams",
      "todo",
    ]);
  });

  it("every Google line marked available rests on a scope the app asks for", () => {
    const needs: Record<string, string> = {
      gmail: "gmail.send",
      "google-calendar": "calendar.events",
      "google-drive": "drive.file",
      "google-docs": "drive.file",
      "google-sheets": "drive.file",
      "google-slides": "drive.file",
      "google-tasks": "/auth/tasks",
      // Meet links: conferenceData on the events she writes (lib/google/tools.ts, online_meeting)
      "google-meet": "calendar.events",
    };
    for (const [id, scope] of Object.entries(needs)) {
      if (byId(id).status === "available") expect(googleScopes.some((s) => s.includes(scope)), id).toBe(true);
    }
    // Google Tasks rides on the base connect since the services row (lib/connections/services.ts)
    expect(googleScopes.some((s) => s.includes("/auth/tasks"))).toBe(true);
    expect(byId("google-tasks").status).toBe("available");
  });

  it("every Microsoft line marked available rests on a Graph scope the app asks for", () => {
    const needs: Record<string, string> = {
      outlook: "Mail.ReadWrite",
      onedrive: "Files.Read.All",
      word: "Files.Read.All",
      excel: "Files.Read.All",
      powerpoint: "Files.Read.All",
      todo: "Tasks.ReadWrite",
      sharepoint: "Sites.Read.All",
      // Teams links: isOnlineMeeting on the events she writes (lib/ms/tools.ts, online_meeting)
      teams: "Calendars.ReadWrite",
    };
    for (const [id, scope] of Object.entries(needs)) {
      if (byId(id).status === "available") expect(msScopes, id).toContain(scope);
    }
    expect(msScopes).toContain("Calendars.ReadWrite");
    expect(msScopes).toContain("Tasks.ReadWrite");
    expect(byId("todo").status).toBe("available");
  });

  it("meeting links are available (create_event / update_event online_meeting); every business system is still 'soon'", () => {
    for (const id of ["google-meet", "teams"]) expect(byId(id).status, id).toBe("available");
    for (const id of ["monday", "priority", "morning", "icount"]) expect(byId(id).status, id).toBe("soon");
  });
});

describe("plans", () => {
  it("both plans include the same connections - only available ones - and nothing that is not in the catalogue", () => {
    const ids = (plan: PaidPlan) => integrationsForPlan(plan).flatMap((g) => g.items.map((i) => i.id));
    expect(ids("basic")).toEqual(ids("pro"));
    expect(ids("basic")).toEqual(availableIntegrations().map((i) => i.id));
    // what differs between the plans lives in lib/billing/plans.ts
    expect(PLANS.basic.messages).not.toBe(PLANS.pro.messages);
  });

  it("groups by vendor in a fixed order, available before soon, empty groups dropped", () => {
    expect(integrationGroups().map((g) => g.vendor)).toEqual(["google", "microsoft", "business"]);
    expect(integrationGroups().map((g) => g.title)).toEqual(["Google", "Microsoft 365", "מערכות העסק"]);
    for (const g of integrationGroups()) {
      const firstSoon = g.items.findIndex((i) => i.status === "soon");
      if (firstSoon >= 0) expect(g.items.slice(firstSoon).every((i) => i.status === "soon"), g.vendor).toBe(true);
    }
    expect(integrationsForPlan("basic").map((g) => g.vendor)).toEqual(["google", "microsoft"]);
  });

  it("the strip under the hero shows only available, featured systems", () => {
    const featured = featuredGroups().flatMap((g) => g.items);
    expect(featured.length).toBeGreaterThanOrEqual(6);
    expect(featured.every((i) => i.status === "available" && i.featured)).toBe(true);
    expect(featuredGroups().map((g) => g.vendor)).toEqual(["google", "microsoft"]);
  });
});

describe("copy", () => {
  it("every benefit is one short Hebrew line: no em/en dash, no slash gender forms, no trailing period", () => {
    for (const i of INTEGRATIONS) {
      expect(i.benefit, i.id).toMatch(/[א-ת]/);
      expect(i.benefit.length, i.id).toBeLessThanOrEqual(48);
      expect(i.benefit, i.id).not.toMatch(/[–—]/);
      expect(i.benefit, i.id).not.toMatch(/[א-ת]\/[א-ת]/);
      expect(i.benefit, i.id).not.toMatch(/[.\n]$/);
      expect(i.name, i.id).not.toMatch(/[–—]/);
    }
  });

  it("speaks of her in the feminine (the style guide): no masculine 'מסכם / מנסח / קורא' forms", () => {
    const all = INTEGRATIONS.map((i) => i.benefit).join(" ");
    expect(all).not.toMatch(/(^|\s)(מסכם|מנסח|קורא|מוצא|שולח|מוסיף)(\s|$)/);
  });

  it("monograms carry a #RRGGBB brand colour and at most two letters", () => {
    for (const i of INTEGRATIONS.filter((x) => x.monogram)) {
      expect(i.monogram!.color, i.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect([...i.monogram!.text].length, i.id).toBeLessThanOrEqual(2);
    }
  });
});
