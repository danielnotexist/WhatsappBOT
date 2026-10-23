import { describe, expect, it, onTestFinished, vi } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { runScheduledJob } from "@/lib/jobs/run";
import { MS_SCOPES } from "@/lib/ms/oauth";
import { KOHEN_SUMMARY, MEET_URL, ZOOM_URL, addKohenMeeting, il, kohenJob, meetEvent, meetingSetup, teamsEvent } from "./__fixtures__/meetings-harness";
import { RETRY_DELAYS_MIN, nextPlanAt, planDedupeKey, runMeetingPlanJob, runMeetingSummaryJob, summaryDedupeKey } from "./jobs";

const planJob = (userId: string) => ({ id: "job-plan", user_id: userId, payload: {} });
const visible = <T extends { kind: string }>(sent: T[]) => sent.filter((x) => x.kind !== "read" && x.kind !== "reaction");
const scripted = (ai: { enqueue: (...r: { text: string }[]) => unknown }) => ai.enqueue({ text: JSON.stringify(KOHEN_SUMMARY) });

describe("meeting_plan: one job per online meeting, at its end + 10 minutes", () => {
  it("queues the Teams meetings that end soon or ended lately; never Zoom, a meeting without a link, or one too far ahead", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 10) });
    addKohenMeeting(teams); // 09:00–09:45 (ended)
    teams.fx.state.events.push(
      teamsEvent("AAMkNEXT", "שיחה עם הבנק", "2026-10-21T10:30", "2026-10-21T11:00"),
      teamsEvent("AAMkLATE", "ערב לקוחות", "2026-10-21T18:00", "2026-10-21T19:00"),
      teamsEvent("AAMkZOOM", "זום עם ספק", "2026-10-21T08:00", "2026-10-21T08:30", { isOnlineMeeting: false, onlineMeeting: null, location: { displayName: ZOOM_URL } }),
      teamsEvent("AAMkROOM", "פגישה במשרד", "2026-10-21T08:00", "2026-10-21T09:00", { isOnlineMeeting: false, onlineMeeting: null, location: { displayName: "משרד" } }),
    );
    expect(await runMeetingPlanJob(deps, planJob(user.id))).toEqual({ status: "done", queued: 2, meetings: 2 });
    const jobs = h.db.jobs.filter((j) => j.kind === "meeting_summary");
    expect(jobs.map((j) => [j.payload.event_id, j.run_at])).toEqual([
      ["AAMkNEXT", il(21, 11, 10).toISOString()],
      ["AAMkKOHEN", il(21, 10).toISOString()], // ended 09:45 → now
    ]);
    expect(jobs[1]!.dedupe_key).toBe(summaryDedupeKey(user.id, { provider: "microsoft", eventId: "AAMkKOHEN", endMs: il(21, 9, 45).getTime() }));
    // idempotent; the next plan is queued for the next round hour (the same key SQL schedule_meeting_plans() writes)
    expect(await runMeetingPlanJob(deps, planJob(user.id))).toMatchObject({ queued: 0 });
    const plan = h.db.jobs.find((j) => j.kind === "meeting_plan")!;
    expect(plan.run_at).toBe(il(21, 11).toISOString());
    expect(plan.dedupe_key).toBe(planDedupeKey(user.id, il(21, 11), "Asia/Jerusalem"));
    expect(visible(h.wa.sent)).toEqual([]);
  });

  it("Google Meet on Google Calendar, with drive.readonly granted", async () => {
    const { h, user, deps, gfx } = await meetingSetup({ at: il(21, 14), google: true, microsoft: false });
    gfx!.state.events.push(meetEvent("gmeet1", "שיחה עם אברהם", "2026-10-21T13:00", "2026-10-21T13:30"));
    // the fixture's own Meet ("שיחה עם משפחת אברהם", 13:00–13:30) too; its all-day birthday and the 09:00 meeting without a link not
    expect(await runMeetingPlanJob(deps, planJob(user.id))).toMatchObject({ queued: 2 });
    expect(h.db.jobs.filter((j) => j.kind === "meeting_summary").map((j) => [j.payload.provider, j.payload.event_id])).toEqual([
      ["google", "gev2"],
      ["google", "gmeet1"],
    ]);
  });

  it("not read without the grant (no transcript pair / no drive.readonly), nor on basic, nor when turned off", async () => {
    const noPair = await meetingSetup({ at: il(21, 10), msScopes: [...MS_SCOPES] });
    addKohenMeeting(noPair.teams);
    expect(await runMeetingPlanJob(noPair.deps, planJob(noPair.user.id))).toMatchObject({ queued: 0 });
    const noDrive = await meetingSetup({ at: il(21, 14), google: true, microsoft: false, googleScopes: ["https://www.googleapis.com/auth/calendar.events"] });
    noDrive.gfx!.state.events.push(meetEvent("gmeet1", "שיחה", "2026-10-21T13:00", "2026-10-21T13:30"));
    expect(await runMeetingPlanJob(noDrive.deps, planJob(noDrive.user.id))).toMatchObject({ queued: 0 });
    const basic = await meetingSetup({ at: il(21, 10), plan: "basic" });
    addKohenMeeting(basic.teams);
    expect(await runMeetingPlanJob(basic.deps, planJob(basic.user.id))).toEqual({ status: "skipped", reason: "summaries off or not pro" });
    expect(basic.h.db.jobs).toEqual([]);
    const off = await meetingSetup({ at: il(21, 10), profile: { meeting_summaries_disabled: true } });
    expect(await runMeetingPlanJob(off.deps, planJob(off.user.id))).toEqual({ status: "skipped", reason: "summaries off or not pro" });
  });

  it("plans run 07:00–22:59 local", () => {
    expect(nextPlanAt(il(21, 22, 30)).toISOString()).toBe(il(22, 7).toISOString());
    expect(nextPlanAt(il(21, 9, 5)).toISOString()).toBe(il(21, 10).toISOString());
  });
});

