import { touchLastSeen } from "@/lib/admin/activity";
import { reportError } from "@/lib/errors/report";
import { agentDraftAwaitsText, handleAgentMessage, startAgentCreation, updateStickyAfterTurn } from "@/lib/agents/commands";
import { accountContextOf } from "@/lib/ai/account-context";
import { BudgetExceededError, type SpendBlock, type SpendTurn } from "@/lib/ai/budget";
import { maybeSummarize } from "@/lib/ai/memory";
import { runAssistant } from "@/lib/ai/orchestrator";
import { AiProviderError } from "@/lib/ai/types";
import { payLinkFor } from "@/lib/billing/pay-link";
import { connectionsInForce, isPaidPlan, mayConnect, primaryProvider } from "@/lib/billing/plans";
import { copy } from "@/lib/copy/bot";
import { scopy } from "@/lib/copy/bot-services";
import { acopy } from "@/lib/copy/bot-agents";
import { budgetReply, liveCopy } from "@/lib/copy/bot-live";
import type { MessageRow, MessageType, UserRow } from "@/lib/db/types";
import { handleReminderButton } from "@/lib/reminders/service";
import type { InboundMessage } from "@/lib/wa/types";
import { basicLimitReached, handleBillingPress, handleBillingText, pausedAccount, upgradeOffer } from "./billing";
import { connectLinkFor, type BotContext } from "./context";
import { handleUnlinkedPhone } from "./linking";
import { afterFirstTask, awaitingAnswer, handleOnboarding, onboardingOf } from "./onboarding";
import { handlePendingButton, presentPendingAction } from "./pending";
import { handleLoginKeyword } from "./login-link";
import { handleReferralKeyword } from "@/lib/referrals/commands";
import { transcribeVoiceNote } from "./voice";
import { connectRequestProvider, providerLabel, reconnectProviderFor } from "./connect-intent";
import { connectHeadsUpSuffix } from "@/lib/google/user-cap";
import { rtlLines } from "@/lib/wa/rtl";
import { handleAlertButton, handleAlertCommand } from "@/lib/proactive/actions";
import { handleMeetingButton, handleMeetingCommand } from "@/lib/meetings/actions";

const toDbType = (t: InboundMessage["type"]): MessageType =>
  t === "text" ? "text" : t === "audio" ? "audio" : t === "image" ? "image" : t === "document" ? "doc" : t === "button" || t === "list" || t === "template_button" ? "button" : "other";

const MEDIA_HE: Record<string, string> = { other: "סוג ההודעה הזה", audio: "הקלטות", image: "תמונות", document: "קבצים" };

/** WhatsApp's limit for the body of a reply-buttons message; a longer reply goes out as plain text. */
const MAX_BUTTON_BODY = 1024;

/**
 * The conversation pipeline for one inbound message (PLAN §2):
 * dedupe → identity → ✅ + typing → buttons / onboarding / counting → assistant → reply → memory.
 * Pure: everything comes through `ctx`, so the whole flow runs in tests with the in-memory stack.
 */
export async function processInbound(ctx: BotContext, msg: InboundMessage): Promise<{ handled: boolean; note?: string }> {
  const identity = await ctx.db.findWaIdentityByPhone(msg.fromE164);
  if (!identity) return handleUnlinkedPhone(ctx, msg);
  if (identity.status === "blocked") return { handled: true, note: "blocked identity" };

  const user = await ctx.db.getUser(identity.user_id);
  if (!user) return { handled: true, note: "identity without user" };
  const to = msg.fromE164;
  // paid model / STT calls of this message pass the spend guard (LIVE_AI demo, AI_DAILY_BUDGET_USD): each one is checked
  // before it is made and recorded after; the first one counts the message against the user's daily cap
  const spendTurn = ctx.spend ? ctx.spend.turn(user.id) : null;
  if (spendTurn) ctx = withSpendTurn(ctx, spendTurn);

  // 1. dedupe (unique wa_message_id) + store the inbound row
  const stored = await ctx.db.insertMessage({ user_id: user.id, wa_message_id: msg.waMessageId, direction: "in", type: toDbType(msg.type), text: msg.text, media_url: msg.mediaId ? `wa-media:${msg.mediaId}` : null });
  if (!stored) return { handled: true, note: "duplicate" };
  await touchLastSeen(ctx.db, user.id, ctx.now());

  const isButton = msg.type === "button" || msg.type === "list" || msg.type === "template_button";
  await ctx.wa.markRead(msg.waMessageId, { typing: true }).catch(() => undefined);
  // 👀 on the message while it is handled, "עלזה על זה…" if nothing was sent after a few seconds, ✅ once done
  const progress = startProgress(ctx, to, msg.waMessageId, isButton);
  let failed = false;
  try {
    return await afterStored(progress.ctx, msg, { user, to, stored, isButton, spendTurn });
  } catch (e) {
    // The inbound row is already stored, so a redelivery would only hit "duplicate": answering here is the only chance.
    // The error is recorded, the user is told it did not work (best effort) and gets no ✅.
    failed = true;
    await reportError("bot.inbound", e, { userId: user.id, db: ctx.db, context: { type: msg.type } });
    await progress.ctx.wa.sendText(to, copy["err.generic"]()).catch(() => undefined);
    return { handled: true, note: "failed" };
  } finally {
    await progress.done(failed);
  }
}

