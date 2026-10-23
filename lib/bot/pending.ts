import { guardAgentAction } from "@/lib/agents/guard";
import { findAgentByKey } from "@/lib/agents/policy";
import { loadAgents } from "@/lib/agents/service";
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
  /** sent instead of the draft when the agent that prepared the original may not prepare it (its list, its daily cap) */
  refusedMessage: string;
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; retryable?: boolean; offer?: FollowUpDraft };

/** Executes an approved action against the real system (Graph / Google). Registered by later milestones. */
export type ActionExecutor = (action: PendingActionRow, ctx: BotContext) => Promise<ActionResult>;

const EVENT_CHANGE_FIELDS = ["subject", "date", "start", "end", "location"] as const;
const ONLINE_KEYS = new Set(["online_meeting", "online_fallback", "online_personal"]);

/**
 * The account cannot create the requested online meeting (no Teams on this Microsoft account, or Google refused the
 * Meet). Nothing was created or changed. The same meeting without a link is offered as a new draft, so it happens
 * only if the user approves that draft; a change that only asked for the link has nothing left to offer.
 * `personal`: a personal Microsoft account, the one case the reason ("work or school account only") is known.
 */
export function onlineMeetingUnavailable(action: PendingActionRow, provider: OnlineMeetingProvider, opts: { personal?: boolean } = {}): ActionResult {
  const isUpdate = action.kind === "update_event";
  const rest = Object.fromEntries(Object.entries(action.payload).filter(([k]) => !ONLINE_KEYS.has(k)));
  const somethingLeft = !isUpdate || EVENT_CHANGE_FIELDS.some((k) => String(action.payload[k] ?? "").trim());
  const personal = Boolean(opts.personal);
  const how = { isUpdate, personal, somethingLeft };
  const offer: FollowUpDraft = {
    kind: action.kind,
    payload: { ...rest, provider, online_fallback: provider, ...(personal ? { online_personal: true } : {}) },
    refusedMessage: copy["act.cal.online_not_done"](provider, { ...how, askMain: true }),
  };
  return { ok: false, message: copy["act.cal.online_not_done"](provider, how), ...(somethingLeft ? { offer } : {}) };
}

const fallbackOf = (payload: Record<string, unknown>): OnlineMeetingProvider | null => (payload.online_fallback === "microsoft" || payload.online_fallback === "google" ? payload.online_fallback : null);

/** The calendar a draft that asks for an online meeting will run on (its service is named in the draft), or null. */
async function onlineProvider(ctx: BotContext, action: PendingActionRow): Promise<OnlineMeetingProvider | null> {
  return action.payload.online_meeting === true ? providerForAction(ctx.db, action) : null;
}

/** The fallback draft opens with why the link could not be created. */
const withFallbackNote = (fallback: OnlineMeetingProvider | null, payload: Record<string, unknown>, draft: string) =>
  fallback ? `${copy["act.cal.online_unavailable"](fallback, payload.online_personal === true)}\n\n${draft}` : draft;

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
    const online = await onlineProvider(ctx, action);
    const attendees = Array.isArray(action.payload.attendees) ? (action.payload.attendees as unknown[]).map(String).filter(Boolean) : [];
    const draft = copy["act.cal.create_confirm"]({
      title: p.title ?? "",
      date: formatDateHe(p.date ?? ""),
      start: p.start ?? "",
      end: p.end ?? "",
      location: p.location || undefined,
      attendees: attendees.length ? attendees.join(", ") : undefined,
      online: online ? copy["act.cal.online_label"](online, attendees.length > 0) : undefined,
      withoutLink: Boolean(fallback),
    });
    await send(withFallbackNote(fallback, action.payload, draft), buttons.approve(action.id, fallback ? "קבע בלי קישור" : "קבע"));
  } else if (action.kind === "update_event") {
    const fallback = fallbackOf(action.payload);
    const online = await onlineProvider(ctx, action);
    const moves = Boolean(p.date || p.start || p.end);
    // which meeting it is (read by the tool when the draft was made), then what changes and who hears about it
    const target = typeof p.current_subject === "string" ? copy["act.cal.update_target"](p.current_subject, formatDateHe(p.current_date ?? ""), p.current_start ?? "") : "";
    const changes = [p.date ? `תאריך: ${formatDateHe(p.date)}` : "", p.start || p.end ? `שעה: ${p.start || "—"}–${p.end || "—"}` : "", p.subject ? `כותרת: ${p.subject}` : "", p.location ? `מקום: ${p.location}` : "", online ? copy["act.cal.add_online"](online) : ""].filter(Boolean);
    const notified = changes.length && Number(action.payload.current_attendee_count) > 0 ? copy["act.cal.attendees_notified"](Boolean(online)) : "";
    const [ask, approve] = fallback ? ["לעדכן בלי קישור?", "עדכן בלי קישור"] : moves ? ["להזיז?", "הזז"] : ["לעדכן?", "עדכן"];
    const draft = ["*שינוי פגישה*", target, changes.join("\n") || "(אין שינויים)", notified, ask].filter(Boolean).join("\n");
    await send(withFallbackNote(fallback, action.payload, draft), buttons.approve(action.id, approve));
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
  const offer = !result.ok ? result.offer : undefined;
  const next = offer ? await createFollowUp(ctx, action, offer) : null;
  if (next && "row" in next) await presentPendingAction(ctx, to, next.row);
  else await ctx.wa.sendText(to, next && offer ? offer.refusedMessage : result.message);
  return true;
}

/**
 * The follow-up draft keeps who prepared the original (the header and the audit); it is a new pending action with
 * its own 10 minutes. A draft of an agent passes the same guard as any draft it prepares (guardAgentAction: its
 * recipient list as it is now, its daily cap; the failed original no longer counts) and the agent must still be
 * active. When the agent may not prepare it, `refused`: the user is pointed to the main assistant instead. When it
 * cannot be stored at all, null: the plain failure message.
 */
async function createFollowUp(ctx: BotContext, action: PendingActionRow, offer: FollowUpDraft): Promise<{ row: PendingActionRow } | { refused: true } | null> {
  const now = ctx.now();
  try {
    let meta: { agentKey: AgentKey; agentName: string } | undefined;
    if (action.agent_key) {
      const [{ agents }, user] = await Promise.all([loadAgents(ctx.db, action.user_id, now), ctx.db.getUser(action.user_id)]);
      const agent = findAgentByKey(agents, action.agent_key);
      if (!agent || agent.status !== "active") return { refused: true };
      if (await guardAgentAction(ctx.db, action.user_id, agent, offer.kind, offer.payload, now, user?.timezone)) return { refused: true };
      meta = { agentKey: agent.key, agentName: agent.name };
    }
    return { row: await ctx.db.createPendingAction(action.user_id, offer.kind, offer.payload, new Date(now.getTime() + PENDING_TTL_MS), meta) };
  } catch (e) {
    console.warn(`[pending] follow-up draft for ${action.id} not created:`, (e as Error).message);
    // the database's own daily cap (two messages at once) is the agent's limit too
    return action.agent_key ? { refused: true } : null;
  }
}
