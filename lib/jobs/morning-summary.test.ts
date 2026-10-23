import { describe, expect, it } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import type { UserRow } from "@/lib/db/types";
import { FIXTURE_MEET_URL, createGoogleFixture, fixtureMail } from "@/lib/google/__fixtures__/google-fixtures";
import { GoogleClient } from "@/lib/google/client";
import { GmailReader } from "@/lib/google/gmail";
import { FIXTURE_TEAMS_JOIN_URL, createGraphFixture } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient, type GraphMessage } from "@/lib/ms/graph";
import { createReminder } from "@/lib/reminders/service";
import { zonedToUtc } from "@/lib/time/zoned";
import { emailsAwaitingReply, morningDedupeKey, nextMorningRun, runMorningSummaryJob, scheduleMorningSummary, type MorningDeps } from "./morning-summary";

const il = (y: number, mo: number, d: number, h: number, mi = 0) => zonedToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, "Asia/Jerusalem");

/** The Graph fixture + a Sent Items folder (the fixture itself does not serve it). */
function graphWithSent(sent: { conversationId: string; sentDateTime: string }[] = []) {
  const fx = createGraphFixture();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname.endsWith("/me/mailFolders/sentitems/messages")) return Response.json({ value: sent });
    return fx.fetchImpl(input, init);
  }) as typeof fetch;
  return { graph: new GraphClient({ getAccessToken: async () => "token", fetchImpl }), state: fx.state };
}

/** Wednesday 21.10.2026 07:30 — the fixture events are on that day. */
async function setup(opts: { at?: Date; connected?: boolean; sent?: { conversationId: string; sentDateTime: string }[]; enabled?: boolean | null } = {}) {
  const h = makeHarness(opts.at ?? il(2026, 10, 21, 7, 30));
  const created = await h.db.createUser("dana@levi-law.co.il");
  await h.db.mergeUserProfile(created.id, { onboarding: { step: "done", startedAt: "x" }, ...(opts.enabled === null ? {} : { morning_summary_enabled: opts.enabled ?? true }) });
  h.db.seedWaIdentity(created.id, "+972501234567");
  const g = graphWithSent(opts.sent);
  const deps: MorningDeps = { db: h.db, wa: h.wa, now: h.ctx.now, graphFor: async () => (opts.connected === false ? null : { graph: g.graph, accountEmail: "dana@levi-law.co.il" }) };
  const user = (await h.db.getUser(created.id))!;
  const job = { id: "job-1", user_id: user.id, payload: { local_date: "2026-10-21", time: "07:30" } };
  return { h, user, deps, job, graphState: g.state };
}

// the template keeps one line per meeting: join links do not fit its 300 characters
const MEETINGS = "• 09:00 דיון בבית משפט השלום ת״א  • 12:00 פגישה עם רו״ח ברק";
const TEAMS_LINE = `קישור לפגישה: ${FIXTURE_TEAMS_JOIN_URL}`;
const MEET_LINE = `קישור לפגישה: ${FIXTURE_MEET_URL}`;