/** How long a message may go without any reply before "עלזה על זה…" is sent. */
export const PROGRESS_NOTE_AFTER_MS = 4_000;
/** The typing dots are shown again this often while no reply went out (WhatsApp clears them after ~25s). */
export const TYPING_REFRESH_MS = 20_000;

/**
 * The progress marks on an inbound message: the typing dots (markRead with typing, by the caller), a 👀 reaction right away (not on button presses, which have no bubble of
 * their own to react to in a useful way), a short "עלזה על זה…" when no reply went out within PROGRESS_NOTE_AFTER_MS
 * (not stored: it is not part of the conversation), and ✅ replacing the 👀 when the message is handled (the 👀 is removed
 * when handling failed). The returned
 * ctx notices every send, so a fast answer never gets the note.
 */
function startProgress(ctx: BotContext, to: string, waMessageId: string, isButton: boolean) {
  let replied = false;
  const sent = <T>(p: Promise<T>): Promise<T> => {
    replied = true;
    return p;
  };
  const wa = ctx.wa;
  const tracked: BotContext["wa"] = {
    ...wa,
    sendText: (...a) => sent(wa.sendText(...a)),
    sendButtons: (...a) => sent(wa.sendButtons(...a)),
    sendList: (...a) => sent(wa.sendList(...a)),
    sendImage: (...a) => sent(wa.sendImage(...a)),
    sendDocument: (...a) => sent(wa.sendDocument(...a)),
    sendTemplate: (...a) => sent(wa.sendTemplate(...a)),
    sendReaction: (...a) => wa.sendReaction(...a),
    markRead: (...a) => wa.markRead(...a),
    downloadMedia: (...a) => wa.downloadMedia(...a),
  };
  if (!isButton) void wa.sendReaction(to, waMessageId, "👀").catch(() => undefined);
  // WhatsApp's typing dots clear on any message we send and after ~25s: shown again after the note and every 20s
  const typing = () => void wa.markRead(waMessageId, { typing: true }).catch(() => undefined);
  const timer = setTimeout(() => {
    if (replied) return;
    void wa
      .sendText(to, liveCopy["progress.wait"]())
      .then(typing)
      .catch(() => undefined);
  }, PROGRESS_NOTE_AFTER_MS);
  const keepTyping = setInterval(() => {
    if (!replied) typing();
  }, TYPING_REFRESH_MS);
  return {
    ctx: { ...ctx, wa: tracked },
    /** ✅ when handled; after a failure the 👀 is removed instead (an empty reaction), so nothing claims it worked. */
    async done(failed = false) {
      clearTimeout(timer);
      clearInterval(keepTyping);
      if (!isButton) await wa.sendReaction(to, waMessageId, failed ? "" : "✅").catch(() => undefined);
    },
  };
}

