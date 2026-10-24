import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppErrorRow, AuditRow, BillingApprovalRow, JobRow } from "@/lib/db/types";
import { AUDIT_LABELS, BILLING_KIND_LABEL, PENDING_DONE, activityQueryFrom, auditLabel, filterActivity, mergeTimeline, resultOf, ACTIVITY_PAGE_SIZE } from "./audit-labels";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/**
 * Every action name the code writes to audit_log: `action: "…"` / `action: \`…\`` in an entry, the literals passed to
 * the small audit(…) wrappers (lib/agents/service.ts, lib/billing/one-tap.ts, whatsapp.ts), `const action = … ? "…" : …`,
 * and the admin pages' UserViewAction union. Template parts (`${kind}`) become a pattern.
 */
function actionsInCode(): { name: string; file: string }[] {
  const files = ["app", "lib"].flatMap((d) => sources(join(ROOT, d))).filter((f) => !f.endsWith("audit-labels.ts"));
  const out: { name: string; file: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const writes = /addAudit|audit\.push|audit\(/.test(src);
    if (!writes && !file.endsWith("user-view.ts")) continue;
    const rel = file.slice(ROOT.length + 1);
    const push = (name: string) => out.push({ name, file: rel });
    for (const m of src.matchAll(/\baction:\s*"([^"\n]+)"/g)) push(m[1]!);
    for (const m of src.matchAll(/\baction:\s*`([^`\n]+)`/g)) push(m[1]!);
    for (const m of src.matchAll(/\baction\s*=\s*`([^`\n]+)`/g)) push(m[1]!);
    for (const m of src.matchAll(/\bconst action = ([^;\n]+);/g)) for (const lit of m[1]!.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)) push(lit[1]!);
    for (const m of src.matchAll(/\baudit\(([^()\n]*)\)/g)) for (const lit of m[1]!.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)) push(lit[1]!);
    for (const m of src.matchAll(/"(admin\.view_[a-z_]+)"/g)) push(m[1]!);
  }
  return out;
}

const asPattern = (name: string) => new RegExp(`^${name.replace(/[.]/g, "\\.").replace(/\$\{[^}]+\}/g, "[a-z_]+")}$`);

describe("audit labels", () => {
  const found = actionsInCode();

  it("the scanner finds the actions the code writes (a sanity floor, and a few by name)", () => {
    const names = new Set(found.map((f) => f.name));
    expect(names.size).toBeGreaterThan(60);
    for (const n of ["login", "reminder.create", "google.revoke", "subscription.upgrade", "agent.update", "admin.view_conversation", "admin.view_activity", "billing.approve.${kind}", "${action.kind}.execute"]) {
      expect(names, n).toContain(n);
    }
  });

  it("every action string written in the code has a Hebrew label", () => {
    const missing = found.filter(({ name }) => (name.includes("${") ? ![...AUDIT_LABELS.keys()].some((k) => asPattern(name).test(k)) : !auditLabel(name).known));
    expect(missing).toEqual([]);
  });

  it("the dynamic families are complete: every draft kind and every billing kind", () => {
    for (const kind of Object.keys(PENDING_DONE)) {
      expect(auditLabel(`${kind}.execute`).known).toBe(true);
      expect(auditLabel(`${kind}.cancel`).known).toBe(true);
    }
    for (const kind of Object.keys(BILLING_KIND_LABEL)) for (const v of ["offer", "approve", "decline"]) expect(auditLabel(`billing.${v}.${kind}`).known).toBe(true);
  });

  it("words, not action names", () => {
    expect(auditLabel("login")).toEqual({ label: "נכנס לאתר", category: "login", known: true });
    expect(auditLabel("reminder.create")).toMatchObject({ label: "יצר תזכורת", category: "reminders" });
    expect(auditLabel("google.revoke")).toMatchObject({ label: "ניתק את Google", category: "connections" });
    expect(auditLabel("subscription.upgrade")).toMatchObject({ label: "שדרג תוכנית", category: "billing" });
    expect(auditLabel("send_mail.execute")).toMatchObject({ label: "שלח מייל", category: "on_behalf" });
    expect(auditLabel("admin.view_user").category).toBe("admin");
  });

  it("an unknown action keeps its raw name, with a category guessed from its prefix", () => {
    expect(auditLabel("billing.something_new")).toEqual({ label: "billing.something_new", category: "billing", known: false });
    expect(auditLabel("weird")).toMatchObject({ label: "weird", known: false });
  });

  it("results: succeeded, cancelled or failed, with the raw reason when there is more than ok", () => {
    expect(resultOf("login", "ok")).toEqual({ status: "ok", reason: null });
    expect(resultOf("google.connect", "ok:demo")).toEqual({ status: "ok", reason: "ok:demo" });
    expect(resultOf("google.connect", "error:state_expired")).toEqual({ status: "failed", reason: "error:state_expired" });
    expect(resultOf("subscription.charge", "failed:33:card")).toMatchObject({ status: "failed" });
    expect(resultOf("payment.token", "token_failed: boom")).toMatchObject({ status: "failed" });
    expect(resultOf("reminder.cancel", "cancelled")).toMatchObject({ status: "cancelled" });
    expect(resultOf("billing.approve.upgrade", "stale:offer")).toMatchObject({ status: "cancelled" });
    expect(resultOf("billing.decline.cancel", "declined")).toMatchObject({ status: "cancelled" });
    expect(resultOf("subscription.charge", "unknown:no_trans_id")).toMatchObject({ status: "review" });
    expect(resultOf("connection.expired", "invalid_grant")).toEqual({ status: "failed", reason: "invalid_grant" });
    // "it went out" results carry no reason line; anything more specific does
    expect(resultOf("reminder.fire", "template")).toEqual({ status: "ok", reason: null });
    expect(resultOf("meeting.tasks", "3/3")).toEqual({ status: "ok", reason: "3/3" });
    expect(resultOf("signup", null)).toEqual({ status: "ok", reason: null });
  });
});

