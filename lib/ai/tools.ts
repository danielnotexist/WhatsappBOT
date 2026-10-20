import type { Db, PendingActionRow } from "@/lib/db/types";
import type { ToolDefinition } from "./types";

/** Runtime handed to every tool. `createPending` is how a tool proposes an outbound action (never executes it). */
export interface ToolContext {
  db: Db;
  userId: string;
  now: Date;
  /** records a pending action and returns it; the pipeline renders it with approval buttons */
  createPending(kind: PendingActionRow["kind"], payload: Record<string, unknown>): Promise<PendingActionRow>;
}

export interface Tool extends ToolDefinition {
  /** `true` when the tool only reads (no approval UI needed) */
  readOnly: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const str = (description: string) => ({ type: "string", description });

export const draftEmailTool: Tool = {
  name: "draft_email",
  description: "מנסח טיוטת מייל חדשה ומעביר אותה לאישור המשתמש בכפתורים. לא שולח. להשתמש כשמבקשים לכתוב/לנסח/לשלוח מייל.",
  readOnly: false,
  input_schema: {
    type: "object",
    properties: {
      to_name: str("שם הנמען כפי שהמשתמש קרא לו (ריק אם לא ידוע)"),
      to_email: str("כתובת המייל של הנמען, או ריק אם לא ידועה"),
      subject: str("נושא המייל בעברית"),
      body: str("גוף המייל המלא, בעברית, בגוף ראשון בשם המשתמש, עם ברכה וחתימה"),
    },
    required: ["to_name", "to_email", "subject", "body"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const pending = await ctx.createPending("send_mail", {
      to_name: String(input.to_name ?? ""),
      to_email: String(input.to_email ?? ""),
      subject: String(input.subject ?? ""),
      body: String(input.body ?? ""),
    });
    return { status: "pending_approval", pending_action_id: pending.id, note: "הטיוטה מוצגת למשתמש עם כפתורי שלח/ערוך/בטל. ענה במשפט קצר בלבד." };
  },
};

export const createEventTool: Tool = {
  name: "create_event",
  description: "מכין פגישה חדשה ביומן ומעביר לאישור המשתמש. לא יוצר בפועל. להשתמש כשמבקשים לקבוע פגישה.",
  readOnly: false,
  input_schema: {
    type: "object",
    properties: {
      title: str("כותרת הפגישה"),
      date: str("תאריך בפורמט YYYY-MM-DD"),
      start: str("שעת התחלה HH:MM (24 שעות)"),
      end: str("שעת סיום HH:MM"),
      location: str("מקום, או ריק"),
      attendees: { type: "array", items: { type: "string" }, description: "כתובות מייל של משתתפים (ריק אם אין)" },
    },
    required: ["title", "date", "start", "end", "location", "attendees"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const pending = await ctx.createPending("create_event", {
      title: String(input.title ?? ""),
      date: String(input.date ?? ""),
      start: String(input.start ?? ""),
      end: String(input.end ?? ""),
      location: String(input.location ?? ""),
      attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : [],
    });
    return { status: "pending_approval", pending_action_id: pending.id, note: "הפרטים מוצגים למשתמש עם כפתורי קבע/ערוך/בטל. ענה במשפט קצר בלבד." };
  },
};

export const setMorningTimeTool: Tool = {
  name: "set_morning_time",
  description: "משנה את שעת סיכום הבוקר של המשתמש (או מכבה אותו). פעולה פנימית — לא דורשת אישור.",
  readOnly: true,
  input_schema: {
    type: "object",
    properties: { time: str('שעה HH:MM בפורמט 24 שעות, או "off" לכיבוי') },
    required: ["time"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const time = String(input.time ?? "").trim();
    if (time === "off") {
      await ctx.db.mergeUserProfile(ctx.userId, { morning_summary_enabled: false });
      return { status: "done", morning_summary: "off" };
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { status: "error", error: "פורמט שעה לא תקין (HH:MM)" };
    await ctx.db.updateUserProfile(ctx.userId, { morning_time: time });
    await ctx.db.mergeUserProfile(ctx.userId, { morning_summary_enabled: true });
    return { status: "done", morning_time: time };
  },
};

export const rememberFactTool: Tool = {
  name: "remember_fact",
  description: "שומר עובדה קבועה על המשתמש או העסק לשיחות הבאות (למשל \"הרו\"ח שלי הוא ברק\"). לא לשימוש במידע חד-פעמי.",
  readOnly: true,
  input_schema: {
    type: "object",
    properties: { fact: str("העובדה במשפט אחד בעברית") },
    required: ["fact"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const fact = String(input.fact ?? "").trim().slice(0, 200);
    if (!fact) return { status: "error", error: "empty" };
    const state = await ctx.db.getConversationState(ctx.userId);
    const facts = [...(state?.facts ?? []).filter((f) => f !== fact), fact].slice(-30);
    await ctx.db.upsertConversationState(ctx.userId, { facts });
    return { status: "done" };
  },
};

/** Tools available before any Microsoft/Google connection exists. Graph/Google tools register in Milestone 4/6. */
export const BASE_TOOLS: Tool[] = [draftEmailTool, createEventTool, setMorningTimeTool, rememberFactTool];

export function toolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
