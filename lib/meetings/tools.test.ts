import { describe, expect, it } from "vitest";
import { toolsForPlan } from "@/lib/ai/plan-tools";
import { toolsForAgent } from "@/lib/agents/capabilities";
import { processInbound } from "@/lib/bot/process-inbound";
import { KOHEN_SUMMARY, ZOOM_URL, addKohenMeeting, il, meetingSetup, teamsEvent } from "./__fixtures__/meetings-harness";
import { runMeetingSummaryJob } from "./jobs";
import type { MeetingRef } from "./meeting";
import { MEETING_SUMMARY_TOOL, matchMeeting, meetingSummaryTool } from "./tools";

const visible = <T extends { kind: string }>(sent: T[]) => sent.filter((x) => x.kind !== "read" && x.kind !== "reaction");

async function chat(opts: Parameters<typeof meetingSetup>[0]) {
  const s = await meetingSetup(opts);
  s.h.ctx.extraTools = async (user) => [meetingSummaryTool({ workspace: s.workspace, user })];
  return s;
}

describe("asking for a summary in the chat", () => {
  it("'סיכום של הפגישה האחרונה' → the last online meeting that ended; the job runs and the summary comes with its buttons", async () => {
    const { h, user, deps, teams } = await chat({ at: il(21, 10) });
    addKohenMeeting(teams);
    await processInbound(h.ctx, h.inbound("סיכום של הפגישה האחרונה"));
    expect(h.wa.texts.at(-1)).toBe("מכינה את הסיכום של ״סטטוס פרויקט כהן״ (יום ד׳ 21.10, 09:00). זה לוקח דקה או שתיים, והוא יגיע כאן.");
    const job = h.db.jobs.find((j) => j.kind === "meeting_summary")!;
    expect(job).toMatchObject({ run_at: il(21, 10).toISOString(), payload: { provider: "microsoft", event_id: "AAMkKOHEN", on_demand: true } });
    h.wa.sent = [];
    h.ai.enqueue({ text: JSON.stringify(KOHEN_SUMMARY) });
    expect(await runMeetingSummaryJob(deps, { id: job.id, user_id: user.id, payload: job.payload })).toMatchObject({ status: "sent", mode: "text" });
    expect(visible(h.wa.sent).map((x) => x.kind)).toEqual(["text", "buttons"]);
  });

  it("'תסכמי את הפגישה עם כהן' picks the meeting with Kohen, not the newest one", async () => {
    const { h, teams } = await chat({ at: il(21, 10, 30) });
    addKohenMeeting(teams);
    teams.fx.state.events.push(teamsEvent("AAMkBANK", "שיחה עם הבנק", "2026-10-21T10:00", "2026-10-21T10:20", { attendees: [{ emailAddress: { name: "פקיד הבנק", address: "clerk@bank.co.il" }, status: { response: "accepted" } }] }));
    await processInbound(h.ctx, h.inbound("תסכמי את הפגישה עם כהן"));
    expect(h.wa.texts.at(-1)).toContain("״סטטוס פרויקט כהן״");
    expect(h.db.jobs.find((j) => j.kind === "meeting_summary")!.payload.event_id).toBe("AAMkKOHEN");
  });

  it("Zoom: 'בקרוב'; nothing found: says so", async () => {
    const zoom = await chat({ at: il(21, 10) });
    zoom.teams.fx.state.events.push(teamsEvent("AAMkZOOM", "זום עם ספק", "2026-10-21T09:00", "2026-10-21T09:30", { isOnlineMeeting: false, onlineMeeting: null, location: { displayName: ZOOM_URL } }));
    await processInbound(zoom.h.ctx, zoom.h.inbound("סיכום של הפגישה האחרונה"));
    expect(zoom.h.wa.texts.at(-1)).toBe("סיכום של פגישות Zoom עוד לא זמין (בקרוב). כרגע אפשר לסכם פגישות Teams ו-Google Meet.");
    expect(zoom.h.db.jobs).toEqual([]);
    const none = await chat({ at: il(21, 10) });
    await processInbound(none.h.ctx, none.h.inbound("תסכמי את הפגישה עם כהן"));
    expect(none.h.wa.texts.at(-1)).toBe("לא מצאתי פגישה מקוונת שהסתיימה בשבועיים האחרונים ומתאימה ל״כהן״. אפשר לכתוב את שם הפגישה או את שם אחד המשתתפים.");
  });

  it("a meeting still going: its summary is queued for the end + 10 minutes", async () => {
    const { h, teams } = await chat({ at: il(21, 9, 30) });
    addKohenMeeting(teams); // 09:00–09:45
    await processInbound(h.ctx, h.inbound("סיכום של הפגישה עם כהן"));
    expect(h.wa.texts.at(-1)).toBe("הפגישה ״סטטוס פרויקט כהן״ עוד לא הסתיימה. כשהיא תסתיים והתמליל יהיה מוכן, אשלח את הסיכום כאן.");
    expect(h.db.jobs.find((j) => j.kind === "meeting_summary")!.run_at).toBe(il(21, 9, 55).toISOString());
  });

  it("pro only: the tool never reaches the model on basic or the trial (pro_feature instead), and never an agent", () => {
    const tool = meetingSummaryTool({ workspace: { microsoft: async () => null, google: async () => null }, user: { id: "u", timezone: "Asia/Jerusalem" } as never });
    for (const plan of ["basic", "trial"] as const) {
      const names = toolsForPlan([tool], plan).map((t) => t.name);
      expect(names, plan).not.toContain(MEETING_SUMMARY_TOOL);
      expect(names, plan).toContain("pro_feature");
    }
    expect(toolsForPlan([tool], "pro").map((t) => t.name)).toEqual([MEETING_SUMMARY_TOOL]);
    expect(toolsForAgent([tool], ["calendar.read", "mail.draft", "files.save", "reminders"])).toEqual([]);
  });
});

describe("matching a meeting to the request", () => {
  const m = (title: string, people: string[], endMs: number): MeetingRef => ({ provider: "microsoft", eventId: title, title, startMs: endMs - 1, endMs, joinUrl: "https://teams.microsoft.com/x", platform: "teams", attendees: people.map((p) => ({ name: p, email: `${p}@x.co.il` })), isOrganizer: true });
  const list = [m("שיחה עם הבנק", ["פקיד"], 3), m("סטטוס פרויקט", ["יוסי כהן"], 2), m("ישיבת צוות", ["רונית לוי"], 1)];

  it("no words (or only 'הפגישה האחרונה') → the newest; otherwise every word in the title or a person", () => {
    expect(matchMeeting(list, "")!.title).toBe("שיחה עם הבנק");
    expect(matchMeeting(list, "הפגישה האחרונה")!.title).toBe("שיחה עם הבנק");
    expect(matchMeeting(list, "כהן")!.title).toBe("סטטוס פרויקט");
    expect(matchMeeting(list, "רונית לוי")!.title).toBe("ישיבת צוות");
    expect(matchMeeting(list, "הבנק")!.title).toBe("שיחה עם הבנק");
    expect(matchMeeting(list, "אברהם")).toBeNull();
  });
});
