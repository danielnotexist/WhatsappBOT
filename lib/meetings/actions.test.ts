import { afterEach, describe, expect, it } from "vitest";
import { clearExecutorsForTests, registerExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { graphExecutors } from "@/lib/ms/tools";
import { MS_SCOPES } from "@/lib/ms/oauth";
import { KOHEN_SUMMARY, addKohenMeeting, il, kohenJob, meetingSetup } from "./__fixtures__/meetings-harness";
import { meetingCommandOf, parseMeetingButton } from "./actions";
import { runMeetingSummaryJob } from "./jobs";

const visible = <T extends { kind: string }>(sent: T[]) => sent.filter((x) => x.kind !== "read" && x.kind !== "reaction");

/** Dana's Kohen meeting summarised (inside the window); the wa log cleared. */
async function summarised(opts: Parameters<typeof meetingSetup>[0] = { at: il(21, 9, 55) }) {
  const s = await meetingSetup(opts);
  addKohenMeeting(s.teams);
  s.h.ai.enqueue({ text: JSON.stringify(KOHEN_SUMMARY) });
  await runMeetingSummaryJob(s.deps, kohenJob(s.user.id));
  const row = s.h.db.meetingSummaries[0]!;
  s.h.wa.sent = [];
  const press = (verb: string, id = row.id) => processInbound(s.h.ctx, s.h.button(`mt:${verb}:${id}`, verb));
  return { ...s, row, press };
}

afterEach(() => clearExecutorsForTests());

describe("the summary's buttons", () => {
  it("parses mt:<verb>:<uuid> and mt:off / mt:on only", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseMeetingButton(`mt:tasks:${id}`)).toEqual({ verb: "tasks", summaryId: id });
    expect(parseMeetingButton("mt:off")).toEqual({ verb: "off" });
    expect(parseMeetingButton("mt:send:x")).toBeNull();
    expect(meetingCommandOf("בלי סיכומי פגישות")).toBe("off");
    expect(meetingCommandOf("להחזיר את סיכומי הפגישות")).toBe("on");
    expect(meetingCommandOf("סיכום של הפגישה האחרונה")).toBeNull();
  });

  it("[מייל למשתתפים] → a mail draft to the attendees (first in To, the rest in Cc) with the usual approval buttons; sent only after [שלח]", async () => {
    const { h, row, press, teams } = await summarised();
    registerExecutor("send_mail", graphExecutors(async () => ({ graph: teams.graph, timeZone: "Asia/Jerusalem" })).send_mail);
    await press("mail");
    const action = h.db.pendingActions.at(-1)!;
    expect(action.kind).toBe("send_mail");
    expect(action.payload).toMatchObject({ to_email: "yossi@kohen.co.il", cc: "ronit@levi-law.co.il", subject: "סיכום פגישה: סטטוס פרויקט כהן", provider: "microsoft", meeting_summary_id: row.id });
    const body = String(action.payload.body);
    expect(body).toMatch(/^שלום לכולם,\n\nתודה על הפגישה \(סטטוס פרויקט כהן, יום ד׳ 21\.10\)\. הנה סיכום קצר:/);
    expect(body).toContain("משימות:\n• להכין את הנספחים (רונית לוי, עד יום א׳ 25.10)");
    expect(body.endsWith("בברכה,\nדנה לוי")).toBe(true);
    const card = visible(h.wa.sent).at(-1)!;
    expect(card.body).toContain("*טיוטה למייל*\nאל: yossi@kohen.co.il\nעותק: ronit@levi-law.co.il\nנושא: סיכום פגישה: סטטוס פרויקט כהן");
    expect(card.buttons!.map((b) => b.id)).toEqual([`pa:approve:${action.id}`, `pa:edit:${action.id}`, `pa:cancel:${action.id}`]);
    expect(teams.fx.state.sent).toEqual([]); // nothing went out yet
    await processInbound(h.ctx, h.button(`pa:approve:${action.id}`, "שלח"));
    const mail = teams.fx.state.sent[0] as { message: { toRecipients: { emailAddress: { address: string } }[]; ccRecipients: { emailAddress: { address: string } }[] } };
    expect(mail.message.toRecipients.map((r) => r.emailAddress.address)).toEqual(["yossi@kohen.co.il"]);
    expect(mail.message.ccRecipients.map((r) => r.emailAddress.address)).toEqual(["ronit@levi-law.co.il"]);
  });

  it("[להוסיף למשימות] → the action items in Microsoft To Do, with the owner and due date; a second press adds nothing", async () => {
    const { h, press, teams } = await summarised();
    const before = teams.fx.state.todo[0]!.tasks.length;
    await press("tasks");
    const added = teams.fx.state.todo[0]!.tasks.slice(0, teams.fx.state.todo[0]!.tasks.length - before);
    expect(added.map((t) => t.title).sort()).toEqual(["להכין את הנספחים", "לבדוק את החוזה מול רו״ח ברק"].sort());
    expect(added.find((t) => t.title === "להכין את הנספחים")).toMatchObject({ dueDateTime: { dateTime: "2026-10-25T00:00:00.0000000" } });
    expect(h.wa.texts.at(-1)).toBe("הוספתי 2 משימות ל-Microsoft To Do:\n• להכין את הנספחים\n• לבדוק את החוזה מול רו״ח ברק");
    await press("tasks");
    expect(h.wa.texts.at(-1)).toBe("המשימות מהפגישה הזו כבר נוספו לרשימה.");
    expect(teams.fx.state.todo[0]!.tasks.length - before).toBe(2);
  });

  it("[להוסיף למשימות] without To Do: Google Tasks when Google is connected with it, else a short line", async () => {
    const g = await summarised({ at: il(21, 9, 55), msScopes: [...MS_SCOPES.filter((s) => s !== "Tasks.ReadWrite"), "OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All"], google: true });
    await g.press("tasks");
    expect(g.h.wa.texts.at(-1)).toMatch(/^הוספתי 2 משימות ל-Google Tasks:/);
    const none = await summarised({ at: il(21, 9, 55), msScopes: [...MS_SCOPES.filter((s) => s !== "Tasks.ReadWrite"), "OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All"] });
    await none.press("tasks");
    expect(none.h.wa.texts.at(-1)).toBe("כדי להוסיף משימות צריך את Google Tasks או את Microsoft To Do בחשבון המחובר. בינתיים אפשר לבחור ״מסמך משימות״.");
  });

  it("[מסמך משימות] → a Google Doc in the user's own Drive (pro), with the link", async () => {
    const { h, press, gfx } = await summarised({ at: il(21, 9, 55), google: true });
    await press("doc");
    const doc = gfx!.state.files.at(-1)!;
    expect(doc.name).toBe("משימות מהפגישה - סטטוס פרויקט כהן (יום ד׳ 21.10)");
    expect(doc.mimeType).toBe("application/vnd.google-apps.document");
    expect(Buffer.from(doc.content).toString("utf8")).toContain("☐ להכין את הנספחים (רונית לוי, עד יום א׳ 25.10)");
    expect(h.wa.texts.at(-1)).toBe(`שמרתי את מסמך המשימות ב-Google Drive: ״${doc.name}״.\n${doc.webViewLink}`);
    await press("doc");
    expect(h.wa.texts.at(-1)).toBe("מסמך המשימות של הפגישה הזו כבר נשמר.");
  });

  it("[מסמך משימות] with Microsoft 365 only (no OneDrive write here): the list in the chat", async () => {
    const { h, press } = await summarised();
    await press("doc");
    expect(h.wa.texts.at(-1)).toBe("בחשבון הזה אין לי אפשרות לשמור מסמך חדש, אז הנה רשימת המשימות מהפגישה ״סטטוס פרויקט כהן״, מוכנה להעתקה:\n\n☐ להכין את הנספחים (רונית לוי, עד יום א׳ 25.10)\n☐ לבדוק את החוזה מול רו״ח ברק (יוסי כהן)");
  });

  it("another user's id, an unknown id, or after a downgrade: never acts", async () => {
    const { h, press, user } = await summarised();
    await press("tasks", "22222222-2222-4222-8222-222222222222");
    expect(h.wa.texts.at(-1)).toBe("הסיכום הזה כבר לא זמין (סיכומים נשמרים 30 יום). אפשר לבקש סיכום חדש של הפגישה.");
    await h.db.upsertSubscription(user.id, { plan: "basic" });
    await press("mail");
    expect(h.wa.texts.at(-1)).toBe("סיכומי פגישות Teams ו-Google Meet כלולים במסלול פרו. לשדרוג אפשר לכתוב ״שדרוג״.");
    expect(h.db.pendingActions).toEqual([]);
  });

  it("'בלי סיכומי פגישות' (typed or the template's quick reply) turns the automatic ones off and cancels queued jobs; 'להחזיר סיכומי פגישות' back on", async () => {
    const { h, user } = await summarised();
    await h.db.createJob({ kind: "meeting_plan", user_id: user.id, run_at: il(21, 11), dedupe_key: "p1" });
    await processInbound(h.ctx, h.inbound("בלי סיכומי פגישות"));
    expect(h.wa.texts.at(-1)).toBe("בסדר, בלי סיכומי פגישות אוטומטיים. אפשר עדיין לבקש סיכום של פגישה מסוימת, ולהחזיר אותם — ״להחזיר סיכומי פגישות״.");
    expect((await h.db.getUser(user.id))!.profile.meeting_summaries_disabled).toBe(true);
    expect(h.db.jobs.find((j) => j.dedupe_key === "p1")!.status).toBe("cancelled");
    await processInbound(h.ctx, h.inbound("x", { type: "template_button", reply: { id: "mt:off", title: "בלי סיכומי פגישות" } }));
    expect(h.wa.texts.at(-1)).toBe("סיכומי הפגישות האוטומטיים כבר כבויים. להחזיר אותם — ״להחזיר סיכומי פגישות״.");
    await processInbound(h.ctx, h.inbound("להחזיר סיכומי פגישות"));
    expect(h.wa.texts.at(-1)).toBe("סיכומי הפגישות חזרו: אחרי כל פגישת Teams או Google Meet עם תמליל, הסיכום יגיע כאן.");
    expect(h.db.jobs.filter((j) => j.kind === "meeting_plan" && j.status === "queued")).toHaveLength(1);
    expect(h.ai.calls).toHaveLength(1); // only the summary itself
  });
});