describe("morning summary — the job", () => {
  it("outside the window sends the morning_summary template from Graph (meetings, emails awaiting reply) + today's reminders", async () => {
    const { h, user, deps, job, graphState } = await setup();
    await createReminder(h.db, user, { text: "להתקשר לבנק", when: "היום ב-14:00" }, h.ctx.now());
    const res = await runMorningSummaryJob(deps, job);
    expect(res).toEqual({ status: "sent", mode: "template", localDate: "2026-10-21" });
    const sent = h.wa.sent.at(-1)!;
    expect(sent.template!.name).toBe("morning_summary");
    expect(sent.template!.params.map((p) => p.text)).toEqual(["יום ד׳ 21.10", MEETINGS, "• עו״ד שפירא — הצעת פשרה, תיק 4471  • מאי כהן — אישור חשבונית 1023", "• 14:00 להתקשר לבנק"]);
    // calendarView asked for the local day (00:00–24:00 Israel time) in the user's zone
    const cal = graphState.calls.find((c) => c.url.includes("/me/calendarView"))!;
    expect(new URL(cal.url).searchParams.get("startDateTime")).toBe("2026-10-20T21:00:00.000Z");
    expect(new URL(cal.url).searchParams.get("endDateTime")).toBe("2026-10-21T21:00:00.000Z");
    expect((await h.db.getUser(user.id))!.profile.morning_summary_last_date).toBe("2026-10-21");
    expect(h.db.audit.at(-1)).toMatchObject({ action: "morning_summary.send", target: "2026-10-21", result: "template" });
  });

  it("inside the window sends the free-text summary with the right closer", async () => {
    const { h, deps, job } = await setup({ sent: [{ conversationId: "AAQkAGc2", sentDateTime: "2026-10-19T15:00:00Z" }] });
    await processInbound(h.ctx, h.inbound("תודה"));
    expect(await runMorningSummaryJob(deps, job)).toMatchObject({ status: "sent", mode: "text" });
    expect(h.wa.texts.at(-1)).toBe(
      `*בוקר טוב. יום ד׳ 21.10*\n\n*פגישות היום*\n• 09:00 דיון בבית משפט השלום ת״א\n• 12:00 פגישה עם רו״ח ברק\n${TEAMS_LINE}\n\n*מיילים שמחכים לתשובה*\n• עו״ד שפירא — הצעת פשרה, תיק 4471\n\nרוצה שאנסח תשובה למישהו מהם?`,
    );
  });

  it("is idempotent per user per day and queues the next workday", async () => {
    const { h, user, deps, job } = await setup();
    await runMorningSummaryJob(deps, job);
    expect(await runMorningSummaryJob(deps, job)).toEqual({ status: "skipped", reason: "already sent today" });
    expect(h.wa.sent.filter((s) => s.kind === "template")).toHaveLength(1);
    const next = h.db.jobs.filter((j) => j.kind === "morning_summary" && j.status === "queued");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ run_at: "2026-10-22T04:30:00.000Z", dedupe_key: morningDedupeKey(user.id, "2026-10-22", "07:30"), payload: { local_date: "2026-10-22", time: "07:30" } });
  });

  it('respects "לא עכשיו" (off), pause, a changed time, another day and the weekend', async () => {
    const off = await setup({ enabled: false });
    expect(await runMorningSummaryJob(off.deps, off.job)).toEqual({ status: "skipped", reason: "morning summary off" });
    const unset = await setup({ enabled: null });
    expect(await runMorningSummaryJob(unset.deps, unset.job)).toEqual({ status: "skipped", reason: "morning summary off" });
    expect(off.h.db.jobs).toHaveLength(0);

    const paused = await setup();
    await paused.h.db.mergeUserProfile(paused.user.id, { proactive_paused_until: "2026-11-03T00:00:00Z" });
    expect(await runMorningSummaryJob(paused.deps, paused.job)).toEqual({ status: "skipped", reason: "paused" });

    const moved = await setup();
    await moved.h.db.updateUserProfile(moved.user.id, { morning_time: "08:30" });
    expect(await runMorningSummaryJob(moved.deps, moved.job)).toEqual({ status: "skipped", reason: "morning time changed" });
    expect(moved.h.db.jobs.find((j) => j.kind === "morning_summary")!.payload).toEqual({ local_date: "2026-10-21", time: "08:30" });

    const late = await setup({ at: il(2026, 10, 22, 7, 30) });
    expect(await runMorningSummaryJob(late.deps, late.job)).toEqual({ status: "skipped", reason: "stale (another day)" });

    const friday = await setup({ at: il(2026, 10, 23, 7, 30) });
    expect(await runMorningSummaryJob(friday.deps, { ...friday.job, payload: { local_date: "2026-10-23", time: "07:30" } })).toEqual({ status: "skipped", reason: "weekend" });
    for (const s of [off, unset, paused, moved, late, friday]) expect(s.h.wa.sent.filter((x) => x.kind === "template" || x.kind === "text")).toHaveLength(0);
  });

  it("without a connection: reminders only, and nothing at all when there is nothing to report", async () => {
    const empty = await setup({ connected: false });
    expect(await runMorningSummaryJob(empty.deps, empty.job)).toEqual({ status: "skipped", reason: "nothing to report (no connection)" });
    const withReminder = await setup({ connected: false });
    await createReminder(withReminder.h.db, withReminder.user, { text: "להתקשר לבנק", when: "היום ב-14:00" }, withReminder.h.ctx.now());
    await processInbound(withReminder.h.ctx, withReminder.h.inbound("תודה"));
    await runMorningSummaryJob(withReminder.deps, withReminder.job);
    expect(withReminder.h.wa.texts.at(-1)).toBe("*בוקר טוב. יום ד׳ 21.10*\n\n*תזכורות*\n• 14:00 להתקשר לבנק\n\nשיהיה יום טוב.");
  });

  it("Google-only users get today's Google Calendar meetings (no email section without a Gmail reader)", async () => {
    const { h, user, deps, job } = await setup({ connected: false });
    const fx = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx.fetchImpl });
    await createReminder(h.db, user, { text: "להתקשר לבנק", when: "היום ב-14:00" }, h.ctx.now());
    expect(await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google }) }, job)).toEqual({ status: "sent", mode: "template", localDate: "2026-10-21" });
    expect(h.wa.sent.at(-1)!.template!.params.map((p) => p.text)).toEqual(["יום ד׳ 21.10", "• כל היום — יום הולדת לנועה  • 09:00 פגישת צוות שבועית  • 13:00 שיחה עם משפחת אברהם", "—", "• 14:00 להתקשר לבנק"]);
    // events.list asked for the local day (00:00–24:00 Israel time), wall-clock times in the user's zone
    const cal = new URL(fx.state.calls.find((c) => c.url.includes("/calendars/primary/events"))!.url);
    expect(cal.searchParams.get("timeMin")).toBe("2026-10-20T21:00:00.000Z");
    expect(cal.searchParams.get("timeMax")).toBe("2026-10-21T21:00:00.000Z");
    expect(cal.searchParams.get("timeZone")).toBe("Asia/Jerusalem");
  });

  it("with both Microsoft 365 and Google connected, the two calendars are merged by time", async () => {
    const { h, deps, job } = await setup();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: createGoogleFixture().fetchImpl });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google }) }, job);
    expect(h.wa.texts.at(-1)).toContain(`*פגישות היום*\n• כל היום — יום הולדת לנועה\n• 09:00 דיון בבית משפט השלום ת״א\n• 09:00 פגישת צוות שבועית\n• 12:00 פגישה עם רו״ח ברק\n${TEAMS_LINE}\n• 13:00 שיחה עם משפחת אברהם\n${MEET_LINE}\n\n*מיילים שמחכים לתשובה*`);
  });

  it("Gmail with gmail.readonly: emails awaiting a reply from Gmail (threads.list + threads.get, own replies respected)", async () => {
    const { h, user, deps, job } = await setup({ connected: false });
    const fx = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx.fetchImpl });
    await createReminder(h.db, user, { text: "להתקשר לבנק", when: "היום ב-14:00" }, h.ctx.now());
    expect(await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google, gmail: new GmailReader(google), accountEmail: "dana.levi@gmail.com" }) }, job)).toMatchObject({ status: "sent", mode: "template" });
    expect(h.wa.sent.at(-1)!.template!.params.map((p) => p.text)).toEqual([
      "יום ד׳ 21.10",
      "• כל היום — יום הולדת לנועה  • 09:00 פגישת צוות שבועית  • 13:00 שיחה עם משפחת אברהם",
      // gm2 was answered by gm3 (SENT), the security alert / newsletter tabs and the 1.10 mail are left out
      "• ספק חדש — חשבונית 4471 — עדכון פרטי בנק  • עו״ד מיכל שפירא — הצעת פשרה בתיק 4471  • רונית בר — פרוטוקול ישיבה",
      "• 14:00 להתקשר לבנק",
    ]);
    const threads = new URL(fx.state.calls.find((c) => c.url.includes("/gmail/v1/users/me/threads?"))!.url);
    expect(threads.searchParams.get("q")).toContain("in:inbox newer_than:7d -category:promotions");
    expect(fx.state.calls.filter((c) => /\/threads\/gt\d$/.test(new URL(c.url).pathname))).toHaveLength(4);
  });

  it("past the user cap (no gmail.readonly → no `gmail`): the summary skips Gmail's emails, the calendar stays", async () => {
    const { h, deps, job } = await setup({ connected: false });
    const fx = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx.fetchImpl });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google, gmail: null, accountEmail: "dana.levi@gmail.com" }) }, job);
    expect(h.wa.texts.at(-1)).toBe(`*בוקר טוב. יום ד׳ 21.10*\n\n*פגישות היום*\n• כל היום — יום הולדת לנועה\n• 09:00 פגישת צוות שבועית\n• 13:00 שיחה עם משפחת אברהם\n${MEET_LINE}\n\nשיהיה יום טוב.`);
    expect(fx.state.calls.some((c) => c.url.includes("gmail.googleapis.com"))).toBe(false);
  });

  it("Microsoft 365 + Gmail: both mailboxes merged newest first (5 at most); a Gmail failure keeps the rest", async () => {
    const { h, deps, job } = await setup();
    const fx = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx.fetchImpl });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google, gmail: new GmailReader(google), accountEmail: "dana.levi@gmail.com" }) }, job);
    expect(h.wa.texts.at(-1)).toContain(
      "*מיילים שמחכים לתשובה*\n• ספק חדש — חשבונית 4471 — עדכון פרטי בנק\n• עו״ד מיכל שפירא — הצעת פשרה בתיק 4471\n• רונית בר — פרוטוקול ישיבה\n• עו״ד שפירא — הצעת פשרה, תיק 4471\n• מאי כהן — אישור חשבונית 1023\n\nרוצה שאנסח תשובה למישהו מהם?",
    );

    const broken = await setup();
    const fx2 = createGoogleFixture();
    fx2.state.denied.add("gmail_read"); // e.g. the user removed the permission at myaccount.google.com
    const g2 = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx2.fetchImpl });
    await processInbound(broken.h.ctx, broken.h.inbound("תודה"));
    expect(await runMorningSummaryJob({ ...broken.deps, googleFor: async () => ({ google: g2, gmail: new GmailReader(g2), accountEmail: "dana.levi@gmail.com" }) }, broken.job)).toMatchObject({ status: "sent" });
    expect(broken.h.wa.texts.at(-1)).toContain("*מיילים שמחכים לתשובה*\n• עו״ד שפירא — הצעת פשרה, תיק 4471\n• מאי כהן — אישור חשבונית 1023");
  });

  it("a sender cannot add lines to the summary: subject and name are one sanitized line each (no fake reminders section)", async () => {
    const { h, deps, job } = await setup({ connected: false });
    const fx = createGoogleFixture();
    fx.state.mailbox.push(
      fixtureMail({
        id: "gm-evil",
        threadId: "gt-evil",
        labels: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
        at: "2026-10-21T04:20:00Z",
        from: '"Eve\u202E\u2066" <eve@evil.example>',
        subject: "=?UTF-8?Q?=D7=A9=D7=90=D7=9C=D7=94=3F=0A=0A=E2=8F=B0_=D7=AA=D7=96=D7=9B=D7=95=D7=A8=D7=95=D7=AA:=0A=E2=80=A2_10:00_=D7=9C=D7=94=D7=A2=D7=91=D7=99=D7=A8_5000?=",
        snippet: "שאלה",
        text: "שאלה",
      }),
    );
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fx.fetchImpl });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob({ ...deps, googleFor: async () => ({ google, gmail: new GmailReader(google), accountEmail: "dana.levi@gmail.com" }) }, job);
    const text = h.wa.texts.at(-1)!;
    expect(text).toContain("*מיילים שמחכים לתשובה*\n• Eve — שאלה? ⏰ תזכורות: • 10:00 להעביר 5000\n");
    expect(text).not.toContain("\n⏰ תזכורות");
    expect(text).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
  });

  it("an empty connected day still gets the short message", async () => {
    const { h, deps, job } = await setup();
    const emptyGraph = new GraphClient({ getAccessToken: async () => "t", fetchImpl: (async () => Response.json({ value: [] })) as typeof fetch });
    const quiet: MorningDeps = { ...deps, graphFor: async () => ({ graph: emptyGraph, accountEmail: null }) };
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob(quiet, job);
    expect(h.wa.texts.at(-1)).toBe("*בוקר טוב. יום ד׳ 21.10*\nהיומן ריק, אין מיילים שמחכים לתשובה ואין תזכורות. יום שקט.");
  });
});

