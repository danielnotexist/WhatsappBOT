import { describe, expect, it } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { WaApiError } from "@/lib/wa/client";
import { zonedToUtc } from "@/lib/time/zoned";
import { cancelReminder, createReminder, listOpenReminders, runReminderJob } from "./service";

const il = (y: number, mo: number, d: number, h: number, mi = 0) => zonedToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, "Asia/Jerusalem");

async function setup(start: Date) {
  const h = makeHarness(start);
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  const fresh = (await h.db.getUser(user.id))!;
  const deps = { db: h.db, wa: h.wa, now: h.ctx.now };
  return { h, user: fresh, deps };
}

const jobFor = (h: Awaited<ReturnType<typeof setup>>["h"], reminderId: string) => h.db.jobs.filter((j) => j.kind === "reminder" && j.payload.reminder_id === reminderId).at(-1)!;

describe("reminders — create / list / cancel", () => {
  it("creates a one-off reminder from the user's phrase, echoes the absolute time and queues the job", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "להתקשר לבנק", when: "מחר ב-9" }, h.ctx.now());
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.reply).toBe("אזכיר: להתקשר לבנק\nמחר, 9:00");
    const job = jobFor(h, r.reminder.id);
    expect(job).toMatchObject({ kind: "reminder", user_id: user.id, status: "queued", run_at: "2026-10-22T06:00:00.000Z" });
    expect(job.payload).toEqual({ reminder_id: r.reminder.id, due_at: "2026-10-22T06:00:00.000Z" });
    expect((await h.db.getReminder(r.reminder.id))!.job_id).toBe(job.id);
    expect(h.db.audit.at(-1)).toMatchObject({ action: "reminder.create", result: "ok" });
  });

  it("asks for a time when none was given, and refuses a time that already passed", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 21, 0));
    const none = await createReminder(h.db, user, { text: "להתקשר לבנק", when: "" }, h.ctx.now());
    expect(none).toMatchObject({ status: "need_time" });
    expect(none.reply).toBe('מתי להזכיר על "להתקשר לבנק"? למשל "מחר ב-9" או "יום ה׳ אחרי הצהריים".');
    const past = await createReminder(h.db, user, { text: "בנק", when: "היום ב-8" }, h.ctx.now());
    expect(past).toMatchObject({ status: "past", whenAbs: "היום, 20:00" });
    expect(h.db.reminders).toHaveLength(0);
  });

  it("creates a recurring reminder with its rule and first occurrence", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "לקחת תרופה", when: "כל יום בשמונה" }, h.ctx.now());
    expect(r.status === "created" && r.reply).toBe("אזכיר: לקחת תרופה\nכל יום, 8:00\nהפעם הראשונה: מחר, 8:00");
    expect(h.db.reminders[0]!.recurrence).toEqual({ freq: "daily", hour: 8, minute: 0 });
  });

  it("takes the text from the phrase when the model left it empty, and the time from the text when `when` is empty", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "", when: "תזכיר לי בעוד רבע שעה לצאת לפגישה" }, h.ctx.now());
    expect(r.status === "created" && r.reply).toBe("אזכיר: לצאת לפגישה\nהיום, 10:30");
    const r2 = await createReminder(h.db, user, { text: "מחר ב-9 להתקשר לבנק", when: "" }, h.ctx.now());
    expect(r2.status === "created" && r2.reply).toBe("אזכיר: להתקשר לבנק\nמחר, 9:00");
  });

  it("lists open reminders and cancels by text (one match), asks when ambiguous, and reports not found", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    const now = h.ctx.now();
    await createReminder(h.db, user, { text: "להתקשר לבנק", when: "מחר ב-9" }, now);
    await createReminder(h.db, user, { text: 'לשלוח דוח לרו"ח', when: "היום ב-16:00" }, now);
    await createReminder(h.db, user, { text: "לקחת תרופה", when: "כל יום ב-8" }, now);
    const list = await listOpenReminders(h.db, user, now);
    expect(list.reply).toBe('*תזכורות פתוחות*\n• היום, 16:00 — לשלוח דוח לרו"ח\n• כל יום, 8:00 — לקחת תרופה\n• מחר, 9:00 — להתקשר לבנק\n\nלמחוק או להזיז אחת מהן — פשוט לכתוב.');

    const bank = h.db.reminders.find((r) => r.text === "להתקשר לבנק")!;
    const cancelled = await cancelReminder(h.db, user, { query: "בנק" }, now);
    expect(cancelled).toMatchObject({ status: "cancelled", reply: 'התזכורת "להתקשר לבנק" בוטלה.' });
    expect(h.db.jobs.find((j) => j.id === bank.job_id)!.status).toBe("cancelled");

    await createReminder(h.db, user, { text: "להתקשר לבנק לאומי", when: "מחר ב-10" }, now);
    await createReminder(h.db, user, { text: "להתקשר לבנק הפועלים", when: "מחר ב-11" }, now);
    const amb = await cancelReminder(h.db, user, { query: "בנק" }, now);
    expect(amb.status).toBe("ambiguous");
    expect(amb.status === "ambiguous" && amb.candidates.map((c) => c.text)).toEqual(["להתקשר לבנק לאומי", "להתקשר לבנק הפועלים"]);
    expect((await cancelReminder(h.db, user, { query: "מספרה" }, now)).status).toBe("not_found");
    expect((await listOpenReminders(h.db, (await h.db.createUser("x@y.co"))!, now)).reply).toBe("אין תזכורות פתוחות כרגע.");
  });
});

