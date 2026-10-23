import { PENDING_TTL_MS } from "@/lib/ai/orchestrator";
import { presentPendingAction } from "@/lib/bot/pending";
import type { BotContext } from "@/lib/bot/context";
import { effectivePlan, entitlements } from "@/lib/billing/plans";
import { mcopy } from "@/lib/copy/bot-meetings";
import type { Db, MeetingSummaryRow, UserRow } from "@/lib/db/types";
import { GOOGLE_DOC_MIME } from "@/lib/google/client";
import { GOOGLE_SCOPES, hasScope } from "@/lib/google/oauth";
import { msHasScope } from "@/lib/ms/oauth";
import { DEFAULT_TZ, dayLabelHe, localDateOf } from "@/lib/time/zoned";
import { actionLines, contentOf, sendSummaryInChat } from "./deliver";
import { meetingSummariesIncluded, scheduleMeetingPlan } from "./jobs";

/**
 * What the user does with a meeting summary (lib/meetings) — the buttons under it and the template's quick replies:
 *   mt:show:<id>   "לראות את הסיכום"  → the full summary with its buttons (from the template, outside the window)
 *   mt:mail:<id>   "מייל למשתתפים"    → a send_mail draft to the attendees → the usual approval card (שלח / ערוך / בטל)
 *   mt:doc:<id>    "מסמך משימות"      → a Google Doc in the user's own Drive (pro's fileCreate, drive.file); without a
 *                                       Google connection the list in the chat (Microsoft: no OneDrive write scope)
 *   mt:tasks:<id>  "להוסיף למשימות"   → the action items in Microsoft To Do / Google Tasks (the user's own list, like
 *                                       the todo_create_task / gtasks_create_task tools); once per summary
 *   mt:off / mt:on, "בלי סיכומי פגישות" / "להחזיר סיכומי פגישות" → profile.meeting_summaries_disabled
 * Ids are looked up with the user's id (another user's id is "gone"). Pro only, checked here on the server. Nothing
 * reaches another person without the approval of the draft.
 */

export type MeetingButton = { verb: "show" | "mail" | "doc" | "tasks"; summaryId: string } | { verb: "off" | "on" };

export function parseMeetingButton(id: string): MeetingButton | null {
  if (id === "mt:off" || id === "mt:on") return { verb: id === "mt:off" ? "off" : "on" };
  const m = id.match(/^mt:(show|mail|doc|tasks):([0-9a-f-]{36})$/);
  return m ? { verb: m[1] as "show" | "mail" | "doc" | "tasks", summaryId: m[2]! } : null;
}

const OFF_RE = /^(?:בלי|ללא|לכבות(?:\s+את)?|תכבי(?:\s+את)?|להפסיק(?:\s+את)?|תפסיקי(?:\s+את)?)\s+(?:ה)?סיכומי(?:\s+ה)?\s*פגישות\s*[.!]*$/;
const ON_RE = /^(?:להחזיר|תחזירי|להפעיל|תפעילי)(?:\s+את)?\s+(?:ה)?סיכומי(?:\s+ה)?\s*פגישות\s*[.!]*$/;

/** "בלי סיכומי פגישות" → "off", "להחזיר סיכומי פגישות" → "on", anything else → null. */
export function meetingCommandOf(text: string): "off" | "on" | null {
  const t = text.trim().replace(/\s+/g, " ");
  return OFF_RE.test(t) ? "off" : ON_RE.test(t) ? "on" : null;
}

/** Automatic meeting summaries on / off (pro). The reply, or the pro line on other plans. */
export async function setMeetingSummariesEnabled(db: Db, user: UserRow, enabled: boolean, now: Date): Promise<{ ok: boolean; changed: boolean; message: string }> {
  if (!(await meetingSummariesIncluded(db, user, now))) return { ok: false, changed: false, message: mcopy["mt.pro_only"]() };
  const wasOn = user.profile.meeting_summaries_disabled !== true;
  if (wasOn === enabled) return { ok: true, changed: false, message: enabled ? mcopy["mt.already_on"]() : mcopy["mt.already_off"]() };
  await db.mergeUserProfile(user.id, { meeting_summaries_disabled: !enabled });
  await db.addAudit({ user_id: user.id, action: enabled ? "meetings.on" : "meetings.off", target: "whatsapp", result: "ok" });
  if (!enabled) {
    await db.cancelJobs(user.id, "meeting_plan");
    await db.cancelJobs(user.id, "meeting_summary");
  } else {
    const fresh = await db.getUser(user.id);
    if (fresh) await scheduleMeetingPlan(db, fresh, now).catch(() => null);
  }
  return { ok: true, changed: true, message: enabled ? mcopy["mt.on"]() : mcopy["mt.off"]() };
}

