import { PRODUCT_NAME } from "@/lib/brand";
import type { Db, PendingActionKind } from "@/lib/db/types";
import { DEFAULT_TZ, localDateOf, zonedToUtc } from "@/lib/time/zoned";
import { maxOutboundPerDay, type ResolvedAgent } from "./policy";

/**
 * Narrowing an agent's outbound drafts (docs/design/agents.md §7.2) — runs before a pending action is created, so a
 * refused draft never exists. It cannot widen anything: approval by button is structural (I1), not a permission.
 *   - recipients: when the agent has a list, every recipient of the draft must be on it (an empty recipient too).
 *     Mail and forwards: to + cc. A new meeting: its attendees. A change or a cancellation of an existing meeting
 *     notifies the people already on it: the tool looks them up (`current_attendees`, ToolContext.checksRecipients),
 *     and when they are unknown the draft is refused rather than guessed.
 *   - max_outbound_per_day (default 10): drafts this agent prepared since local midnight in the user's zone. The caller
 *     runs this check and the insert one draft at a time (runAssistant), and the database enforces the same cap
 *     atomically (trigger enforce_agent_daily_cap, 0006) for messages processed at the same time.
 * Returns the error the tool hands back to the model (which explains it to the user), or null.
 */
export async function guardAgentAction(
  db: Db,
  userId: string,
  agent: ResolvedAgent,
  kind: PendingActionKind,
  payload: Record<string, unknown>,
  now: Date,
  timeZone: string = DEFAULT_TZ,
): Promise<string | null> {
  const allowed = agent.permissions.recipients ?? [];
  if (allowed.length) {
    const recipients = recipientsOf(kind, payload);
    const needsOne = kind === "send_mail" || kind === "forward_mail";
    if (needsOne && !recipients.length) return `חסרה כתובת נמען. הסוכן ״${agent.name}״ מוגבל לכתובות: ${allowed.join(", ")}. לא נוצרה טיוטה.`;
    if ((kind === "update_event" || kind === "delete_event") && !Array.isArray(payload.current_attendees)) {
      return `לא הצלחתי לבדוק מי משתתף באירוע, ולכן לא נוצרה טיוטה: הסוכן ״${agent.name}״ מוגבל לכתובות ${allowed.join(", ")}. אפשר לפנות ל-״@${PRODUCT_NAME}״.`;
    }
    const outside = recipients.filter((r) => !allowed.includes(r));
    if (outside.length) return `הנמען ${outside.join(", ")} לא ברשימה המותרת לסוכן ״${agent.name}״ (${allowed.join(", ")}). לא נוצרה טיוטה — אפשר לעדכן את הרשימה באזור האישי, או לפנות ל-״@${PRODUCT_NAME}״.`;
  }
  const cap = maxOutboundPerDay(agent.permissions);
  const used = await db.countAgentActionsSince(userId, agent.key, localDayStart(now, timeZone));
  if (used >= cap) return dailyCapMessage(agent.name, cap);
  return null;
}

/** Local midnight in the user's zone — the daily cap counts from here (the SQL trigger uses the same boundary). */
export function localDayStart(now: Date, timeZone: string = DEFAULT_TZ): Date {
  return zonedToUtc({ ...localDateOf(now, timeZone), hour: 0, minute: 0 }, timeZone);
}

/** What the tool hands back to the model when the cap is reached (by this guard, or by the database trigger in a race). */
export function dailyCapMessage(agentName: string, cap: number): string {
  return `הסוכן ״${agentName}״ הגיע לתקרה היומית (${cap} פעולות יוצאות). לא נוצרה טיוטה; התקרה מתאפסת בחצות.`;
}

const split = (v: unknown) =>
  String(v ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

const list = (v: unknown) => (Array.isArray(v) ? v.flatMap(split) : []);

/**
 * Who a draft would reach: mail and forward → to + cc; a new meeting → its attendees; a change or a cancellation →
 * the people already on the event (`current_attendees`, looked up by the tool) and any attendee the change adds.
 */
export function recipientsOf(kind: PendingActionKind, payload: Record<string, unknown>): string[] {
  if (kind === "send_mail" || kind === "forward_mail") return [...new Set([...split(payload.to_email), ...split(payload.cc)])];
  if (kind === "create_event") return [...new Set(list(payload.attendees))];
  if (kind === "update_event" || kind === "delete_event") return [...new Set([...list(payload.current_attendees), ...list(payload.attendees)])];
  return [];
}