describe("meeting_summary: transcript → one summary → text and buttons", () => {
  it("inside the window: the summary as text, then [מייל למשתתפים] [מסמך משימות] [להוסיף למשימות]; the summary is stored, not the transcript", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams);
    scripted(h.ai);
    const r = await runMeetingSummaryJob(deps, kohenJob(user.id));
    expect(r).toMatchObject({ status: "sent", mode: "text" });
    const [text, buttons] = visible(h.wa.sent);
    expect(text!.body).toBe(
      [
        "*סיכום הפגישה: סטטוס פרויקט כהן*",
        "יום ד׳ 21.10, 09:00 · Teams",
        "",
        KOHEN_SUMMARY.summary,
        "",
        "*החלטות*",
        "• מגישים את הטיוטה עד 28.10",
        "",
        "*משימות*",
        "• להכין את הנספחים (רונית לוי, עד יום א׳ 25.10)",
        "• לבדוק את החוזה מול רו״ח ברק (יוסי כהן)",
        "",
        "*שאלות פתוחות*",
        "• האם צריך חתימה של הלקוח לפני ההגשה?",
      ].join("\n"),
    );
    const row = h.db.meetingSummaries[0]!;
    expect(buttons!.body).toBe("מה לעשות עם הסיכום? שום דבר לא יוצא בלי אישור.");
    expect(buttons!.buttons).toEqual([
      { id: `mt:mail:${row.id}`, title: "מייל למשתתפים" },
      { id: `mt:doc:${row.id}`, title: "מסמך משימות" },
      { id: `mt:tasks:${row.id}`, title: "להוסיף למשימות" },
    ]);
    expect(row).toMatchObject({ provider: "microsoft", event_id: "AAMkKOHEN", title: "סטטוס פרויקט כהן", attendees: [{ email: "yossi@kohen.co.il" }, { email: "ronit@levi-law.co.il" }] });
    expect(JSON.stringify(row)).not.toContain("שלום לכולם"); // the transcript itself is never stored
    // the transcript went to one strong-tier call
    expect(h.ai.calls.map((c) => c.tier)).toEqual(["strong"]);
    expect(JSON.stringify(h.ai.calls[0]!.messages)).toContain("רונית לוי: אני אכין את הנספחים עד יום ראשון.");
    // a second job for the same meeting sends nothing
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id))).toEqual({ status: "skipped", reason: "already summarised" });
  });

  it("outside the 24-hour window: the meeting_summary_ready template; [לראות את הסיכום] brings the summary and the buttons", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55), window: false });
    addKohenMeeting(teams);
    scripted(h.ai);
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id))).toMatchObject({ status: "sent", mode: "template" });
    const row = h.db.meetingSummaries[0]!;
    const t = visible(h.wa.sent)[0]!;
    expect(t.template!.name).toBe("meeting_summary_ready");
    expect(t.template!.params.map((p) => p.text)).toEqual(["סטטוס פרויקט כהן", KOHEN_SUMMARY.summary]);
    expect(t.template!.buttons.map((b) => b.text)).toEqual([`mt:show:${row.id}`, "mt:off"]);
    h.wa.sent = [];
    await processInbound(h.ctx, h.inbound("לראות את הסיכום", { type: "template_button", reply: { id: `mt:show:${row.id}`, title: "לראות את הסיכום" } }));
    const after = visible(h.wa.sent);
    expect(after[0]!.body).toMatch(/^\*סיכום הפגישה: סטטוס פרויקט כהן\*/);
    expect(after[1]!.buttons!.map((b) => b.title)).toEqual(["מייל למשתתפים", "מסמך משימות", "להוסיף למשימות"]);
    expect(h.ai.calls).toHaveLength(1); // no model for the press
  });

  it("the transcript is not ready: again after 15, 30 and 60 minutes, then it gives up quietly", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams, { transcript: false });
    let job = kohenJob(user.id) as { id: string; user_id: string; payload: Record<string, unknown> };
    for (const [i, minutes] of RETRY_DELAYS_MIN.entries()) {
      const r = await runMeetingSummaryJob(deps, job);
      expect(r).toEqual({ status: "retry", at: new Date(h.ctx.now().getTime() + minutes * 60_000).toISOString(), attempt: i + 1 });
      const next = h.db.jobs.filter((j) => j.kind === "meeting_summary").at(-1)!;
      expect(next.payload.attempt).toBe(i + 1);
      expect(next.dedupe_key).toMatch(new RegExp(`:r${i + 1}$`));
      h.advance(minutes * 60_000);
      job = { id: next.id, user_id: user.id, payload: next.payload };
    }
    expect(await runMeetingSummaryJob(deps, job)).toEqual({ status: "skipped", reason: "transcript: not_ready" });
    expect(visible(h.wa.sent)).toEqual([]);
    expect(h.ai.calls).toEqual([]);
  });

  it("a transcript that appears on the retry is summarised then", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams, { transcript: false });
    await runMeetingSummaryJob(deps, kohenJob(user.id));
    teams.state.meetings[0]!.transcripts.push({ id: "tr1", createdDateTime: "2026-10-21T06:00:30Z", vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v דנה לוי>שלום</v>" });
    h.advance(15 * 60_000);
    scripted(h.ai);
    const next = h.db.jobs.filter((j) => j.kind === "meeting_summary").at(-1)!;
    expect(await runScheduledJob({ ...deps, meetings: deps, graphFor: async () => null }, { id: next.id, kind: "meeting_summary", user_id: user.id, payload: next.payload })).toMatchObject({ status: "sent" });
  });

  it("quiet hours: a meeting that ends at 19:45 is summarised the next morning at 08:00", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 20, 5) });
    teams.fx.state.events.push(teamsEvent("AAMkEVE", "סגירת יום", "2026-10-21T19:00", "2026-10-21T19:45"));
    const job = { id: "j", user_id: user.id, payload: { provider: "microsoft", event_id: "AAMkEVE", end: il(21, 19, 45).toISOString(), attempt: 0 } };
    expect(await runMeetingSummaryJob(deps, job)).toEqual({ status: "deferred", at: il(22, 8).toISOString() });
    expect(h.db.jobs.find((j) => j.kind === "meeting_summary")!.run_at).toBe(il(22, 8).toISOString());
    expect(visible(h.wa.sent)).toEqual([]);
  });

  it("gating on the server: not pro → nothing; turned off or paused → only what the user asks for", async () => {
    const basic = await meetingSetup({ at: il(21, 9, 55), plan: "basic" });
    addKohenMeeting(basic.teams);
    expect(await runMeetingSummaryJob(basic.deps, kohenJob(basic.user.id, { on_demand: true }))).toEqual({ status: "skipped", reason: "not pro" });
    expect(basic.h.ai.calls).toEqual([]);
    const off = await meetingSetup({ at: il(21, 9, 55), profile: { meeting_summaries_disabled: true } });
    addKohenMeeting(off.teams);
    expect(await runMeetingSummaryJob(off.deps, kohenJob(off.user.id))).toEqual({ status: "skipped", reason: "summaries off" });
    scripted(off.h.ai);
    expect(await runMeetingSummaryJob(off.deps, kohenJob(off.user.id, { on_demand: true }))).toMatchObject({ status: "sent" });
    const paused = await meetingSetup({ at: il(21, 9, 55), profile: { proactive_paused_until: il(30, 0).toISOString() } });
    addKohenMeeting(paused.teams);
    expect(await runMeetingSummaryJob(paused.deps, kohenJob(paused.user.id))).toEqual({ status: "skipped", reason: "paused" });
  });

  it("a meeting that moved is left to the plan; a deleted one is dropped", async () => {
    const { user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams);
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id, { end: il(21, 9, 30).toISOString() }))).toEqual({ status: "skipped", reason: "meeting moved" });
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id, { event_id: "AAMkGONE" }))).toEqual({ status: "skipped", reason: "event gone" });
  });

  it("the automatic summary never explains a failure (most meetings are not transcribed)", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 12), msScopes: [...MS_SCOPES] });
    addKohenMeeting(teams);
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id))).toEqual({ status: "skipped", reason: "transcript: consent" });
    expect(visible(h.wa.sent)).toEqual([]);
    expect(h.db.audit.at(-1)).toMatchObject({ action: "meeting.summary", result: "consent" });
  });

  it("a model failure: the automatic one stays quiet, the one asked for says so", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams);
    h.ai.enqueue({ text: "לא JSON" });
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id))).toEqual({ status: "skipped", reason: "summary failed" });
    expect(visible(h.wa.sent)).toEqual([]);
    h.ai.enqueue({ text: "לא JSON" });
    await runMeetingSummaryJob(deps, kohenJob(user.id, { on_demand: true }));
    expect(h.wa.texts.at(-1)).toBe("לא הצלחתי להכין את הסיכום הפעם. אפשר לבקש שוב בעוד כמה דקות.");
  });
});

