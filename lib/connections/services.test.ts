import { describe, expect, it } from "vitest";
import type { ConnectionRow } from "@/lib/db/types";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, normalizeScopes } from "@/lib/google/oauth";
import { MS_SCOPES, MS_SCOPES_V1 } from "@/lib/ms/oauth";
import { GOOGLE_SERVICES, MICROSOFT_SERVICES, OPEN_GATES, activeServicesFor, activeServicesLine, connectionServices, envReadGates, gateFrom, type ReadGates, type ServiceView } from "./services";

const google = (scopes: readonly string[]): Pick<ConnectionRow, "provider" | "scopes"> => ({ provider: "google", scopes: normalizeScopes([...scopes]) });
const microsoft = (scopes: readonly string[]): Pick<ConnectionRow, "provider" | "scopes"> => ({ provider: "microsoft", scopes: [...scopes] });
const byId = (views: ServiceView[]) => Object.fromEntries(views.map((v) => [v.id, v]));
const statuses = (views: ServiceView[]) => Object.fromEntries(views.map((v) => [v.id, v.status]));

const BASE = [...GOOGLE_BASE_SCOPES];
const ALL_GOOGLE = [...BASE, GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.driveReadonly];

describe("the service catalogue", () => {
  it("lists the services Daniel asked for, per provider, with unique ids and Hebrew labels", () => {
    expect(GOOGLE_SERVICES.map((s) => s.label)).toEqual(["Gmail", "יומן Google", "Google Tasks", "Google Drive", "Google Docs", "Google Sheets", "Google Slides"]);
    expect(MICROSOFT_SERVICES.map((s) => s.label)).toEqual(["Outlook", "יומן Outlook", "OneDrive", "SharePoint", "Microsoft To Do", "קבצי Word, Excel ו-PowerPoint"]);
    const ids = [...GOOGLE_SERVICES, ...MICROSOFT_SERVICES].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // every scope a Microsoft service needs is one we request
    for (const s of MICROSOFT_SERVICES) for (const scope of s.required) expect(MS_SCOPES as readonly string[], `${s.id} → ${scope}`).toContain(scope);
    // and every Google scope is one we can ask for (base set or a feature)
    for (const s of GOOGLE_SERVICES) for (const scope of [...s.required, ...(s.gated ? [s.gated.scope] : [])]) expect(ALL_GOOGLE, `${s.id} → ${scope}`).toContain(scope);
  });

  it("names each icon for the screen reader and the tooltip: 'Gmail - מחובר', with the short hyphen", () => {
    const views = connectionServices(google(ALL_GOOGLE));
    expect(views.map((v) => v.name)).toEqual(["Gmail - מחובר", "יומן Google - מחובר", "Google Tasks - מחובר", "Google Drive - מחובר", "Google Docs - מחובר", "Google Sheets - מחובר", "Google Slides - מחובר"]);
    for (const v of [...views, ...connectionServices(google([])), ...connectionServices(microsoft([]))]) {
      expect(v.note.length).toBeGreaterThan(5);
      expect(`${v.name} ${v.note} ${v.action ?? ""}`).not.toMatch(/[–—]/);
    }
    expect(byId(views).google_calendar!.note).toContain("Google Meet");
    expect(byId(connectionServices(microsoft(MS_SCOPES))).outlook_calendar!.note).toContain("Teams");
  });
});

