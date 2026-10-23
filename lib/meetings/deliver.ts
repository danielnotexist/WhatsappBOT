import { mcopy, meetingButtons, type SummaryView } from "@/lib/copy/bot-meetings";
import type { MeetingSummaryRow, UserRow } from "@/lib/db/types";
import { isWindowOpen, type ProactiveDeps } from "@/lib/jobs/proactive";
import { DEFAULT_TZ, dayLabelHe, localDateOf, parseDateKey, zonedParts } from "@/lib/time/zoned";
import { WaApiError } from "@/lib/wa/client";
import { meetingSummaryReadyTemplate } from "@/lib/wa/templates";
import type { ReplyButton } from "@/lib/wa/types";
import type { MeetingSummaryContent } from "./summarize";

/**
 * How a stored meeting summary reaches the user (lib/meetings): inside the 24-hour window the summary as text and,
 * right under it, the action buttons ([מייל למשתתפים] [מסמך משימות] [להוסיף למשימות] — mt:<verb>:<id>); outside it
 * the UTILITY template `meeting_summary_ready` with the short summary and [לראות את הסיכום] (mt:show:<id>), whose
 * press opens the window and brings the full summary with the buttons. Nothing goes to anyone else from here.
 */

/** Meta: "Re-engagement message" — the window is closed after all. */
const WINDOW_CLOSED_CODE = 131047;

export function contentOf(row: Pick<MeetingSummaryRow, "content">): MeetingSummaryContent {
  const c = row.content as Partial<MeetingSummaryContent>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const items = Array.isArray(c.actionItems) ? c.actionItems.filter((a) => a && typeof a.task === "string") : [];
  return { summary: typeof c.summary === "string" ? c.summary : "", decisions: list(c.decisions), actionItems: items.map((a) => ({ task: a.task, owner: a.owner ?? null, due: a.due ?? null })), openQuestions: list(c.openQuestions), ...(c.partial ? { partial: true } : {}) };
}

/** "יום ה׳ 22.10" for a YYYY-MM-DD due date (as written when it cannot be read). */
export function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const d = parseDateKey(due);
  return d ? dayLabelHe(d) : due;
}

export function actionLines(c: MeetingSummaryContent): string[] {
  return c.actionItems.map((a) => mcopy["mt.action_line"](a.task, a.owner, dueLabel(a.due)));
}

/** "יום ה׳ 22.10, 10:00" — when the meeting began, in the user's zone. */
export function meetingWhen(startIso: string, tz: string = DEFAULT_TZ): string {
  const at = new Date(startIso);
  const p = zonedParts(at, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dayLabelHe(localDateOf(at, tz))}, ${pad(p.hour)}:${pad(p.minute)}`;
}

export const platformLabel = (provider: MeetingSummaryRow["provider"]) => (provider === "microsoft" ? "Teams" : "Google Meet");

export function summaryView(row: MeetingSummaryRow, tz: string = DEFAULT_TZ): SummaryView {
  const c = contentOf(row);
  return { title: row.title || "(ללא כותרת)", when: meetingWhen(row.meeting_start, tz), platform: platformLabel(row.provider), summary: c.summary, decisions: c.decisions, actions: actionLines(c), questions: c.openQuestions, partial: c.partial };
}

export function renderSummaryText(row: MeetingSummaryRow, tz: string = DEFAULT_TZ): string {
  return mcopy["mt.summary"](summaryView(row, tz));
}

/** The buttons under a summary: the mail when there is someone to write to, the document and the tasks when there are tasks. */
export function summaryButtons(row: MeetingSummaryRow): ReplyButton[] {
  const c = contentOf(row);
  const out: ReplyButton[] = [];
  if (row.attendees.length) out.push({ id: `mt:mail:${row.id}`, title: meetingButtons.mail });
  if (c.actionItems.length) out.push({ id: `mt:doc:${row.id}`, title: meetingButtons.doc }, { id: `mt:tasks:${row.id}`, title: meetingButtons.tasks });
  return out;
}

/** The summary as text and the buttons under it (the window is open: the user just wrote or pressed). */
export async function sendSummaryInChat(deps: Pick<ProactiveDeps, "db" | "wa">, user: UserRow, to: string, row: MeetingSummaryRow): Promise<string> {
  const tz = user.timezone || DEFAULT_TZ;
  const text = renderSummaryText(row, tz);
  const r = await deps.wa.sendText(to, text);
  await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text, wa_message_id: r.messageId || null });
  const buttons = summaryButtons(row);
  if (buttons.length) {
    const body = mcopy["mt.actions.body"]();
    const b = await deps.wa.sendButtons(to, body, buttons);
    await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "button", text: body, wa_message_id: b.messageId || null });
  }
  return text;
}

/**
 * A summary the user did not just ask for in the chat (the job): free text with the buttons inside the window, the
 * `meeting_summary_ready` template outside it (or when WhatsApp says the window closed after all). Throws on other
 * WhatsApp errors.
 */
export async function deliverSummary(deps: ProactiveDeps, user: UserRow, phone: string, row: MeetingSummaryRow): Promise<"text" | "template"> {
  const sendTemplate = async () => {
    const c = contentOf(row);
    const t = meetingSummaryReadyTemplate({ title: row.title || "(ללא כותרת)", summary: c.summary, summaryId: row.id });
    const r = await deps.wa.sendTemplate(phone, t.name, t.params.map((text) => ({ type: "text" as const, text })), t.buttons);
    await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "template", text: renderSummaryText(row, user.timezone || DEFAULT_TZ), wa_message_id: r.messageId || null });
    return "template" as const;
  };
  if (!(await isWindowOpen(deps.db, user.id, deps.now()))) return sendTemplate();
  try {
    await sendSummaryInChat(deps, user, phone, row);
    return "text";
  } catch (e) {
    if (e instanceof WaApiError && e.code === WINDOW_CLOSED_CODE) return sendTemplate();
    throw e;
  }
}