describe("reminders — the job", () => {
  it("outside the 24-hour window sends the `reminder` template, then marks it sent (idempotent)", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 20, 18, 40));
    const r = await createReminder(h.db, user, { text: "להתקשר לבנק", when: "מחר ב-9" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    h.advance(il(2026, 10, 21, 9, 0).getTime() - h.ctx.now().getTime());
    const job = jobFor(h, r.reminder.id);
    expect(await runReminderJob(deps, job)).toMatchObject({ status: "sent", mode: "template", next: null });
    const sent = h.wa.sent.at(-1)!;
    expect(sent.kind).toBe("template");
    expect(sent.template!.name).toBe("reminder");
    expect(sent.template!.params.map((p) => p.text)).toEqual(["להתקשר לבנק", "יום ג׳ 20.10, 18:40"]);
    expect(sent.template!.buttons.map((b) => b.text)).toEqual([`rem:done:${r.reminder.id}`, `rem:hour:${r.reminder.id}`, `rem:tmrw:${r.reminder.id}`]);
    expect(await h.db.getReminder(r.reminder.id)).toMatchObject({ status: "sent", last_fired_at: "2026-10-21T06:00:00.000Z" });
    expect((await h.db.recentMessages(user.id, 5)).at(-1)).toMatchObject({ direction: "out", type: "template", text: "⏰ תזכורת: להתקשר לבנק" });
    expect(await runReminderJob(deps, job)).toEqual({ status: "skipped", reason: "status sent" });
    expect(h.wa.sent.filter((s) => s.kind === "template")).toHaveLength(1);
  });

  it("inside the window sends free text with the three buttons", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 21, 10, 15));
    await processInbound(h.ctx, h.inbound("תודה")); // opens the window
    const r = await createReminder(h.db, user, { text: "לצאת לפגישה", when: "בעוד רבע שעה" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    h.advance(15 * 60_000);
    expect(await runReminderJob(deps, jobFor(h, r.reminder.id))).toMatchObject({ status: "sent", mode: "text" });
    const sent = h.wa.sent.at(-1)!;
    expect(sent).toMatchObject({ kind: "buttons", body: "⏰ תזכורת: לצאת לפגישה" });
    expect(sent.buttons!.map((b) => b.title)).toEqual(["טופל", "דחה לשעה", "דחה למחר"]);
  });

  it("falls back to the template when Meta says the window is closed (131047)", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 21, 10, 15));
    await processInbound(h.ctx, h.inbound("תודה"));
    const r = await createReminder(h.db, user, { text: "x", when: "בעוד דקה" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    h.advance(60_000);
    h.wa.sendButtons = async () => {
      throw new WaApiError("Re-engagement message", 400, 131047, null);
    };
    expect(await runReminderJob(deps, jobFor(h, r.reminder.id))).toMatchObject({ status: "sent", mode: "template" });
  });

  it("a recurring reminder fires and schedules the next occurrence on the wall clock across the DST switch", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 24, 10, 0)); // Saturday, day before winter time
    const r = await createReminder(h.db, user, { text: "לקחת תרופה", when: "כל יום ב-8" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    expect(r.reminder.due_at).toBe("2026-10-25T06:00:00.000Z"); // Sunday 08:00 IST
    const first = jobFor(h, r.reminder.id);
    h.advance(Date.parse(first.run_at) - h.ctx.now().getTime());
    expect(await runReminderJob(deps, first)).toMatchObject({ status: "sent", next: "2026-10-26T06:00:00.000Z" });
    const moved = (await h.db.getReminder(r.reminder.id))!;
    expect(moved).toMatchObject({ status: "scheduled", due_at: "2026-10-26T06:00:00.000Z" });
    expect(jobFor(h, r.reminder.id)).toMatchObject({ run_at: "2026-10-26T06:00:00.000Z", status: "queued" });
    // a redelivery of the old job is ignored
    expect(await runReminderJob(deps, first)).toEqual({ status: "skipped", reason: "rescheduled" });
  });

  it("an early delivery does not send and re-arms a fresh job for the due time", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "x", when: "מחר ב-9" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    const original = jobFor(h, r.reminder.id);
    expect(await runReminderJob(deps, original)).toEqual({ status: "skipped", reason: "not due yet" });
    const rearmed = jobFor(h, r.reminder.id);
    expect(rearmed.id).not.toBe(original.id);
    expect(rearmed).toMatchObject({ status: "queued", run_at: "2026-10-22T06:00:00.000Z", dedupe_key: null });
    expect(h.wa.sent).toHaveLength(0);
  });

  it("skips users without a linked phone and users who turned proactive messages off", async () => {
    const { h, user, deps } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "x", when: "בעוד דקה" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    h.advance(60_000);
    await h.db.mergeUserProfile(user.id, { proactive_disabled: true });
    expect(await runReminderJob(deps, jobFor(h, r.reminder.id))).toEqual({ status: "skipped", reason: "proactive messages disabled" });
    expect((await h.db.getReminder(r.reminder.id))!.status).toBe("cancelled");

    const other = await h.db.createUser("nophone@example.com");
    const r2 = await createReminder(h.db, other, { text: "y", when: "בעוד דקה" }, h.ctx.now());
    if (r2.status !== "created") throw new Error("not created");
    h.advance(60_000);
    expect(await runReminderJob(deps, jobFor(h, r2.reminder.id))).toEqual({ status: "skipped", reason: "no_phone" });
  });
});