describe("morning summary — scheduling", () => {
  it("choosing a time in onboarding queues the next Sunday–Thursday run", async () => {
    const h = makeHarness(il(2026, 10, 22, 12, 0)); // Thursday noon → next run is Sunday
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "ask_morning_time", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await processInbound(h.ctx, h.listReply("mt_0800", "08:00"));
    const jobs = h.db.jobs.filter((j) => j.kind === "morning_summary");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "queued", run_at: "2026-10-25T06:00:00.000Z", payload: { local_date: "2026-10-25", time: "08:00" } }); // Sunday, first winter-time day
  });

  it("the set_morning_time tool reschedules (and cancels when turned off)", async () => {
    const h = makeHarness(il(2026, 10, 21, 10, 0));
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" }, morning_summary_enabled: true });
    h.db.seedWaIdentity(user.id, "+972501234567");
    const { setMorningTimeTool } = await import("@/lib/ai/tools");
    const ctx = { db: h.db, userId: user.id, now: h.ctx.now(), createPending: async () => { throw new Error("no"); } };
    await setMorningTimeTool.run({ time: "07:00" }, ctx);
    await setMorningTimeTool.run({ time: "06:45" }, ctx);
    const queued = h.db.jobs.filter((j) => j.kind === "morning_summary" && j.status === "queued");
    expect(queued.map((j) => j.payload.time)).toEqual(["06:45"]);
    await setMorningTimeTool.run({ time: "off" }, ctx);
    expect(h.db.jobs.filter((j) => j.kind === "morning_summary" && j.status === "queued")).toHaveLength(0);
  });

  it("computes the next run on the wall clock across DST and skips Friday/Saturday", () => {
    const user = { id: "u", morning_time: "07:30:00", timezone: "Asia/Jerusalem", profile: { morning_summary_enabled: true } } as unknown as UserRow;
    expect(nextMorningRun(user, il(2026, 10, 22, 8, 0))).toMatchObject({ localDate: "2026-10-25", time: "07:30" });
    expect(nextMorningRun(user, il(2026, 10, 22, 8, 0))!.runAt.toISOString()).toBe("2026-10-25T05:30:00.000Z");
    expect(nextMorningRun(user, il(2027, 3, 25, 8, 0))!.runAt.toISOString()).toBe("2027-03-28T04:30:00.000Z");
    expect(nextMorningRun(user, il(2026, 10, 21, 7, 0), "2026-10-21")!.localDate).toBe("2026-10-22");
  });

  it("scheduling is idempotent (dedupe key) and off when disabled", async () => {
    const h = makeHarness(il(2026, 10, 21, 10, 0));
    const user = await h.db.createUser("a@b.co");
    await h.db.mergeUserProfile(user.id, { morning_summary_enabled: true });
    const u = (await h.db.getUser(user.id))!;
    expect(await scheduleMorningSummary(h.db, u, h.ctx.now())).not.toBeNull();
    expect(await scheduleMorningSummary(h.db, u, h.ctx.now())).toBeNull();
    await h.db.mergeUserProfile(user.id, { morning_summary_enabled: false });
    expect(await scheduleMorningSummary(h.db, (await h.db.getUser(user.id))!, h.ctx.now())).toBeNull();
  });
});

