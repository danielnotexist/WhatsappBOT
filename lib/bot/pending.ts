import { PENDING_TTL_MS } from "@/lib/ai/orchestrator";
import { copy, buttons } from "@/lib/copy/bot";
import { acopy, agentButtons } from "@/lib/copy/bot-agents";
import type { AgentKey, PendingActionKind, PendingActionRow } from "@/lib/db/types";
import { providerForAction } from "@/lib/google/dispatch";
import type { OnlineMeetingProvider } from "@/lib/online-meeting";
import type { ReplyButton } from "@/lib/wa/types";
import type { BotContext } from "./context";

/**
 * A new draft offered instead of a failed action (after the press, nothing executed). Today: the same meeting without
 * an online meeting link when the account cannot create Teams / Meet. It goes through the same approval buttons.
 */
export interface FollowUpDraft {
  kind: PendingActionKind;
  payload: Record<string, unknown>;
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; retryable?: boolean; offer?: FollowUpDraft };

/** Executes an approved action against the real system (Graph / Google). Registered by later milestones. */
export type ActionExecutor = (action: PendingActionRow, ctx: BotContext) => Promise<ActionResult>;

const EVENT_CHANGE_FIELDS = ["subject", "date", "start", "end", "location"] as const;

/**
 * The account cannot create the requested online meeting (a personal Microsoft account has no Teams, or Google
 * refused the Meet). Nothing was created or changed. The same meeting without a link is offered as a new draft, so it
 * happens only if the user approves that draft; a change that only asked for the link has nothing left to offer.
 */
export function onlineMeetingUnavailable(action: PendingActionRow, provider: OnlineMeetingProvider): ActionResult {
  const isUpdate = action.kind === "update_event";
  const rest = Object.fromEntries(Object.entries(action.payload).filter(([k]) => k !== "online_meeting" && k !== "online_fallback"));
  const somethingLeft = !isUpdate || EVENT_CHANGE_FIELDS.some((k) => String(action.payload[k] ?? "").trim());
  return {
    ok: false,
    message: copy["act.cal.online_not_done"](provider, isUpdate),
    ...(somethingLeft ? { offer: { kind: action.kind, payload: { ...rest, provider, online_fallback: provider } } } : {}),
  };
}

const fallbackOf = (payload: Record<string, unknown>): OnlineMeetingProvider | null => (payload.online_fallback === "microsoft" || payload.online_fallback === "google" ? payload.online_fallback : null);

/** "פגישת Teams" / "פגישת Google Meet" for a draft that asks for an online meeting, by the provider it will run on. */
async function onlineLabel(ctx: BotContext, action: PendingActionRow): Promise<string | undefined> {
  if (action.payload.online_meeting !== true) return undefined;
  return copy["act.cal.online_label"](await providerForAction(ctx.db, action));
}

const executors = new Map<string, ActionExecutor>();

export function registerExecutor(kind: PendingActionRow["kind"], fn: ActionExecutor): void {
  executors.set(kind, fn);
}
export function clearExecutorsForTests(): void {
  executors.clear();
}

/**
 * Renders a freshly created pending action with its approval buttons (PLAN §1: שלח / ערוך / בטל). A draft an agent
 * prepared opens with the agent's header (docs/design/agents.md §5.5) — the user always knows who prepared it.
 */