/** The bot's context (its `meetingWorkspace`: the user's calendars, Drive and task lists). */
export type MeetingActionContext = BotContext;

async function say(ctx: Pick<BotContext, "db" | "wa">, user: UserRow, to: string, text: string): Promise<void> {
  await ctx.wa.sendText(to, text);
  await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
}

const dateOf = (row: MeetingSummaryRow, tz: string) => dayLabelHe(localDateOf(new Date(row.meeting_start), tz));

/** A press on an `mt:` button or quick reply. Always handled here (no model). */
export async function handleMeetingButton(ctx: MeetingActionContext, user: UserRow, to: string, buttonId: string): Promise<{ handled: true; note: string }> {
  const parsed = parseMeetingButton(buttonId);
  const now = ctx.now();
  if (!parsed) {
    await say(ctx, user, to, mcopy["mt.gone"]());
    return { handled: true, note: "meeting button: unknown" };
  }
  if (!("summaryId" in parsed)) {
    const r = await setMeetingSummariesEnabled(ctx.db, user, parsed.verb === "on", now);
    await say(ctx, user, to, r.message);
    return { handled: true, note: `meetings ${parsed.verb}` };
  }
  if (!(await meetingSummariesIncluded(ctx.db, user, now))) {
    await say(ctx, user, to, mcopy["mt.pro_only"]());
    return { handled: true, note: "meeting button: not pro" };
  }
  const row = await ctx.db.getMeetingSummary(user.id, parsed.summaryId);
  if (!row) {
    await say(ctx, user, to, mcopy["mt.gone"]());
    return { handled: true, note: "meeting button: gone" };
  }
  const tz = user.timezone || DEFAULT_TZ;
  const c = contentOf(row);
  switch (parsed.verb) {
    case "show":
      await sendSummaryInChat(ctx, user, to, row);
      return { handled: true, note: "meeting: summary shown" };
    case "mail":
      return mailDraft(ctx, user, to, row, tz);
    case "doc": {
      if (!c.actionItems.length) {
        await say(ctx, user, to, mcopy["mt.empty"]());
        return { handled: true, note: "meeting: no tasks" };
      }
      return tasksDocument(ctx, user, to, row, tz);
    }
    case "tasks": {
      if (!c.actionItems.length) {
        await say(ctx, user, to, mcopy["mt.empty"]());
        return { handled: true, note: "meeting: no tasks" };
      }
      return addTasks(ctx, user, to, row, tz);
    }
  }
}

/** The summary mail: a send_mail draft to everyone on the invitation (the first in "to", the rest in cc), in the user's name. */
async function mailDraft(ctx: MeetingActionContext, user: UserRow, to: string, row: MeetingSummaryRow, tz: string): Promise<{ handled: true; note: string }> {
  if (!row.attendees.length) {
    await say(ctx, user, to, mcopy["mt.mail.no_attendees"]());
    return { handled: true, note: "meeting: mail without attendees" };
  }
  const c = contentOf(row);
  const [first, ...rest] = row.attendees;
  const body = mcopy["mt.mail.body"]({ title: row.title || "(ללא כותרת)", date: dateOf(row, tz), summary: c.summary, decisions: c.decisions, actions: actionLines(c), questions: c.openQuestions, signature: user.name ?? "" });
  const action = await ctx.db.createPendingAction(
    user.id,
    "send_mail",
    { to_name: rest.length ? "" : first!.name, to_email: first!.email, cc: rest.map((a) => a.email).join(", "), subject: mcopy["mt.mail.subject"](row.title || "(ללא כותרת)"), body, provider: row.provider, meeting_summary_id: row.id },
    new Date(ctx.now().getTime() + PENDING_TTL_MS),
  );
  await presentPendingAction(ctx, to, action);
  await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "button", text: "[send_mail]" });
  await ctx.db.markMeetingSummaryAction(user.id, row.id, "mail");
  return { handled: true, note: "meeting: mail draft" };
}