describe("reminders — in the conversation", () => {
  it("sets a reminder from a chat message through the create_reminder tool and lists it", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    expect((await processInbound(h.ctx, h.inbound("תזכיר לי מחר ב-9 להתקשר לבנק"))).note).toBe("replied");
    expect(h.wa.texts.at(-1)).toBe("אזכיר: להתקשר לבנק\nמחר, 9:00");
    const strong = h.ai.calls.find((c) => c.tier === "strong")!;
    expect(strong.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["create_reminder", "list_reminders", "cancel_reminder"]));
    expect(h.db.reminders).toHaveLength(1);
    expect(h.db.reminders[0]).toMatchObject({ user_id: user.id, text: "להתקשר לבנק", due_at: "2026-10-22T06:00:00.000Z" });

    await processInbound(h.ctx, h.inbound("אילו תזכורות יש לי?"));
    expect(h.wa.texts.at(-1)).toBe("*תזכורות פתוחות*\n• מחר, 9:00 — להתקשר לבנק\n\nלמחוק או להזיז אחת מהן — פשוט לכתוב.");
  });

  it("handles the reminder buttons: snooze an hour, snooze to tomorrow (template quick reply), done", async () => {
    const { h, user } = await setup(il(2026, 10, 21, 10, 15));
    const r = await createReminder(h.db, user, { text: "להתקשר לבנק", when: "בעוד דקה" }, h.ctx.now());
    if (r.status !== "created") throw new Error("not created");
    const oldJob = jobFor(h, r.reminder.id);
    h.advance(60_000);

    expect((await processInbound(h.ctx, h.button(`rem:hour:${r.reminder.id}`, "דחה לשעה"))).note).toBe("reminder button");
    expect(h.wa.texts.at(-1)).toBe("דחיתי. אזכיר שוב היום, 11:16.");
    expect(oldJob.status).toBe("cancelled");
    expect(jobFor(h, r.reminder.id)).toMatchObject({ status: "queued", run_at: "2026-10-21T08:16:00.000Z" });

    await processInbound(h.ctx, h.inbound("מחר בבוקר", { type: "template_button", reply: { id: `rem:tmrw:${r.reminder.id}`, title: "מחר בבוקר" } }));
    expect(h.wa.texts.at(-1)).toBe("דחיתי. אזכיר שוב מחר, 9:00.");
    expect((await h.db.getReminder(r.reminder.id))!.due_at).toBe("2026-10-22T06:00:00.000Z");

    await processInbound(h.ctx, h.button(`rem:done:${r.reminder.id}`, "טופל"));
    expect(h.wa.texts.at(-1)).toBe("סומן כטופל.");
    expect((await h.db.getReminder(r.reminder.id))!.status).toBe("done");

    await processInbound(h.ctx, h.button("rem:done:00000000-0000-4000-8000-000000000000", "טופל"));
    expect(h.wa.texts.at(-1)).toContain("לא מצאתי תזכורת פתוחה כזו");
    // button presses are not counted against the trial
    expect((await h.db.getCurrentUsage(user.id))?.counted_messages ?? 0).toBe(0);
  });
});
