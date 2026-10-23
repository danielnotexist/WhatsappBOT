import { copy, onlineService } from "@/lib/copy/bot";
import type { Db, PendingActionRow } from "@/lib/db/types";
import { providerForAction } from "@/lib/google/dispatch";
import type { OnlineMeetingProvider } from "@/lib/online-meeting";
import { rescheduleMorningSummary } from "@/lib/jobs/morning-summary";
import { REMINDER_TOOLS } from "./reminder-tools";
import type { ToolDefinition } from "./types";

/**
 * Whether the account can create the online meeting a draft would name, asked before the draft exists. Microsoft only
 * (allowedOnlineMeetingProviders); Google cannot be checked under calendar.events (lib/online-meeting.ts). Null when
 * unknown: the draft is made as asked and the executor checks again after the press.
 */
export type OnlineMeetingCheck = (provider: OnlineMeetingProvider) => Promise<{ available: boolean; personal: boolean } | null>;

/** Runtime handed to every tool. `createPending` is how a tool proposes an outbound action (never executes it). */
export interface ToolContext {
  db: Db;
  userId: string;
  now: Date;
  /** records a pending action and returns it; the pipeline renders it with approval buttons */
  createPending(kind: PendingActionRow["kind"], payload: Record<string, unknown>): Promise<PendingActionRow>;
  /**
   * The turn's agent may only reach a list of addresses (docs/design/agents.md §7.2): a tool that changes or cancels
   * an existing event first looks up who that reaches (`current_attendees` in the payload) so the guard can check it.
   */
  checksRecipients?: boolean;
  /** see OnlineMeetingCheck; absent → no check before the draft */
  onlineMeetingCheck?: OnlineMeetingCheck;
}

