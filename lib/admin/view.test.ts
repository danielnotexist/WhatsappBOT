import { describe, expect, it } from "vitest";
import type { AdminDailyRow, AdminUserRow, JobRow } from "@/lib/db/types";
import { filterUsers, formatAgo, formatPhoneIl, formatUsd, funnel, helpItems, kpis, planSplit, problemsOf, sourceSplit, stageOf, userQueryFrom, waLink } from "./view";

const NOW = new Date("2026-10-24T12:00:00Z");
const H = 3_600_000;

function user(over: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    email: "a@example.com",
    name: null,
    business_name: null,
    created_at: new Date(NOW.getTime() - 2 * H).toISOString(),
    last_seen_at: null,
    signup_source: null,
    onboarding_step: null,
    plan: "trial",
    sub_status: null,
    charge_failures: 0,
    phone: null,
    wa_linked: false,
    connections_active: 0,
    connections_broken: 0,
    connections_ever: 0,
    providers: [],
    usage_used: null,
    usage_limit: null,
    messages_30d: 0,
    ai_cost_30d: 0,
    errors_7d: 0,
    failed_jobs_7d: 0,
    paid: false,
    open_tickets: 0,
    ...over,
  };
}

describe("the users list", () => {
  const rows = [
    user({ email: "dana@levi.co.il", name: "דנה לוי", phone: "+972501234567", plan: "basic", sub_status: "active", messages_30d: 40, created_at: new Date(NOW.getTime() - 5 * 24 * H).toISOString() }),
    user({ email: "yossi@kohen.co.il", business_name: "כהן רואי חשבון", plan: "pro", sub_status: "past_due", charge_failures: 1, ai_cost_30d: 2.5 }),
    user({ email: "new@example.com", created_at: new Date(NOW.getTime() - 30 * H).toISOString() }),
  ];

  it("searches by email, name, business and phone (also the local 05… form)", () => {
    expect(filterUsers(rows, { q: "LEVI" }, NOW).rows.map((u) => u.email)).toEqual(["dana@levi.co.il"]);
    expect(filterUsers(rows, { q: "כהן" }, NOW).rows.map((u) => u.email)).toEqual(["yossi@kohen.co.il"]);
    expect(filterUsers(rows, { q: "050-123" }, NOW).rows.map((u) => u.email)).toEqual(["dana@levi.co.il"]);
    expect(filterUsers(rows, { q: "4567" }, NOW).rows.map((u) => u.email)).toEqual(["dana@levi.co.il"]);
  });

  it("filters by plan, status and problem; sorts", () => {
    expect(filterUsers(rows, { plan: "pro" }, NOW).total).toBe(1);
    expect(filterUsers(rows, { status: "none" }, NOW).rows.map((u) => u.email)).toEqual(["new@example.com"]);
    expect(filterUsers(rows, { problem: "billing" }, NOW).rows.map((u) => u.email)).toEqual(["yossi@kohen.co.il"]);
    expect(filterUsers(rows, { problem: "stuck" }, NOW).rows.map((u) => u.email).sort()).toEqual(["dana@levi.co.il", "new@example.com"]);
    expect(filterUsers(rows, { problem: "help" }, NOW).total).toBe(3);
    expect(filterUsers(rows, { sort: "messages" }, NOW).rows[0]!.email).toBe("dana@levi.co.il");
    expect(filterUsers(rows, { sort: "cost" }, NOW).rows[0]!.email).toBe("yossi@kohen.co.il");
  });

  it("reads only known values from the URL", () => {
    expect(userQueryFrom({ q: "  x ", plan: "gold", status: "none", problem: "limit", sort: "seen", page: "3" })).toEqual({ q: "x", plan: undefined, status: "none", problem: "limit", sort: "seen", page: 3 });
    expect(userQueryFrom({ page: "-1", sort: "evil" })).toMatchObject({ page: undefined, sort: undefined });
  });
});

describe("צריך עזרה", () => {
  it("one list: payments first, then broken connections, failing work, the limit and stuck sign-ups", () => {
    const failing = user({ id: "u-err", name: "דנה", errors_7d: 1, failed_jobs_7d: 1, wa_linked: true });
    const job = { id: "j", user_id: "u-err", kind: "reminder", run_at: NOW.toISOString(), payload: {}, status: "failed", attempts: 3, max_attempts: 3, last_error: "Graph 503", dedupe_key: null } satisfies JobRow;
    const items = helpItems(
      [
        user({ id: "u-stuck", email: "s@example.com", created_at: new Date(NOW.getTime() - 48 * H).toISOString() }),
        user({ id: "u-limit", wa_linked: true, usage_used: 10, usage_limit: 10 }),
        failing,
        user({ id: "u-broken", wa_linked: true, connections_broken: 1 }),
        user({ id: "u-pay", wa_linked: true, sub_status: "past_due", charge_failures: 2 }),
        user({ id: "u-fine", wa_linked: true }),
      ],
      [job],
      NOW,
    );
    expect(items.map((i) => [i.kind, i.userId])).toEqual([
      ["billing", "u-pay"],
      ["broken", "u-broken"],
      ["errors", "u-err"],
      ["limit", "u-limit"],
      ["stuck", "u-stuck"],
    ]);
    expect(items.find((i) => i.kind === "errors")!.detail).toContain("Graph 503");
    expect(problemsOf(user({ wa_linked: true }), NOW)).toEqual([]);
  });
});

describe("the overview", () => {
  it("figures, the funnel, the plans and the sources", () => {
    const rows = [
      user({ plan: "pro", sub_status: "active", paid: true, connections_ever: 1, wa_linked: true, last_seen_at: NOW.toISOString(), signup_source: { utm_source: "google" } }),
      user({ plan: "basic", sub_status: "past_due", paid: true, connections_ever: 1, wa_linked: true, signup_source: { utm_source: "google" } }),
      user({ plan: "trial", wa_linked: true, signup_source: { ref: "www.linkedin.com" } }),
      user({ created_at: new Date(NOW.getTime() - 20 * 24 * H).toISOString() }),
    ];
    const daily: AdminDailyRow[] = [
      { day: "2026-09-30", signups: 0, active_users: 0, messages: 0, ai_cost: 9, revenue: 0 },
      { day: "2026-10-23", signups: 1, active_users: 2, messages: 5, ai_cost: 0.4, revenue: 0 },
      { day: "2026-10-24", signups: 2, active_users: 3, messages: 9, ai_cost: 0.6, revenue: 352.82 },
    ];
    expect(kpis(rows, daily, NOW)).toEqual({ users: 4, newThisWeek: 3, activeToday: 3, activeWeek: 1, mrrIls: 398, paying: 2, aiToday: 0.6, aiMonth: 1 });
    expect(funnel(rows).map((s) => s.count)).toEqual([4, 3, 2, 2]);
    expect(stageOf(rows[2]!)).toBe("whatsapp");
    expect(planSplit(rows).map((s) => s.count)).toEqual([2, 1, 1]);
    expect(sourceSplit(rows, 1)).toEqual([
      { key: "google", label: "google", count: 2 },
      { key: "other", label: "אחר", count: 2 },
    ]);
  });

  it("formats", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.004)).toBe("פחות מסנט");
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(1234.5)).toBe("$1,235");
    expect(formatAgo(null, NOW)).toBe("אף פעם");
    expect(formatAgo(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe("לפני 5 דקות");
    expect(formatPhoneIl("+972501234567")).toBe("050-123-4567");
    expect(waLink("+972501234567")).toBe("https://wa.me/972501234567");
  });
});