describe("emails awaiting a reply — heuristic", () => {
  const now = new Date("2026-10-21T05:00:00Z");
  const msg = (over: Partial<GraphMessage>): GraphMessage => ({ id: Math.random().toString(36), subject: "נושא", from: { name: "רונית", address: "ronit@client.co.il" }, toRecipients: [], receivedDateTime: "2026-10-20T08:00:00Z", isRead: false, hasAttachments: false, bodyPreview: "", webLink: null, conversationId: Math.random().toString(36), ...over });

  it("keeps unread or asking messages from people, newest first, one per conversation", () => {
    const out = emailsAwaitingReply(
      [
        msg({ subject: "a", receivedDateTime: "2026-10-19T08:00:00Z", conversationId: "c1" }),
        msg({ subject: "b", receivedDateTime: "2026-10-20T08:00:00Z", conversationId: "c1" }),
        msg({ subject: "שאלה", isRead: true, bodyPreview: "מתי נוח לך?", conversationId: "c2" }),
        msg({ subject: "לידיעה", isRead: true, bodyPreview: "רק לעדכן", conversationId: "c3" }),
      ],
      [],
      { selfAddress: "dana@levi-law.co.il", now },
    );
    expect(out.map((m) => m.subject)).toEqual(["b", "שאלה"]);
  });

  it("drops automated senders, newsletters, the user's own mail, old mail and answered conversations", () => {
    const out = emailsAwaitingReply(
      [
        msg({ from: { name: "Microsoft", address: "no-reply@microsoft.com" } }),
        msg({ from: { name: "Bank", address: "notifications@bank.co.il" } }),
        msg({ subject: "Newsletter אוקטובר" }),
        msg({ from: { name: "דנה", address: "Dana@levi-law.co.il" } }),
        msg({ receivedDateTime: "2026-10-10T08:00:00Z" }),
        msg({ conversationId: "answered", receivedDateTime: "2026-10-20T08:00:00Z" }),
        msg({ subject: "נשאר", conversationId: "open" }),
      ],
      [{ conversationId: "answered", sentDateTime: "2026-10-20T09:00:00Z" }, { conversationId: "open", sentDateTime: "2026-10-19T09:00:00Z" }],
      { selfAddress: "dana@levi-law.co.il", now },
    );
    expect(out.map((m) => m.subject)).toEqual(["נשאר"]);
  });
});