export interface Tool extends ToolDefinition {
  /** `true` when the tool only reads (no approval UI needed) */
  readOnly: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const str = (description: string) => ({ type: "string", description });

/**
 * `online_meeting` on the tools that create a meeting: the provider adds the join link (Teams on Microsoft 365,
 * Google Meet on Google) and sends it with the invitation. Shared with gcal_create_event (lib/google/tools.ts).
 * Set only when the user asks for an online meeting or says plainly that it is remote: a link nobody asked for goes out
 * to every attendee. A city or a country is not a request (a client from Haifa may come to the office); "שיחה" alone is
 * a phone call.
 */
export const onlineMeetingField = (service: string) => ({
  type: "boolean",
  description: `true כשמבקשים פגישה מקוונת (Teams/טימס, Meet/מיט, Zoom/זום, וידאו, "אונליין", "קישור לפגישה"), או כשהמשתמש אומר במפורש שהפגישה מרחוק ("נדבר מרחוק", "לא יגיע פיזית"). הקישור (${service}) נוצר אוטומטית ונשלח בהזמנה. false לפגישה פרונטלית, ל"שיחה" לבדה (בדרך כלל טלפון) וכשלא ברור. משתתף מעיר אחרת או מחו״ל אינו בקשה לקישור: לשאול שאלה קצרה אחת (למשל "להוסיף פגישת Teams?" ביומן Microsoft, "להוסיף פגישת Google Meet?" ביומן Google).`,
});

/** `online_meeting` on update_event / gcal_update_event: add a link to a meeting that has none (Graph cannot remove one later). */
export const onlineMeetingUpdateField = (service: string) => ({
  type: "boolean",
  description: `true רק כשמבקשים להוסיף קישור ${service} לפגישה שאין לה join_url ושהמשתמש ארגן (organizer_is_me). הזזה או שינוי של פגישה מקוונת קיימת: false.`,
});

/** Tool results of an update_event / gcal_update_event link request that needs no draft. */
export const alreadyOnline = (joinUrl: string | null) => ({
  status: "already_online",
  ...(joinUrl ? { join_url: joinUrl } : {}),
  note: "לפגישה כבר יש פגישה מקוונת, ולא נוצרה טיוטה. לומר זאת במשפט קצר; אם יש join_url, להוסיף שורה \"קישור לפגישה: \" ואחריה הקישור כלשונו.",
});
export const NOT_ORGANIZER = { status: "error", error: "not_organizer", note: "רק מי שארגן את הפגישה יכול להוסיף לה קישור, ולכן לא נוצרה טיוטה. לומר זאת למשתמש במשפט קצר." } as const;
/** Tool result of a link request on an account known to lack the service (checked before the draft): no draft. */
export const onlineUnavailableResult = (provider: OnlineMeetingProvider, personal: boolean) => ({
  status: "error",
  error: "online_unavailable",
  personal,
  note: `${copy["act.cal.online_unavailable"](provider, personal)} לא נוצרה טיוטה. לומר זאת במשפט קצר; אם ביקשו גם שינוי אחר בפגישה, להציע לבצע אותו בלי קישור.`,
});

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
  description: "מכין פגישה חדשה ביומן ומעביר לאישור המשתמש. לא יוצר בפועל. להשתמש כשמבקשים לקבוע פגישה, גם פגישה מקוונת (online_meeting).",
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
      online_meeting: onlineMeetingField("Teams ב-Microsoft 365, Google Meet ב-Google"),
    },
    required: ["title", "date", "start", "end", "location", "attendees", "online_meeting"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const payload: Record<string, unknown> = {
      title: String(input.title ?? ""),
      date: String(input.date ?? ""),
      start: String(input.start ?? ""),
      end: String(input.end ?? ""),
      location: String(input.location ?? ""),
      attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : [],
    };
    if (input.online_meeting !== true) {
      const pending = await ctx.createPending("create_event", payload);
      return { status: "pending_approval", pending_action_id: pending.id, note: "הפרטים מוצגים למשתמש עם כפתורי קבע/ערוך/בטל. ענה במשפט קצר בלבד." };
    }
    // the draft names the service ("Teams" / "Google Meet"): pin the calendar now, so the approved meeting is the one shown
    const provider = await providerForAction(ctx.db, { user_id: ctx.userId, payload });
    const check = ctx.onlineMeetingCheck ? await ctx.onlineMeetingCheck(provider).catch(() => null) : null;
    if (check && !check.available) {
      // known before the press (a personal Microsoft account, a work account without Teams): the same meeting without
      // a link, saying why, instead of a Teams draft that is certain to fail after the press
      const pending = await ctx.createPending("create_event", { ...payload, provider, online_fallback: provider, ...(check.personal ? { online_personal: true } : {}) });
      return { status: "pending_approval", pending_action_id: pending.id, online_meeting: "unavailable", note: `${copy["act.cal.online_unavailable"](provider, check.personal)} הטיוטה מוצגת בלי קישור, עם כפתורי אישור. לומר זאת במשפט קצר בלבד.` };
    }
    const pending = await ctx.createPending("create_event", { ...payload, online_meeting: true, provider });
    const service = onlineService(provider);
    return { status: "pending_approval", pending_action_id: pending.id, online_service: service, note: `הפרטים מוצגים למשתמש עם כפתורי קבע/ערוך/בטל. ענה במשפט קצר בלבד, ולציין בו שתיווצר פגישת ${service}.` };
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
      await rescheduleMorningSummary(ctx.db, ctx.userId, ctx.now);
      return { status: "done", morning_summary: "off" };
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { status: "error", error: "פורמט שעה לא תקין (HH:MM)" };
    await ctx.db.updateUserProfile(ctx.userId, { morning_time: time });
    await ctx.db.mergeUserProfile(ctx.userId, { morning_summary_enabled: true });
    await rescheduleMorningSummary(ctx.db, ctx.userId, ctx.now);
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
export const BASE_TOOLS: Tool[] = [draftEmailTool, createEventTool, setMorningTimeTool, rememberFactTool, ...REMINDER_TOOLS];

export function toolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