export async function presentPendingAction(ctx: BotContext, to: string, action: PendingActionRow): Promise<void> {
  const header = action.agent_name ? `${acopy["agent.reply_header"](action.agent_name)}\n` : "";
  const send = (body: string, b: ReplyButton[]) => ctx.wa.sendButtons(to, `${header}${body}`, b);
  const p = action.payload as Record<string, string>;
  if (action.kind === "forward_mail") {
    const attachments = Array.isArray(action.payload.attachments) ? (action.payload.attachments as unknown[]).map(String) : [];
    await send(acopy["act.mail.forward_confirm"]({ subject: p.subject ?? "", from: p.from ?? "", attachments, to: p.to_email ?? "", comment: p.comment ?? "" }), agentButtons.forward(action.id));
  } else if (action.kind === "send_mail") {
    await send(copy["act.mail.draft"]({ toName: p.to_name ?? "", toEmail: p.to_email ?? "", subject: p.subject ?? "", body: p.body ?? "", cc: p.cc || undefined, attachment: p.attachment_name || undefined }), buttons.approve(action.id, "שלח"));
  } else if (action.kind === "create_event") {
    const fallback = fallbackOf(action.payload);
    const draft = copy["act.cal.create_confirm"]({
      title: p.title ?? "",
      date: formatDateHe(p.date ?? ""),
      start: p.start ?? "",
      end: p.end ?? "",
      location: p.location || undefined,
      attendees: Array.isArray(action.payload.attendees) && (action.payload.attendees as string[]).length ? (action.payload.attendees as string[]).join(", ") : undefined,
      online: await onlineLabel(ctx, action),
      withoutLink: Boolean(fallback),
    });
    await send(fallback ? `${copy["act.cal.online_unavailable"](fallback)}\n\n${draft}` : draft, buttons.approve(action.id, fallback ? "קבע בלי קישור" : "קבע"));
  } else if (action.kind === "update_event") {
    const fallback = fallbackOf(action.payload);
    const online = await onlineLabel(ctx, action);
    const moves = Boolean(p.date || p.start || p.end);
    const changes = [p.date ? `תאריך: ${formatDateHe(p.date)}` : "", p.start || p.end ? `שעה: ${p.start || "—"}–${p.end || "—"}` : "", p.subject ? `כותרת: ${p.subject}` : "", p.location ? `מקום: ${p.location}` : "", online ? `הוספת ${online}` : ""].filter(Boolean).join("\n");
    // adding a link without moving the meeting is an update, not a move
    const [ask, approve] = fallback ? ["לעדכן בלי קישור?", "עדכן בלי קישור"] : online && !moves ? ["לעדכן?", "עדכן"] : ["להזיז?", "הזז"];
    const draft = `*שינוי פגישה*\n${changes || "(אין שינויים)"}\n${ask}`;
    await send(fallback ? `${copy["act.cal.online_unavailable"](fallback)}\n\n${draft}` : draft, buttons.approve(action.id, approve));
  } else if (action.kind === "delete_event") {
    await send(copy["act.cal.cancel_confirm"](p.subject ?? "", "", ""), [
      { id: `pa:approve:${action.id}`, title: "בטל פגישה" },
      { id: `pa:cancel:${action.id}`, title: "השאר" },
    ]);
  } else {
    await send(`*פעולה ממתינה לאישור*\n${JSON.stringify(action.payload)}`, buttons.approve(action.id, "אשר"));
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

/** Audit attribution of a pending action: which agent prepared it (docs/design/agents.md §7.4). */
function attribution(action: PendingActionRow) {
  return { pending_action_id: action.id, agent_key: action.agent_key, agent_name: action.agent_name };
}

/**
 * Button press on a pending action. Only the owner, only while pending, only within 10 minutes (PLAN §2.3);
 * approval records the message id of the press and is audited. This is the only place an action executes — the same
 * for an agent's draft: an agent's permissions can only narrow what it drafts, never skip this step (I1).
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
    await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.cancel`, target: action.id, result: "cancelled", ...attribution(action) });
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
    await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.execute`, target: action.id, approved_by_msg_id: waMessageId, result: "no_executor", ...attribution(action) });
    await ctx.wa.sendText(to, copy["err.not_connected"]());
    return true;
  }
  const result = await executor(action, ctx);
  await ctx.db.updatePendingAction(action.id, result.ok ? { status: "executed", executed_at: ctx.now().toISOString() } : { status: "failed", error: result.message });
  await ctx.db.addAudit({ user_id: userId, action: `${action.kind}.execute`, target: action.id, approved_by_msg_id: waMessageId, result: result.ok ? "ok" : "failed", ...attribution(action) });
  const next = !result.ok && result.offer ? await createFollowUp(ctx, action, result.offer) : null;
  if (next) await presentPendingAction(ctx, to, next);
  else await ctx.wa.sendText(to, result.message);
  return true;
}

/**
 * The follow-up draft keeps who prepared the original (the header and the audit); it is a new pending action with
 * its own 10 minutes. When it cannot be created (an agent at its daily cap) the plain failure message is sent instead.
 */
async function createFollowUp(ctx: BotContext, action: PendingActionRow, offer: FollowUpDraft): Promise<PendingActionRow | null> {
  const meta = action.agent_key && action.agent_name ? { agentKey: action.agent_key as AgentKey, agentName: action.agent_name } : undefined;
  try {
    return await ctx.db.createPendingAction(action.user_id, offer.kind, offer.payload, new Date(ctx.now().getTime() + PENDING_TTL_MS), meta);
  } catch (e) {
    console.warn(`[pending] follow-up draft for ${action.id} not created:`, (e as Error).message);
    return null;
  }
}
