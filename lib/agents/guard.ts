import { PRODUCT_NAME } from "@/lib/brand";
import type { Db, PendingActionKind } from "@/lib/db/types";
import { DEFAULT_TZ, localDateOf, zonedToUtc } from "@/lib/time/zoned";
import { maxOutboundPerDay, type ResolvedAgent } from "./policy";

/**
 * Narrowing an agent's outbound drafts (docs/design/agents.md §7.2) — runs before a pending action is created, so a
 * refused draft never exists. It cannot widen anything: approval by button is structural (I1), not a permission.
 *   - recipients: when the agent has a list, every recipient of the draft must be on it (an empty recipient too).
 *   - max_outbound_per_day (default 10): drafts this agent prepared since local midnight in the user's zone.
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
    const outside = recipients.filter((r) => !allowed.includes(r));
    if (outside.length) return `הנמען ${outside.join(", ")} לא ברשימה המותרת לסוכן ״${agent.name}״ (${allowed.join(", ")}). לא נוצרה טיוטה — אפשר לעדכן את הרשימה באזור האישי, או לפנות ל-״@${PRODUCT_NAME}״.`;
  }
  const cap = maxOutboundPerDay(agent.permissions);
  const today = localDateOf(now, timeZone);
  const since = zonedToUtc({ ...today, hour: 0, minute: 0 }, timeZone);
  const used = await db.countAgentActionsSince(userId, agent.key, since);
  if (used >= cap) return `הסוכן ״${agent.name}״ הגיע לתקרה היומית (${cap} פעולות יוצאות). לא נוצרה טיוטה; התקרה מתאפסת בחצות.`;
  return null;
}

const split = (v: unknown) =>
  String(v ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Who a draft would reach: mail and forward → to + cc; meetings → attendees. */
export function recipientsOf(kind: PendingActionKind, payload: Record<string, unknown>): string[] {
  if (kind === "send_mail" || kind === "forward_mail") return [...new Set([...split(payload.to_email), ...split(payload.cc)])];
  if (kind === "create_event" || kind === "update_event") return Array.isArray(payload.attendees) ? [...new Set(payload.attendees.flatMap(split))] : [];
  return [];
}
