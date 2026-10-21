// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionRow, SubscriptionRow, UsageRow } from "@/lib/db/types";
import { DeleteAccountForm } from "./_components/delete-account-form";
import { connectionFor, firstName, formatCount, formatDay, formatPhone, greetingFor, paidPlanOf, statusLine, usageView } from "./view";

afterEach(cleanup);

const NOW = new Date("2026-10-21T15:00:00Z"); // 18:00 in Jerusalem

const sub = (patch: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: "s1",
  user_id: "u1",
  plan: "basic",
  status: "active",
  next_charge_at: "2026-11-21T08:00:00Z",
  cancelled_at: null,
  started_at: "2026-10-21T08:00:00Z",
  charge_failures: 0,
  hyp_tokef: null,
  ...patch,
});
const usage = (patch: Partial<UsageRow>): UsageRow => ({ user_id: "u1", period_start: "2026-10-01", counted_messages: 0, free_remaining: 0, plan_limit: 750, ...patch });
const conn = (patch: Partial<ConnectionRow>): ConnectionRow => ({
  id: "c1",
  user_id: "u1",
  provider: "microsoft",
  account_email: "dana@levi-law.co.il",
  tenant_id: null,
  scopes: [],
  status: "active",
  consent_type: "user",
  expires_at: null,
  created_at: "2026-10-21T08:00:00Z",
  revoked_at: null,
  ...patch,
});