describe("one timeline", () => {
  const audit: AuditRow[] = [
    { user_id: "u", action: "login", result: "ok", created_at: "2026-10-20T08:00:00.000Z" },
    { user_id: "u", action: "agent.create", result: "ok", target: "custom_1", agent_name: "עוזרת משפטית", created_at: "2026-10-22T08:00:00.000Z" },
    { user_id: "u", action: "wa.link", result: "ok", target: "11111111-2222-4333-8444-555555555555", created_at: "2026-09-01T08:00:00.000Z" },
  ];
  const errors: AppErrorRow[] = [{ id: "e1", at: "2026-10-21T08:00:00.000Z", user_id: "u", source: "bot", message: "token refresh failed", context: {} }];
  const jobs = [
    { id: "j1", user_id: "u", kind: "morning_summary", run_at: "2026-10-23T05:00:00.000Z", payload: {}, status: "failed", attempts: 3, max_attempts: 3, last_error: "Graph 503", dedupe_key: null },
    { id: "j2", user_id: "u", kind: "reminder", run_at: "2026-10-23T06:00:00.000Z", payload: {}, status: "done", attempts: 1, max_attempts: 3, last_error: null, dedupe_key: null },
  ] as JobRow[];
  const approvals = [{ id: "b1", user_id: "u", kind: "upgrade", plan: "pro", amount_ils: 353, status: "declined", ccode: null, error: null, created_at: "2026-10-19T08:00:00.000Z" }] as unknown as BillingApprovalRow[];

  it("merges the audit, the errors, the failed jobs (only) and the approvals, newest first, each with its category", () => {
    const t = mergeTimeline({ audit, errors, jobs, approvals });
    expect(t.map((e) => [e.category, e.label, e.status])).toEqual([
      ["errors", "עבודה שנכשלה: סיכום בוקר", "failed"],
      ["agents", "יצר סוכן", "ok"],
      ["errors", "תקלה", "failed"],
      ["login", "נכנס לאתר", "ok"],
      ["billing", "בקשת אישור: שדרוג לפרו", "cancelled"],
      ["whatsapp", "קישר את הוואטסאפ", "ok"],
    ]);
    expect(t[1]!.detail).toBe("עוזרת משפטית");
    expect(t.at(-1)!.detail).toBeNull(); // an id is never shown
    expect(t[0]!.reason).toBe("Graph 503");
  });

  it("filters by range and category, counts per category within the range, and pages", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    const t = mergeTimeline({ audit, errors, jobs, approvals });
    const week = filterActivity(t, activityQueryFrom({ range: "7" }), now);
    expect(week.inRange).toBe(5);
    expect(week.counts).toMatchObject({ errors: 2, agents: 1, login: 1, billing: 1, whatsapp: 0 });
    const errs = filterActivity(t, activityQueryFrom({ range: "all", cat: "errors" }), now);
    expect(errs.rows.map((e) => e.category)).toEqual(["errors", "errors"]);
    expect(errs.inRange).toBe(6);
    const many = Array.from({ length: ACTIVITY_PAGE_SIZE + 5 }, (_, i) => ({ ...t[0]!, id: `x${i}` }));
    const p2 = filterActivity(many, activityQueryFrom({ range: "all", page: "2" }), now);
    expect([p2.page, p2.pages, p2.rows.length]).toEqual([2, 2, 5]);
  });

  it("reads the query from the URL; anything unknown falls back", () => {
    expect(activityQueryFrom({})).toEqual({ category: null, range: "30", page: 1 });
    expect(activityQueryFrom({ cat: "nope", range: "9", page: "-3" })).toEqual({ category: null, range: "30", page: 1 });
    expect(activityQueryFrom({ cat: "billing", range: "all", page: "3" })).toEqual({ category: "billing", range: "all", page: 3 });
  });
});