/** Pro's file creation in the user's own Drive (drive.file), or the list in the chat. */
async function tasksDocument(ctx: MeetingActionContext, user: UserRow, to: string, row: MeetingSummaryRow, tz: string): Promise<{ handled: true; note: string }> {
  const c = contentOf(row);
  const lines = actionLines(c);
  const title = row.title || "(ללא כותרת)";
  if (row.done.includes("doc")) {
    await say(ctx, user, to, mcopy["mt.doc.already"](null));
    return { handled: true, note: "meeting: doc again" };
  }
  const plan = entitlements(effectivePlan(await ctx.db.getSubscription(user.id), ctx.now()));
  const g = plan.fileCreate && ctx.meetingWorkspace ? await ctx.meetingWorkspace.google(user).catch(() => null) : null;
  if (g && hasScope(g.scopes, GOOGLE_SCOPES.driveFile)) {
    try {
      const name = mcopy["mt.doc.title"](title, dateOf(row, tz)).slice(0, 200);
      const content = mcopy["mt.doc.body"]({ title, date: dateOf(row, tz), actions: lines, decisions: c.decisions, questions: c.openQuestions });
      const file = await g.google.createFile({ name, mimeType: "text/plain", content, convertTo: GOOGLE_DOC_MIME });
      await ctx.db.markMeetingSummaryAction(user.id, row.id, "doc");
      await ctx.db.addAudit({ user_id: user.id, action: "google.drive.create", target: file.id, result: "meeting_tasks" });
      await say(ctx, user, to, mcopy["mt.doc.saved"](file.name || name, file.webViewLink));
      return { handled: true, note: "meeting: doc saved" };
    } catch (e) {
      console.warn(`[meetings] tasks document failed for ${user.id}:`, (e as Error).message);
    }
  }
  // no Google connection with file creation (Microsoft 365 has no OneDrive write scope here): the list in the chat
  await say(ctx, user, to, mcopy["mt.doc.in_chat"](title, lines));
  return { handled: true, note: "meeting: doc in chat" };
}

/** The action items in the user's own task list: To Do on Microsoft 365, Google Tasks on Google — the meeting's own first. */
async function addTasks(ctx: MeetingActionContext, user: UserRow, to: string, row: MeetingSummaryRow, tz: string): Promise<{ handled: true; note: string }> {
  const c = contentOf(row);
  const title = row.title || "(ללא כותרת)";
  const ws = ctx.meetingWorkspace;
  type Target = { service: string; add: (t: { title: string; notes: string; due: string | null }) => Promise<unknown> };
  const targets: Record<"microsoft" | "google", () => Promise<Target | null>> = {
    microsoft: async () => {
      const ms = ws ? await ws.microsoft(user).catch(() => null) : null;
      if (!ms || !msHasScope(ms.scopes, "Tasks.ReadWrite")) return null;
      const lists = await ms.graph.todoLists();
      const list = lists.find((l) => l.isDefault) ?? lists[0];
      return list ? { service: "Microsoft To Do", add: (t) => ms.graph.createTodoTask(list.id, t) } : null;
    },
    google: async () => {
      const g = ws ? await ws.google(user).catch(() => null) : null;
      if (!g || !hasScope(g.scopes, GOOGLE_SCOPES.tasks)) return null;
      return { service: "Google Tasks", add: (t) => g.google.createTask("@default", t) };
    },
  };
  const order: ("microsoft" | "google")[] = row.provider === "microsoft" ? ["microsoft", "google"] : ["google", "microsoft"];
  let target: Target | null = null;
  for (const p of order) {
    target = await targets[p]().catch(() => null);
    if (target) break;
  }
  if (!target) {
    await say(ctx, user, to, mcopy["mt.tasks.unavailable"]());
    return { handled: true, note: "meeting: no task list" };
  }
  // once per summary, atomically: a second press (or two at once) adds nothing
  if (!(await ctx.db.markMeetingSummaryAction(user.id, row.id, "tasks"))) {
    await say(ctx, user, to, mcopy["mt.tasks.already"]());
    return { handled: true, note: "meeting: tasks again" };
  }
  const added: string[] = [];
  const date = dateOf(row, tz);
  for (const a of c.actionItems) {
    try {
      await target.add({ title: a.task.slice(0, 250), notes: `מהפגישה ״${title}״ (${date})${a.owner ? `. אחראי: ${a.owner}` : ""}`, due: a.due });
      added.push(a.task);
    } catch (e) {
      console.warn(`[meetings] adding a task failed for ${user.id}:`, (e as Error).message);
    }
  }
  await ctx.db.addAudit({ user_id: user.id, action: "meeting.tasks", target: row.id, result: `${added.length}/${c.actionItems.length}` });
  await say(ctx, user, to, added.length === c.actionItems.length ? mcopy["mt.tasks.added"](added.length, target.service, added) : mcopy["mt.tasks.partial"](added.length, c.actionItems.length, target.service));
  return { handled: true, note: "meeting: tasks added" };
}

/** "בלי סיכומי פגישות" / "להחזיר סיכומי פגישות" typed in the chat — not counted, no model. False when it is something else. */
export async function handleMeetingCommand(ctx: Pick<BotContext, "db" | "wa" | "now">, user: UserRow, to: string, text: string): Promise<boolean> {
  const cmd = meetingCommandOf(text);
  if (!cmd) return false;
  const r = await setMeetingSummariesEnabled(ctx.db, user, cmd === "on", ctx.now());
  await say(ctx, user, to, r.message);
  return true;
}