describe("greeting and formatting", () => {
  it("greets by the local hour in the user's zone", () => {
    expect(greetingFor(new Date("2026-10-21T05:00:00Z"))).toBe("בוקר טוב"); // 08:00
    expect(greetingFor(new Date("2026-10-21T10:30:00Z"))).toBe("צהריים טובים"); // 13:30
    expect(greetingFor(NOW)).toBe("ערב טוב"); // 18:00
    expect(greetingFor(new Date("2026-10-21T21:30:00Z"))).toBe("לילה טוב"); // 00:30
    expect(greetingFor(NOW, "America/New_York")).toBe("בוקר טוב"); // 11:00
    expect(greetingFor(NOW, "Not/AZone")).toBe("ערב טוב"); // falls back to Jerusalem
  });

  it("formats names, phones, days and counts the Israeli way", () => {
    expect(firstName("דנה לוי")).toBe("דנה");
    expect(firstName("  ")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(formatPhone("+972501234567")).toBe("050-123-4567");
    expect(formatPhone("972-3-1234567")).toBe("03-123-4567");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
    expect(formatDay("2026-10-21T22:30:00Z")).toBe("22.10.2026"); // already the 22nd in Jerusalem
    expect(formatCount(3000)).toBe("3,000");
  });
});

describe("connections", () => {
  it("shows the newest live row per provider and treats revoked rows as history", () => {
    const rows = [
      conn({ id: "old", created_at: "2026-10-01T00:00:00Z", status: "expired" }),
      conn({ id: "new", created_at: "2026-10-20T00:00:00Z", status: "active" }),
      conn({ id: "g", provider: "google", status: "revoked" }),
    ];
    expect(connectionFor(rows, "microsoft")).toMatchObject({ state: "active", row: { id: "new" } });
    expect(connectionFor(rows, "google")).toEqual({ state: "none", row: null });
  });

  it("says in עלזה's voice what is missing", () => {
    expect(statusLine({ phoneLinked: false, microsoft: "active", google: "none" })).toContain("מספר וואטסאפ");
    expect(statusLine({ phoneLinked: true, microsoft: "expired", google: "none" })).toContain("החיבור ל-Outlook הפסיק לעבוד");
    expect(statusLine({ phoneLinked: true, microsoft: "none", google: "none" })).toBe("אני זמינה בוואטסאפ. חיבור למייל וליומן יפתח לי את רוב העבודה.");
    expect(statusLine({ phoneLinked: true, microsoft: "active", google: "active" })).toBe("אני זמינה בוואטסאפ ומחוברת ל-Outlook ול-Gmail.");
  });
});

describe("usage for the meter", () => {
  it("trial: 10 messages, counted from the trial row", () => {
    expect(usageView(null, null, NOW)).toEqual({ plan: "trial", used: 0, limit: 10, resetsOn: null });
    expect(usageView(null, usage({ period_start: "2026-10-21", counted_messages: 4, plan_limit: 10 }), NOW)).toMatchObject({ used: 4, limit: 10 });
  });

  it("paid: only the current month counts; the old trial row right after paying shows 0", () => {
    const active = sub({});
    expect(usageView(active, usage({ period_start: "2026-10-21", counted_messages: 10, plan_limit: 10 }), NOW)).toEqual({ plan: "basic", used: 0, limit: 750, resetsOn: "1.11" });
    expect(usageView(active, usage({ counted_messages: 312 }), NOW)).toMatchObject({ used: 312, limit: 750 });
    expect(usageView(active, usage({ period_start: "2026-09-01", counted_messages: 700 }), NOW)).toMatchObject({ used: 0 });
    expect(usageView(sub({ plan: "pro" }), usage({ counted_messages: 1204, plan_limit: 3000 }), NOW)).toEqual({ plan: "pro", used: 1204, limit: 3000, resetsOn: "1.11" });
    expect(usageView(active, null, new Date("2026-12-10T10:00:00Z")).resetsOn).toBe("1.1");
  });

  it("a cancelled plan runs to the end of the paid period, then it is the trial again", () => {
    expect(paidPlanOf(sub({ status: "cancelled" }), NOW)).toBe("basic");
    expect(paidPlanOf(sub({ status: "cancelled", next_charge_at: "2026-10-01T00:00:00Z" }), NOW)).toBeNull();
    expect(paidPlanOf(sub({ status: "past_due" }), NOW)).toBe("basic");
    expect(paidPlanOf(sub({ plan: "trial", status: "trial" }), NOW)).toBeNull();
    // the trial was used up before paying: after the plan ends the meter shows it full, not empty
    expect(usageView(sub({ status: "cancelled", next_charge_at: "2026-10-01T00:00:00Z" }), usage({ counted_messages: 20 }), NOW)).toMatchObject({ plan: "trial", used: 10 });
  });
});

describe("DeleteAccountForm", () => {
  it("keeps the delete button asleep until the exact word is typed", async () => {
    const action = vi.fn(async () => {});
    render(<DeleteAccountForm action={action} word="מחיקה" />);
    const button = screen.getByRole("button", { name: "מחיקת החשבון לצמיתות" });
    const input = screen.getByLabelText(/כדי למחוק/);
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "מחיק" } });
    expect(button).toBeDisabled();
    await act(async () => {
      fireEvent.change(input, { target: { value: " מחיקה " } });
    });
    expect(button).toBeEnabled();
    expect(input).toHaveAttribute("name", "confirm");
  });
});

/** The same rule as components/ui/button.test.tsx, for the routes this round owns (pages are not scanned there). */
const PHYSICAL_CLASS =
  /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|(^|:)(text-left|text-right|float-left|float-right|clear-left|clear-right|border-l|border-r|rounded-l|rounded-r)$/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

describe("logical (RTL-safe) classes in the personal area, auth and legal pages", () => {
  const appDir = join(__dirname, "..");
  const files = ["account", "(auth)", "(legal)"].flatMap((d) => tsxFiles(join(appDir, d)));

  it("finds the pages", () => {
    expect(files.some((f) => f.endsWith(join("account", "page.tsx")))).toBe(true);
    expect(files.some((f) => f.endsWith(join("login", "page.tsx")))).toBe(true);
  });

  it.each(files.map((f) => [f.slice(appDir.length + 1), f]))("%s uses no physical left/right utilities", (_name, file) => {
    const literals = [...readFileSync(file, "utf8").matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
    const offenders = literals.flatMap((l) => l.split(/[\s{}$]+/)).filter((t) => PHYSICAL_CLASS.test(t));
    expect(offenders).toEqual([]);
  });
});
