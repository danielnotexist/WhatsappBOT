import { copy, buttons } from "@/lib/copy/bot";
import type { PendingActionRow } from "@/lib/db/types";
import type { BotContext } from "./context";

/** Executes an approved action against the real system (Graph / Google). Registered by later milestones. */
export type ActionExecutor = (action: PendingActionRow, ctx: BotContext) => Promise<{ ok: true; message: string } | { ok: false; message: string; retryable?: boolean }>;

const executors = new Map<string, ActionExecutor>();

export function registerExecutor(kind: PendingActionRow["kind"], fn: ActionExecutor): void {
  executors.set(kind, fn);
}
export function clearExecutorsForTests(): void {
  executors.clear();
}

/** Renders a freshly created pending action with its approval buttons (PLAN §1: שלח / ערוך / בטל). */
export async function presentPendingAction(ctx: BotContext, to: string, action: PendingActionRow): Promise<void> {
  const p = action.payload as Record<string, string>;
  if (action.kind === "send_mail") {
    await ctx.wa.sendButtons(to, copy["act.mail.draft"]({ toName: p.to_name ?? "", toEmail: p.to_email ?? "", subject: p.subject ?? "", body: p.body ?? "" }), buttons.approve(action.id, "שלח"));
  } else if (action.kind === "create_event") {
    await ctx.wa.sendButtons(
      to,
      copy["act.cal.create_confirm"]({ title: p.title ?? "", date: formatDateHe(p.date ?? ""), start: p.start ?? "", end: p.end ?? "", location: p.location || undefined, attendees: Array.isArray(action.payload.attendees) && (action.payload.attendees as string[]).length ? (action.payload.attendees as string[]).join(", ") : undefined }),
      buttons.approve(action.id, "קבע"),
    );
  } else {
    await ctx.wa.sendButtons(to, `*פעולה ממתינה לאישור*\n${JSON.stringify(action.payload)}`, buttons.approve(action.id, "אשר"));
  }
}

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export function formatDateHe(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `יום ${DAYS[d.getUTCDay()]} ${Number(m[3])}.${Number(m[2])}`;
}

export function parseButtonId(id: string): { verb: "approve" | "edit" | "cancel"; actionId: string } | null {
  const m = id.match(/^pa:(approve|edit|cancel):([0-9a-f-]{36})$/);
  return m ? { verb: m[1] as "approve" | "edit" | "cancel", actionId: m[2]! } : null;
}

/**
 * Button press on a pending action. Only the owner, only while pending, only within 10 minutes (PLAN §2.3);
 * approval records the message id of the press and is audited.
 */
export async function handlePendingButton(ctx: BotContext, userId: string, to: string, buttonId: string, waMessageId: string): Promise<boolean> {
  const parsed = parseButtonId(buttonId);
  if (!parsed) return false;
  const action = await ctx.db.getPendingAction(parsed.actionId);
  if (!action || action.user_id !== userId) {
    await ctx.wa.sendText(to, copy["act.pending_expired"]());
    return true;
  }
  if (action.status !== "pending" || Date.parse(action.expires_at) <= ctx.now().getTime()) {
    if (action.status === "pending") await ctx.db.updatePendingAction(action.id, { status: "expired" });
    await ctx.wa.sendText(to, copy["act.pending_expired"]());
    return true;
  }

  if (parsed.verb === "cancel") {
    await ctx.db.updatePendingAction(action.id, { status: "cancelled" });
    await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.cancel`, target: action.id, result: "cancelled" });
    await ctx.wa.sendText(to, copy["act.mail.cancelled"]());
    return true;
  }
  if (parsed.verb === "edit") {
    await ctx.db.updatePendingAction(action.id, { status: "edited" });
    await ctx.db.mergeUserProfile(userId, { editing_action: action.id });
    await ctx.wa.sendText(to, copy["act.mail.edit_prompt"]());
    return true;
  }

  await ctx.db.updatePendingAction(action.id, { status: "approved", approved_msg_id: waMessageId });
  const executor = executors.get(action.kind);
  if (!executor) {
    await ctx.db.updatePendingAction(action.id, { status: "failed", error: "no executor (connection not available yet)" });
    await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.execute`, target: action.id, approved_by_msg_id: waMessageId, result: "no_executor" });
    await ctx.wa.sendText(to, copy["err.not_connected"]());
    return true;
  }
  const result = await executor(action, ctx);
  await ctx.db.updatePendingAction(action.id, result.ok ? { status: "executed", executed_at: ctx.now().toISOString() } : { status: "failed", error: result.message });
  await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.execute`, target: action.id, approved_by_msg_id: waMessageId, result: result.ok ? "ok" : "failed" });
  await ctx.wa.sendText(to, result.message);
  return true;
}
