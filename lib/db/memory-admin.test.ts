import { describe, expect, it } from "vitest";
import { MemoryDb } from "./memory";

/** MemoryDb mirrors the admin panel's SQL (0015): admin_user_overview, admin_daily_stats, support_chat_append, the tickets' status. */
describe("MemoryDb — the admin panel (0015)", () => {
  it("the sign-up source is first-touch; last seen moves at most once per interval", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@example.com");
    await db.setSignupSource(u.id, { utm_source: "test" });
    await db.setSignupSource(u.id, { utm_source: "later" });
    expect((await db.adminGetUser(u.id))?.signup_source).toEqual({ utm_source: "test" });
    const t0 = new Date("2026-10-24T10:00:00Z");
    await db.touchLastSeen(u.id, t0, 3_600_000);
    await db.touchLastSeen(u.id, new Date(t0.getTime() + 60_000), 3_600_000);
    expect((await db.adminGetUser(u.id))?.last_seen_at).toBe(t0.toISOString());
    await db.touchLastSeen(u.id, new Date(t0.getTime() + 3_600_000), 3_600_000);
    expect((await db.adminGetUser(u.id))?.last_seen_at).toBe(new Date(t0.getTime() + 3_600_000).toISOString());
  });

  it("the overview: plan, phone, connections, usage, messages, cost, errors, payment and tickets per user", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const b = await db.createUser("b@example.com");
    db.seedSubscription(a.id, "basic", "past_due");
    db.subscriptions.get(a.id)!.charge_failures = 2;
    db.seedWaIdentity(a.id, "+972500000001");
    db.seedConnection(a.id, "google", "a@gmail.com");
    const ms = db.seedConnection(a.id, "microsoft", "a@levi.co.il");
    await db.setConnectionStatus(ms.id, "expired");
    await db.countTrialMessage(a.id);
    await db.insertMessage({ user_id: a.id, wa_message_id: "w1", direction: "in", text: "שלום" });
    await db.insertMessage({ user_id: a.id, direction: "out", text: "היי", cost_usd: 0.01, tools: ["calendar_list_events"] });
    await db.insertAppError({ source: "bot", message: "x", user_id: a.id });
    await db.insertPayment({ user_id: a.id, hyp_trans_id: "T1", amount_ils: 116.82, ccode: "0", acode: null, invoice_url: null, raw: {} });
    await db.createSupportTicket({ user_id: a.id, name: "א", email: "a@example.com", subject: null, body: "עזרה", transcript: null });

    const rows = await db.adminUserOverview();
    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(rows.find((r) => r.id === a.id)).toMatchObject({
      plan: "basic",
      sub_status: "past_due",
      charge_failures: 2,
      phone: "+972500000001",
      wa_linked: true,
      connections_active: 1,
      connections_broken: 1,
      connections_ever: 2,
      providers: ["google"],
      usage_used: 1,
      usage_limit: 750,
      messages_30d: 1,
      ai_cost_30d: 0.01,
      errors_7d: 1,
      paid: true,
      open_tickets: 1,
    });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ plan: "trial", sub_status: null, wa_linked: false, connections_ever: 0, paid: false, usage_used: null });
    expect((await db.adminMessages(a.id, { limit: 10 }))[0]).toMatchObject({ direction: "out", tools: ["calendar_list_events"] });
  });

  it("daily figures per Jerusalem day, one row per day, a bounded range", async () => {
    const db = new MemoryDb();
    const now = new Date("2026-10-24T10:00:00Z");
    db.now = () => now;
    const a = await db.createUser("a@example.com");
    db.users.get(a.id)!.created_at = now.toISOString();
    await db.insertMessage({ user_id: a.id, wa_message_id: "w1", direction: "in", text: "שלום" });
    await db.insertMessage({ user_id: a.id, wa_message_id: "w2", direction: "in", text: "עוד" });
    await db.addAiSpend("2026-10-24", 0.25);
    await db.insertPayment({ user_id: a.id, hyp_trans_id: "T1", amount_ils: 99, ccode: "0", acode: null, invoice_url: null, raw: {} });
    await db.insertPayment({ user_id: a.id, hyp_trans_id: "T2", amount_ils: 99, ccode: "33", acode: null, invoice_url: null, raw: {} });
    const days = await db.adminDailyStats("2026-10-18", "2026-10-24");
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ day: "2026-10-24", signups: 1, active_users: 1, messages: 2, ai_cost: 0.25, revenue: 99 });
    expect(days[0]).toEqual({ day: "2026-10-18", signups: 0, active_users: 0, messages: 0, ai_cost: 0, revenue: 0 });
    await expect(db.adminDailyStats("2026-10-24", "2026-10-18")).rejects.toThrow(/bad range/);
    await expect(db.adminDailyStats("2020-01-01", "2026-01-01")).rejects.toThrow(/bad range/);
  });

  it("support chats: created on the first append, linked on sign-in, never taken over, capped", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const b = await db.createUser("b@example.com");
    const id = "d6666666-6666-4666-8666-666666666666";
    expect(await db.appendSupportChat(id, { userId: null, page: "/", turns: [{ role: "user", text: "כמה זה עולה?" }, { role: "assistant", text: "99 ₪" }] })).toBe(true);
    expect(await db.appendSupportChat(id, { userId: a.id, page: "/account", turns: [{ role: "user", text: "ואיך מתחברים?" }] })).toBe(true);
    expect(await db.appendSupportChat(id, { userId: b.id, page: "/", turns: [{ role: "user", text: "x" }] })).toBe(false);
    expect(await db.appendSupportChat(id, { userId: null, page: "/", turns: [{ role: "user", text: "x" }] })).toBe(false);
    const [chat] = await db.listSupportChats({ userId: a.id, limit: 5 });
    expect(chat).toMatchObject({ id, user_id: a.id, page: "/" });
    expect(chat!.turns.map((t) => t.text)).toEqual(["כמה זה עולה?", "99 ₪", "ואיך מתחברים?"]);
    await db.appendSupportChat(id, { userId: a.id, page: null, turns: [{ role: "user", text: "4" }, { role: "assistant", text: "5" }], max: 3 });
    expect((await db.listSupportChats({ limit: 5 }))[0]!.turns.map((t) => t.text)).toEqual(["ואיך מתחברים?", "4", "5"]);
    await db.deleteUser(a.id);
    expect(await db.listSupportChats({ limit: 5 })).toEqual([]);
  });

  it("tickets: listed newest first with filters; the status and the note change, the time of the change recorded", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const t1 = await db.createSupportTicket({ user_id: a.id, name: "א", email: "a@example.com", subject: "ראשונה", body: "גוף", transcript: null });
    await db.createSupportTicket({ user_id: null, name: "ב", email: "b@example.com", subject: "שנייה", body: "גוף", transcript: null });
    expect((await db.listSupportTickets({ limit: 10 })).map((t) => t.subject)).toEqual(["שנייה", "ראשונה"]);
    expect((await db.listSupportTickets({ userId: a.id, limit: 10 })).map((t) => t.subject)).toEqual(["ראשונה"]);
    const updated = await db.setSupportTicketStatus(t1.id, "in_progress", " חזרתי אליה ");
    expect(updated).toMatchObject({ status: "in_progress", admin_note: "חזרתי אליה" });
    expect(updated!.status_changed_at).toBeTruthy();
    expect((await db.listSupportTickets({ status: "open", limit: 10 })).map((t) => t.subject)).toEqual(["שנייה"]);
    expect(await db.setSupportTicketStatus("missing", "closed")).toBeNull();
  });

  it("errors: an unknown user is dropped from the row (the foreign key), filters by source and user", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    await db.insertAppError({ source: "bot", message: "a", user_id: a.id, context: { k: 1 } });
    await db.insertAppError({ source: "jobs", message: "b", user_id: "11111111-1111-4111-8111-111111111111" });
    expect((await db.listAppErrors({ limit: 10 })).map((e) => e.message)).toEqual(["b", "a"]);
    expect((await db.listAppErrors({ source: "jobs", limit: 10 }))[0]!.user_id).toBeNull();
    expect((await db.listAppErrors({ userId: a.id, limit: 10 })).map((e) => e.source)).toEqual(["bot"]);
  });

  it("the user's jobs, failed jobs across users, alerts and meeting summaries, newest first", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const j = await db.createJob({ kind: "reminder", user_id: a.id, run_at: new Date(), max_attempts: 1 });
    await db.claimDueJobs(5);
    await db.finishJob(j!.id, "boom");
    expect((await db.adminJobs(a.id, 5))[0]).toMatchObject({ status: "failed", last_error: "boom" });
    expect(await db.adminFailedJobs(new Date(Date.now() - 86_400_000), 5)).toHaveLength(1);
    await db.addProactiveSummaryItem({ user_id: a.id, item_key: "k", kind: "deadline", local_day: "2026-10-24", payload: {} });
    expect(await db.adminProactiveAlerts(a.id, 5)).toHaveLength(1);
    expect(await db.adminMeetingSummaries(a.id, 5)).toEqual([]);
    await db.addAudit({ user_id: a.id, action: "first" });
    await db.addAudit({ user_id: a.id, action: "second" });
    expect((await db.adminAudit(a.id, 5)).map((x) => x.action)).toEqual(["second", "first"]);
  });
});