describe("Google: status from the granted scopes", () => {
  it("everything granted and both reads open → all connected, no links", () => {
    const views = connectionServices(google(ALL_GOOGLE));
    expect(views.every((v) => v.status === "connected" && v.href === null)).toBe(true);
  });

  it("the base set without the restricted reads, reads open → Gmail, Drive and the Docs family need one more approval (incremental links)", () => {
    const v = byId(connectionServices(google(BASE)));
    expect(statuses(Object.values(v))).toEqual({ gmail: "needs_consent", google_calendar: "connected", google_tasks: "connected", google_drive: "needs_consent", google_docs: "needs_consent", google_sheets: "needs_consent", google_slides: "needs_consent" });
    expect(v.gmail).toMatchObject({ name: "Gmail - צריך אישור נוסף", href: "/api/auth/google/start?feature=gmail_read" });
    expect(v.gmail!.note).toContain("השליחה פעילה");
    expect(v.gmail!.action).toBe("לחיצה פותחת את האישור ב-Google");
    expect(v.google_drive!.href).toBe("/api/auth/google/start?feature=drive_read");
    expect(v.google_docs!.href).toBe("/api/auth/google/start?feature=drive_read");
  });

  it("a connection from before Tasks joined → Google Tasks needs an approval for `tasks` only", () => {
    const old = google(["openid", "email", GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend]);
    const tasks = byId(connectionServices(old)).google_tasks!;
    expect(tasks).toMatchObject({ status: "needs_consent", statusLabel: "צריך אישור נוסף", href: "/api/auth/google/start?feature=tasks", note: "הצגה והוספה של משימות", action: "לחיצה פותחת את האישור ב-Google" });
  });

  it("a required scope unticked → a plain reconnect (no feature)", () => {
    const v = byId(connectionServices(google(["openid", "email", GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.tasks])));
    expect(v.google_calendar).toMatchObject({ status: "needs_consent", href: "/api/auth/google/start" });
  });

  it("cap full for this account → Gmail and Drive stay connected for what works, the Docs family is unavailable", () => {
    const gates: ReadGates = { gmail_read: "cap_reached", drive_read: "cap_reached" };
    const v = byId(connectionServices(google(BASE), { gates }));
    expect(v.gmail).toMatchObject({ status: "connected", note: "שליחת מיילים אחרי אישור", href: null });
    expect(v.google_drive).toMatchObject({ status: "connected", note: "קבצים שנוצרו או נפתחו דרכי, ושמירת מסמכים" });
    expect(v.google_sheets).toMatchObject({ status: "unavailable", name: "Google Sheets - לא זמין", note: "פתוח כרגע רק למשתמשים הראשונים, והמקומות התמלאו", href: null });
    // a grant from before the cap filled still counts
    expect(byId(connectionServices(google(ALL_GOOGLE), { gates })).google_docs!.status).toBe("connected");
  });

  it("a read switched off is off also for a connection that granted it (the kill switch)", () => {
    const gates: ReadGates = { gmail_read: "disabled", drive_read: "disabled" };
    const v = byId(connectionServices(google(ALL_GOOGLE), { gates }));
    expect(v.gmail).toMatchObject({ status: "connected", note: "שליחת מיילים אחרי אישור" });
    expect(v.google_slides).toMatchObject({ status: "unavailable", note: "כבוי כרגע. שאר השירותים ממשיכים לעבוד" });
  });

  it("no recorded scopes = the base set (as the chat tools assume); onboarding links come back to the signup flow", () => {
    expect(statuses(connectionServices({ provider: "google", scopes: [] }))).toMatchObject({ google_calendar: "connected", google_tasks: "connected", gmail: "needs_consent" });
    expect(byId(connectionServices(google(BASE), { returnTo: "onboarding" })).gmail!.href).toBe("/api/auth/google/start?feature=gmail_read&returnTo=onboarding");
  });
});

describe("Microsoft: status from the granted scopes", () => {
  it("the current set → every service connected", () => {
    expect(connectionServices(microsoft(MS_SCOPES)).every((v) => v.status === "connected")).toBe(true);
  });

  it("a connection made before Tasks / Sites → To Do and SharePoint need approval through the normal connect; the rest works", () => {
    const v = byId(connectionServices(microsoft(MS_SCOPES_V1)));
    expect(statuses(Object.values(v))).toEqual({ outlook: "connected", outlook_calendar: "connected", onedrive: "connected", sharepoint: "needs_consent", microsoft_todo: "needs_consent", office_files: "connected" });
    expect(v.microsoft_todo).toMatchObject({ name: "Microsoft To Do - צריך אישור נוסף", href: "/api/auth/microsoft/start" });
    expect(v.sharepoint!.action).toContain("אישור מנהל");
    expect(v.onedrive!.action).toBeNull();
    // nothing recorded → assumed to be that same v1 set
    expect(statuses(connectionServices(microsoft([])))).toEqual(statuses(Object.values(v)));
  });

  it("scopes echoed with the Graph prefix or another case still count", () => {
    const echoed = ["https://graph.microsoft.com/Mail.ReadWrite", "https://graph.microsoft.com/mail.send", "Calendars.ReadWrite", "files.read.all", "https://graph.microsoft.com/Tasks.ReadWrite", "SITES.READ.ALL", "openid"];
    expect(connectionServices(microsoft(echoed)).every((v) => v.status === "connected")).toBe(true);
  });
});

describe("helpers", () => {
  it("gates from the user-cap decision and from the switches", () => {
    expect(gateFrom({ allowed: true, reason: "already_counted" })).toBe("open");
    expect(gateFrom({ allowed: false, reason: "cap_reached" })).toBe("cap_reached");
    expect(gateFrom({ allowed: false, reason: "disabled" })).toBe("disabled");
    expect(envReadGates({})).toEqual({ gmail_read: "disabled", drive_read: "disabled" });
    expect(envReadGates({ GOOGLE_CLIENT_ID: "x", GOOGLE_DRIVE_READ_ENABLED: "false" })).toEqual({ gmail_read: "open", drive_read: "disabled" });
    expect(envReadGates({ GOOGLE_GMAIL_READ_ENABLED: "maybe" }).gmail_read).toBe("disabled");
    expect(OPEN_GATES).toEqual({ gmail_read: "open", drive_read: "open" });
  });

  it("the account-context line names only the connected services, in Hebrew list style", () => {
    expect(activeServicesFor(google(BASE), { gmail_read: "disabled", drive_read: "disabled" })).toBe("Gmail, יומן Google, Google Tasks ו-Google Drive");
    expect(activeServicesFor(microsoft(MS_SCOPES_V1))).toBe("Outlook, יומן Outlook, OneDrive וקבצי Word, Excel ו-PowerPoint");
    expect(activeServicesLine([])).toBe("");
    expect(activeServicesLine(connectionServices(google([GOOGLE_SCOPES.calendarEvents])).filter((v) => v.id === "google_calendar"))).toBe("יומן Google");
  });
});