describe("meeting_summary asked for in the chat (on_demand): why there is none", () => {
  it("Teams without the transcript permission: a reconnect link (pro connects ask for it)", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 12), msScopes: [...MS_SCOPES] });
    addKohenMeeting(teams);
    await runMeetingSummaryJob(deps, kohenJob(user.id, { on_demand: true }));
    expect(h.wa.texts.at(-1)).toMatch(/^כדי לסכם פגישות Teams צריך הרשאה נוספת: קריאת תמלילי פגישות\. חיבור מחדש לוקח חצי דקה:\nhttps:\/\/app\.example\.co\.il\/api\/auth\/microsoft\/start\?t=/);
  });

  it("…and when the organisation needs its IT admin for it: the admin-consent link", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 12), msScopes: [...MS_SCOPES], profile: { ms_meetings_consent: "admin_required" } });
    addKohenMeeting(teams);
    await runMeetingSummaryJob(deps, kohenJob(user.id, { on_demand: true }));
    expect(h.wa.texts.at(-1)).toContain("רק מנהל ה-IT יכול לאשר אותה");
    expect(h.wa.texts.at(-1)).toContain("https://app.example.co.il/api/auth/microsoft/start?admin=1");
  });

  it("transcription was not on: says how to turn it on; not ready yet: says it will come", async () => {
    const late = await meetingSetup({ at: il(21, 12) });
    addKohenMeeting(late.teams, { transcript: false });
    await runMeetingSummaryJob(late.deps, kohenJob(late.user.id, { on_demand: true }));
    expect(late.h.wa.texts.at(-1)).toBe("לא נמצא תמליל של ״סטטוס פרויקט כהן״. הסיכום נבנה מהתמליל ש-Teams שומרת, ולכן צריך להפעיל תמלול בפגישה עצמה (ב-Teams: ״התחלת תמלול״; ב-Meet: ״תמליל״, בחשבונות Google Workspace שכוללים אותו).");
    const soon = await meetingSetup({ at: il(21, 9, 50) });
    addKohenMeeting(soon.teams, { transcript: false });
    expect(await runMeetingSummaryJob(soon.deps, kohenJob(soon.user.id, { on_demand: true }))).toMatchObject({ status: "retry", attempt: 1 });
    expect(soon.h.wa.texts.at(-1)).toBe("התמליל של ״סטטוס פרויקט כהן״ עוד לא מוכן. אנסה שוב בעוד כמה דקות, והסיכום יגיע כאן.");
  });

  it("not the organiser (Graph 403): says only the organiser can read it", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 12) });
    addKohenMeeting(teams);
    teams.state.denied = true;
    await runMeetingSummaryJob(deps, kohenJob(user.id, { on_demand: true }));
    expect(h.wa.texts.at(-1)).toBe("אין לי גישה לתמליל של ״סטטוס פרויקט כהן״. בדרך כלל רק מי שארגן את הפגישה יכול לקרוא את התמליל שלה.");
  });

  it("Meet without drive.readonly: the Drive consent link", async () => {
    vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "true");
    onTestFinished(() => void vi.unstubAllEnvs());
    const { h, user, deps, gfx } = await meetingSetup({ at: il(21, 14), google: true, microsoft: false, googleScopes: ["https://www.googleapis.com/auth/calendar.events"] });
    gfx!.state.events.push(meetEvent("gmeet1", "שיחה עם אברהם", "2026-10-21T13:00", "2026-10-21T13:30"));
    await runMeetingSummaryJob(deps, { id: "j", user_id: user.id, payload: { provider: "google", event_id: "gmeet1", end: il(21, 13, 30).toISOString(), on_demand: true } });
    expect(h.wa.texts.at(-1)).toMatch(/^כדי לסכם פגישות Google Meet צריך הרשאה לקרוא את התמליל ש-Meet שומרת ב-Drive\.\n/);
    expect(h.wa.texts.at(-1)).toContain("feature=drive_read");
    void MEET_URL;
  });

  it("a summary that exists already is sent again (no second model call)", async () => {
    const { h, user, deps, teams } = await meetingSetup({ at: il(21, 9, 55) });
    addKohenMeeting(teams);
    scripted(h.ai);
    await runMeetingSummaryJob(deps, kohenJob(user.id));
    h.wa.sent = [];
    expect(await runMeetingSummaryJob(deps, kohenJob(user.id, { on_demand: true }))).toMatchObject({ status: "sent", mode: "text" });
    expect(visible(h.wa.sent)[0]!.body).toMatch(/^\*סיכום הפגישה/);
    expect(h.ai.calls).toHaveLength(1);
  });
});