async function afterStored(
  ctx: BotContext,
  msg: InboundMessage,
  { user, to, stored, isButton, spendTurn }: { user: UserRow; to: string; stored: MessageRow; isButton: boolean; spendTurn: SpendTurn | null },
): Promise<{ handled: boolean; note?: string }> {

  const say = async (text: string) => {
    await ctx.wa.sendText(to, text);
    await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
  };

  const capReached = async (reason: SpendBlock) => {
    await say(budgetReply(reason, ctx.spend?.limits.demo ?? false, ctx.spend?.limits.userDailyMessages ?? null));
    return { handled: true, note: `ai cap: ${reason}` };
  };
  /** a read-only look before work that needs a paid call (nothing is counted yet) */
  const spendBlocked = async () => (spendTurn ? spendTurn.blocked() : null);

  // 1b. voice notes (Milestone 5): "מקשיבה…" → download → STT → transcript on the message → continue as text
  if (msg.type === "audio" && ctx.stt) {
    const blocked = await spendBlocked();
    if (blocked) return capReached(blocked);
    const voice = await transcribeVoiceNote(ctx, user.id, msg, stored.id);
    if (!voice.ok) return { handled: true, note: voice.note };
    msg = { ...msg, type: "text", text: voice.transcript };
  }

  // 2a. reminder buttons (free-form message buttons and the `reminder` template's quick replies)
  if ((msg.type === "button" || msg.type === "template_button") && msg.reply?.id.startsWith("rem:")) {
    await handleReminderButton(ctx, user, to, msg.reply.id);
    return { handled: true, note: "reminder button" };
  }

  // 2a'. proactive alert buttons and list rows (lib/proactive/actions.ts): a reminder or a mark right here; a reply
  //      draft, a brief or a meeting change goes on to the assistant as a request (the usual approval cards)
  if (isButton && msg.reply?.id.startsWith("al:")) {
    const press = await handleAlertButton(ctx, user, to, msg.reply.id);
    if (press.handled) return { handled: true, note: press.note };
    msg = { ...msg, type: "text", text: press.request };
  }

  // 2a''. meeting summary buttons and the `meeting_summary_ready` template's quick replies (lib/meetings/actions.ts):
  //       the summary, a mail draft (the usual approval card), the tasks document, the task list, on / off
  if (isButton && msg.reply?.id.startsWith("mt:")) {
    const press = await handleMeetingButton(ctx, user, to, msg.reply.id);
    return { handled: true, note: press.note };
  }

  // 2b. billing buttons (one-tap upgrade / retry / renew, cancel, card update) — work even while paused
  if (await handleBillingPress(ctx, user, msg)) return { handled: true, note: "billing button" };

  // 2. approval buttons
  if (msg.type === "button" && msg.reply?.id.startsWith("pa:")) {
    await handlePendingButton(ctx, user.id, to, msg.reply.id, msg.waMessageId);
    return { handled: true, note: "pending button" };
  }

  // 3. "כניסה" → one-time sign-in link for the site (before onboarding and billing: it must always work)
  if (await handleLoginKeyword(ctx, user.id, msg, say)) return { handled: true, note: "login link" };
  // 3'. "חבר מביא חבר" / "הזמנת חבר" → the personal referral link (lib/referrals) — no model, not counted, any plan
  if (msg.type === "text" && (await handleReferralKeyword(ctx.db, user.id, ctx.appUrl, msg.text, say))) return { handled: true, note: "referral link" };

  // 3a. billing commands ("קבלה", "שדרוג", "ביטול מנוי", "עדכון כרטיס"…) — not counted, work even while paused.
  //     Not while the agent flow waits for typed text: "חשבוניות" there is an agent's name, not "send my receipts".
  const draftAwaitsText = agentDraftAwaitsText(user, ctx.now());
  if (!draftAwaitsText && (await handleBillingText(ctx, user, msg))) return { handled: true, note: "billing command" };

  // 3a'. "בלי התראות" / "להחזיר התראות" — the proactive alerts' switch (pro), not counted, no model
  if (!draftAwaitsText && msg.type === "text" && msg.text && (await handleAlertCommand(ctx, user, to, msg.text))) return { handled: true, note: "alerts command" };
  // 3a''. "בלי סיכומי פגישות" / "להחזיר סיכומי פגישות" — the automatic meeting summaries' switch (pro), no model
  if (!draftAwaitsText && msg.type === "text" && msg.text && (await handleMeetingCommand(ctx, user, to, msg.text))) return { handled: true, note: "meetings command" };

  // 3b. onboarding questions (not while the agent flow waits for a typed name: that text belongs to the flow)
  if (onboardingOf(user) && !draftAwaitsText && (await handleOnboarding(ctx, user, msg))) return { handled: true, note: "onboarding" };

  // 4. media we cannot process (voice notes were transcribed in 1b)
  if (msg.type !== "text" && !(isButton && msg.text)) {
    await say(copy["err.unsupported_media"](MEDIA_HE[msg.type] ?? MEDIA_HE.other!));
    return { handled: true, note: `unsupported ${msg.type}` };
  }
  const text = (msg.text ?? "").trim();
  if (!text) return { handled: true, note: "empty" };

  // 5a. billing gate (PLAN §3/§4): suspended account
  const sub = await ctx.db.getSubscription(user.id);
  const payLink = payLinkFor(ctx.appUrl, user.id);
  if (sub?.status === "past_due") {
    await pausedAccount(ctx, user, to, text);
    return { handled: true, note: "past_due" };
  }

  // 5b. agents (docs/design/agents.md §5.1) — deterministic, no model, not counted: `ag:` buttons, the create / edit
  //     flows, management commands, and addresses that cannot reach the model. A message to an available agent goes on.
  //     What 5b answers is agent management (a dictated instruction, a name, a choice): kept in the history, but
  //     never in the model's context or the summary (I5) — its replies are stored hidden, and so is this message.
  const routing = await handleAgentMessage(ctx, user, msg, text, sub);
  if (routing.handled) {
    await ctx.db.hideMessageFromModel(user.id, stored.id);
    return { handled: true, note: routing.note };
  }
  const ask = routing.text;

  // 5c. the daily spend cap (before the trial counts the message: a capped message costs nothing), then trial / quota
  const blocked = await spendBlocked();
  if (blocked) return capReached(blocked);
  const remaining = await ctx.db.countTrialMessage(user.id);
  if (remaining < 0) {
    const paidPlan = sub && isPaidPlan(sub.plan) && sub.status !== "trial" ? sub.plan : null;
    if (paidPlan === "basic") {
      await basicLimitReached(ctx, user, to, text);
    } else if (paidPlan === "pro") {
      await say(copy["err.rate_limit"]());
    } else {
      const lastNotice = typeof user.profile.trial_ended_notified_at === "string" ? Date.parse(user.profile.trial_ended_notified_at) : 0;
      const first = !lastNotice;
      await ctx.db.mergeUserProfile(user.id, { pending_input: text, trial_ended_notified_at: ctx.now().toISOString() });
      if (first) await say(copy["bill.trial_ended"](user.name, payLink));
      else if (ctx.now().getTime() - lastNotice > 24 * 3_600_000) {
        await ctx.db.mergeUserProfile(user.id, { trial_ended_notified_at: ctx.now().toISOString() });
        await say(copy["bill.trial_ended_repeat"](payLink));
      }
    }
    return { handled: true, note: "quota exhausted" };
  }

  // 6. explicit connect requests ("לחבר את המייל", "חבר שוב") — no model needed. The plan decides which accounts the
  //    turn may use (lib/billing/plans.ts): on a one-account plan a second account is refused here (and by the start
  //    route), and one connected before the split is paused — left out of the tools, not disconnected.
  const freshUser = (await ctx.db.getUser(user.id)) ?? user;
  const account = accountContextOf(sub, remaining, ctx.now());
  const allConnections = await ctx.db.listConnections(user.id);
  const connections = connectionsInForce(allConnections, account.plan);
  const connectProvider = connectRequestProvider(ask, connections);
  if (connectProvider && !mayConnect(allConnections, account.plan, connectProvider)) {
    const inForce = primaryProvider(allConnections)!;
    await say(scopy["s.plan.one_account"](providerLabel(inForce), providerLabel(connectProvider), account.plan === "trial"));
    if (awaitingAnswer(freshUser)) await afterFirstTask(ctx, freshUser, to);
    return { handled: true, note: "second account refused" };
  }
  if (connectProvider) {
    const expired = connections.find((c) => c.provider === connectProvider && c.status === "expired");
    const link = connectLinkFor(ctx, user.id, connectProvider);
    await say((expired ? copy["err.connection_expired"](providerLabel(connectProvider), link) : copy["onb.connect_link"](providerLabel(connectProvider), link)) + (await connectHeadsUpSuffix(ctx.db, connections, connectProvider)));
    // a link while an onboarding question is open: the question again, so "חיברתי" afterwards is not taken as the answer
    if (awaitingAnswer(freshUser)) await afterFirstTask(ctx, freshUser, to);
    return { handled: true, note: "connect link" };
  }
  const reconnect = reconnectProviderFor(ask, connections);
  if (reconnect) {
    await say(copy["err.connection_expired"](providerLabel(reconnect), connectLinkFor(ctx, user.id, reconnect)) + (await connectHeadsUpSuffix(ctx.db, connections, reconnect)));
    if (awaitingAnswer(freshUser)) await afterFirstTask(ctx, freshUser, to);
    return { handled: true, note: "connection expired" };
  }

  // 7. assistant or agent (Graph / Google tools when a connection is active; reminder tools always). An agent's reply
  //    opens with its name (§5.5) and the agent stays sticky for 10 minutes (§5.3).
  let reply: string;
  let ranFlow = false;
  let morningTimeSet = false;
  try {
    const out = await runAssistant({
      db: ctx.db,
      ai: ctx.ai,
      user: freshUser,
      // all of them: the orchestrator leaves a paused account out itself and tells the model about it
      connections: allConnections,
      text: ask,
      now: ctx.now(),
      tools: ctx.extraTools ? await ctx.extraTools(freshUser, connections, account.plan) : [],
      onlineMeetingCheck: ctx.onlineMeetingCheck?.(connections),
      agent: routing.agent,
      agentVia: routing.via,
      agentChoices: routing.choices,
      activeAgentKey: routing.activeKey,
      account,
      inboundId: stored.id,
    });
    const header = out.agent ? `${acopy["agent.reply_header"](out.agent.name)}\n` : "";
    reply = out.text.trim() ? rtlLines(`${header}${out.text}`) : out.text;
    // A pending action is rendered by us (draft + buttons), and a flow (upgrade, a new agent) sends its own messages:
    // the model's one-liner would be redundant — unless the text also answers something else in the same message.
    // Reply buttons (a reminder's "move to the next date") ride on the reply.
    const flowOnly = out.flows.length > 0 && !out.textBeyondFlows;
    const rendered = out.pendingActions.length > 0 || flowOnly;
    let withButtons = out.replyButtons.length > 0 && reply.length <= MAX_BUTTON_BODY;
    if (reply.trim() && !rendered) {
      if (withButtons) {
        // the buttons are an extra; the answer itself (a reminder's confirmation) must never be lost with them
        withButtons = await ctx.wa.sendButtons(to, reply, out.replyButtons).then(
          () => true,
          (e: unknown) => (console.warn("[bot] reply buttons failed, sending text:", (e as Error).message), false),
        );
      }
      if (!withButtons) await ctx.wa.sendText(to, reply);
    }
    for (const action of out.pendingActions) await presentPendingAction(ctx, to, action);
    const storedText = (flowOnly ? "" : reply) || `[${[...out.pendingActions.map((a) => a.kind), ...out.flows].join(",")}]`;
    await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: out.pendingActions.length || withButtons ? "button" : "text", text: storedText, model_used: out.model, tokens_in: out.usage.input + out.usage.cacheRead, tokens_out: out.usage.output, cost_usd: out.costUsd, agent_key: out.agent?.key ?? null, tools: out.toolsUsed });
    for (const flow of out.flows) await (flow === "upgrade" ? upgradeOffer(ctx, freshUser, to) : startAgentCreation(ctx, freshUser, to, sub));
    ranFlow = out.flows.length > 0;
    morningTimeSet = out.toolsUsed.includes("set_morning_time");
    await updateStickyAfterTurn(ctx, user, out.agent?.key ?? null, Boolean(routing.activeKey) || routing.clearSticky);
  } catch (e) {
    if (e instanceof BudgetExceededError) return capReached(e.reason); // the cap was reached between the check and a call
    const retryable = e instanceof AiProviderError ? e.retryable : false;
    console.error("[bot] assistant failed:", (e as Error).message);
    await reportError("bot", e, { userId: user.id, db: ctx.db, context: { retryable } });
    await say(retryable ? copy["err.model"]() : copy["err.generic"]());
    return { handled: true, note: "assistant error" };
  }

  // 8. trial nudges (appended as a separate short bubble; not counted)
  const onTrial = !(sub && isPaidPlan(sub.plan) && sub.status !== "trial");
  if (remaining === 3 && onTrial) await say(copy["bill.trial_left_3"]());
  else if (remaining === 1 && onTrial) await say(copy["bill.trial_left_1"](payLink));

  // 9. onboarding continues after the first task (not on top of a flow that just asked its own question)
  if (!ranFlow) await afterFirstTask(ctx, freshUser, to, { morningTimeSet });

  // 10. memory (best effort)
  await maybeSummarize(ctx.db, ctx.ai, freshUser, ctx.now());
  return { handled: true, note: "replied" };
}

/** The message's own view of the model and STT: both wrapped by one spend turn (lib/ai/budget.ts). */
function withSpendTurn(ctx: BotContext, turn: SpendTurn): BotContext {
  const stt = ctx.stt;
  return { ...ctx, ai: turn.ai(ctx.ai), stt: stt ? () => turn.stt(stt()) : undefined };
}
