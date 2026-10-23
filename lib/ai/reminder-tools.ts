import { reminderButtons } from "@/lib/copy/bot-m5";
import { cancelReminder, createReminder, listOpenReminders } from "@/lib/reminders/service";
import type { Tool } from "./tools";

/**
 * Reminder tools for the strong model (Milestone 5). Internal actions — no approval buttons (PLAN §2.3 covers
 * outbound mail / calendar / files only). The model passes the user's own time phrase; the deterministic
 * parser (lib/reminders/parse.ts) computes the instant, and `reply` carries the absolute-time echo.
 */
const str = (description: string) => ({ type: "string", description });
const REPLY_NOTE = "לענות למשתמש בדיוק בנוסח שב-reply, בלי להוסיף או לשנות את הזמן, ובלי לספר על ניסיונות קודמים.";

export const createReminderTool: Tool = {
  name: "create_reminder",
  description:
    'קובע תזכורת (חד-פעמית או חוזרת) שתישלח למשתמש בוואטסאפ בזמן שביקש. פעולה פנימית, בלי אישור. את הזמן מעבירים בדיוק כפי שהמשתמש כתב ("מחר ב-9", "עוד שעתיים", "ביום ראשון הבא ב-8:30", "כל יום בשמונה") — המערכת מחשבת את השעה המדויקת. אם לא צוין זמן — when ריק, והמערכת תשאל.',
  readOnly: true,
  input_schema: {
    type: "object",
    properties: {
      text: str('מה להזכיר, קצר ובלשון המשתמש (למשל "להתקשר לבנק")'),
      when: str("ביטוי הזמן כפי שנכתב בהודעה, או YYYY-MM-DDTHH:MM; ריק אם לא צוין"),
    },
    required: ["text", "when"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const user = await ctx.db.getUser(ctx.userId);
    if (!user) return { status: "error", error: "user not found" };
    const r = await createReminder(ctx.db, user, { text: String(input.text ?? ""), when: String(input.when ?? "") }, ctx.now);
    if (r.status === "created" && r.nextDay) {
      // "מחר" after midnight: set for the coming morning; the next date rides on the reply as one button
      ctx.addReplyButtons?.(reminderButtons.nextDay(r.reminder.id, r.nextDay.label));
      return { status: "done", reminder_id: r.reminder.id, when: r.whenAbs, reply: r.reply, note: `${REPLY_NOTE} התזכורת נקבעה לבוקר הקרוב בכוונה, ומצורף כפתור להעברה ל${r.nextDay.label}. לא לשנות, לבטל או לקבוע אותה מחדש.` };
    }
    if (r.status === "created") return { status: "done", reminder_id: r.reminder.id, when: r.whenAbs, recurring: r.recurring, reply: r.reply, note: REPLY_NOTE };
    return { status: r.status, reply: r.reply, note: "התזכורת לא נקבעה. לענות למשתמש בנוסח שב-reply." };
  },
};

export const listRemindersTool: Tool = {
  name: "list_reminders",
  description: "מחזיר את התזכורות הפתוחות של המשתמש (מזהה, טקסט, מתי).",
  readOnly: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(_input, ctx) {
    const user = await ctx.db.getUser(ctx.userId);
    if (!user) return { status: "error", error: "user not found" };
    const { reminders, reply } = await listOpenReminders(ctx.db, user, ctx.now);
    return { count: reminders.length, reminders: reminders.map((r) => ({ id: r.id, text: r.text, when: r.when, recurring: Boolean(r.recurrence) })), reply, note: "אפשר להציג את reply כמו שהוא." };
  },
};

export const cancelReminderTool: Tool = {
  name: "cancel_reminder",
  description: "מבטל תזכורת פתוחה לפי מזהה (מ-list_reminders) או לפי מילים מהטקסט שלה. אם יש כמה התאמות — מחזיר אותן כדי לשאול איזו.",
  readOnly: true,
  input_schema: {
    type: "object",
    properties: { reminder_id: str("מזהה התזכורת, או ריק"), text_query: str("מילים מתוך טקסט התזכורת, או ריק") },
    required: ["reminder_id", "text_query"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const user = await ctx.db.getUser(ctx.userId);
    if (!user) return { status: "error", error: "user not found" };
    const id = String(input.reminder_id ?? "").trim();
    const r = await cancelReminder(ctx.db, user, { id: id || undefined, query: String(input.text_query ?? "") }, ctx.now);
    return r.status === "ambiguous" ? { status: r.status, candidates: r.candidates, reply: r.reply } : { status: r.status, reply: r.reply, note: REPLY_NOTE };
  },
};

export const REMINDER_TOOLS: Tool[] = [createReminderTool, listRemindersTool, cancelReminderTool];
