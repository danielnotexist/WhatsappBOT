import type { Tool } from "@/lib/ai/tools";
import { mcopy } from "@/lib/copy/bot-meetings";
import type { UserRow } from "@/lib/db/types";
import { DEFAULT_TZ } from "@/lib/time/zoned";
import { listOnlineMeetings, meetingWhenOf, queueMeetingSummary, readableHere } from "./jobs";
import type { MeetingRef } from "./meeting";
import type { MeetingWorkspace } from "./workspace";

/**
 * "סיכום של הפגישה האחרונה" / "תסכמי את הפגישה עם כהן" (pro; the orchestrator gates the tool by name too —
 * lib/ai/plan-tools.ts). The tool finds the meeting (online, ended in the last 14 days — or still going today), queues
 * the same `meeting_summary` job the automatic summaries use, marked `on_demand` (it runs at once, skips the quiet
 * hours and explains when there is no transcript), and returns the line to say. The summary itself arrives as its own
 * message with the action buttons a minute or two later. Internal: nothing goes to anyone else, so no approval.
 */
export const MEETING_SUMMARY_TOOL = "meeting_summary";
const LOOKBACK_MS = 14 * 86_400_000;
const REPLY_NOTE = "לענות למשתמש בנוסח שב-reply, בלי להוסיף.";

const norm = (s: string) => s.toLowerCase().replace(/[״"׳']/g, "").trim();

/** The best meeting for a query: its title, or an attendee's name or address, holds every word of it. Newest end first. */
export function matchMeeting(meetings: readonly MeetingRef[], query: string): MeetingRef | null {
  const words = norm(query)
    .split(/\s+/)
    // "הבנק" → "בנק", "וכהן" → "כהן" (a shorter word still matches where the full one would)
    .map((w) => w.replace(/^(?:ה|ו)(?=[א-ת]{3,})/, ""))
    .filter((w) => w.length >= 2 && !["פגישה", "הפגישה", "פגישת", "עם", "של", "האחרונה", "אחרונה", "meeting", "with"].includes(w));
  if (!words.length) return meetings[0] ?? null;
  return (
    meetings.find((m) => {
      const hay = norm([m.title, ...m.attendees.flatMap((a) => [a.name, a.email])].join(" "));
      return words.every((w) => hay.includes(w));
    }) ?? null
  );
}

export function meetingSummaryTool(deps: { workspace: MeetingWorkspace; user: UserRow }): Tool {
  const tz = deps.user.timezone || DEFAULT_TZ;
  return {
    name: MEETING_SUMMARY_TOOL,
    description:
      "סיכום של פגישת Teams או Google Meet מהתמליל שהפלטפורמה שמרה (בלי בוט בפגישה): מכין את הסיכום (החלטות, משימות, שאלות פתוחות) ושולח אותו בהודעה נפרדת עם כפתורים — מייל סיכום למשתתפים, מסמך משימות, משימות ברשימה. להשתמש כשמבקשים סיכום של פגישה (\"סיכום של הפגישה האחרונה\", \"תסכמי את הפגישה עם כהן\"). Zoom עוד לא נתמך.",
    readOnly: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "שם הפגישה או שם / מייל של משתתף (\"כהן\"), או ריק לפגישה האחרונה" } },
      required: ["query"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const query = String(input.query ?? "").trim().slice(0, 100);
      const found = await listOnlineMeetings(deps.workspace, deps.user, new Date(ctx.now.getTime() - LOOKBACK_MS), new Date(ctx.now.getTime() + 3_600_000));
      // ended ones first (newest end first), then one still going
      const started = found.meetings.filter((m) => m.startMs <= ctx.now.getTime());
      const ended = started.filter((m) => m.endMs <= ctx.now.getTime());
      const m = matchMeeting(ended, query) ?? matchMeeting(started, query);
      if (!m) return { status: "not_found", reply: mcopy["mt.not_found"](query), note: REPLY_NOTE };
      const title = m.title || "(ללא כותרת)";
      if (m.platform === "zoom") return { status: "unsupported", reply: mcopy["mt.zoom_soon"](), note: REPLY_NOTE };
      if (!readableHere(m)) return { status: "unsupported", reply: mcopy["mt.other_platform"](), note: REPLY_NOTE };
      await queueMeetingSummary(ctx.db, deps.user, m, ctx.now, { onDemand: true });
      await ctx.db.addAudit({ user_id: deps.user.id, action: "meeting.summary.ask", target: m.platform, result: "queued" });
      if (m.endMs > ctx.now.getTime()) return { status: "queued_after_end", reply: mcopy["mt.not_ended"](title), note: REPLY_NOTE };
      return { status: "queued", reply: mcopy["mt.queued"](title, meetingWhenOf(m, tz)), note: REPLY_NOTE };
    },
  };
}
