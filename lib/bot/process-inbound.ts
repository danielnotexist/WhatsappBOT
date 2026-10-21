import { maybeSummarize } from "@/lib/ai/memory";
import { runAssistant } from "@/lib/ai/orchestrator";
import { AiProviderError } from "@/lib/ai/types";
import { payLinkFor } from "@/lib/billing/pay-link";
import { isPaidPlan } from "@/lib/billing/plans";
import { copy } from "@/lib/copy/bot";
import type { MessageType } from "@/lib/db/types";
import { handleReminderButton } from "@/lib/reminders/service";
import type { InboundMessage } from "@/lib/wa/types";
import { connectLinkFor, type BotContext } from "./context";
import { handleUnlinkedPhone } from "./linking";
import { afterFirstTask, handleOnboarding, onboardingOf } from "./onboarding";
import { handlePendingButton, presentPendingAction } from "./pending";
import { handleLoginKeyword } from "./login-link";
import { transcribeVoiceNote } from "./voice";
import { connectRequestProvider, providerLabel, reconnectProviderFor } from "./connect-intent";

const toDbType = (t: InboundMessage["type"]): MessageType =>
  t === "text" ? "text" : t === "audio" ? "audio" : t === "image" ? "image" : t === "document" ? "doc" : t === "button" || t === "list" || t === "template_button" ? "button" : "other";

const MEDIA_HE: Record<string, string> = { other: "סוג ההודעה הזה", audio: "הקלטות", image: "תמונות", document: "קבצים" };

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

  // 1. dedupe (unique wa_message_id) + store the inbound row
  const stored = await ctx.db.insertMessage({ user_id: user.id, wa_message_id: msg.waMessageId, direction: "in", type: toDbType(msg.type), text: msg.text, media_url: msg.mediaId ? `wa-media:${msg.mediaId}` : null });
  if (!stored) return { handled: true, note: "duplicate" };

  const isButton = msg.type === "button" || msg.type === "list" || msg.type === "template_button";
  await ctx.wa.markRead(msg.waMessageId, { typing: true }).catch(() => undefined);
  if (!isButton) await ctx.wa.sendReaction(to, msg.waMessageId, "✅").catch(() => undefined);

  const say = async (text: string) => {
    await ctx.wa.sendText(to, text);
    await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
  };

  // 1b. voice notes (Milestone 5): "מקשיבה…" → download → STT → transcript on the message → continue as text
  if (msg.type === "audio" && ctx.stt) {
    const voice = await transcribeVoiceNote(ctx, user.id, msg, stored.id);
    if (!voice.ok) return { handled: true, note: voice.note };
    msg = { ...msg, type: "text", text: voice.transcript };
  }

  // 2a. reminder buttons (free-form message buttons and the `reminder` template's quick replies)
  if ((msg.type === "button" || msg.type === "template_button") && msg.reply?.id.startsWith("rem:")) {
    await handleReminderButton(ctx, user, to, msg.reply.id);
    return { handled: true, note: "reminder button" };
  }

  // 2. approval buttons
  if (msg.type === "button" && msg.reply?.id.startsWith("pa:")) {
    await handlePendingButton(ctx, user.id, to, msg.reply.id, msg.waMessageId);
    return { handled: true, note: "pending button" };
  }

  // 3. "כניסה" → one-time sign-in link for the site (before onboarding and billing: it must always work)
  if (await handleLoginKeyword(ctx, user.id, msg, say)) return { handled: true, note: "login link" };

  // 3b. onboarding questions
  if (onboardingOf(user) && (await handleOnboarding(ctx, user, msg))) return { handled: true, note: "onboarding" };

  // 4. media we cannot process (voice notes were transcribed in 1b)
  if (msg.type !== "text" && !(isButton && msg.text)) {
    await say(copy["err.unsupported_media"](MEDIA_HE[msg.type] ?? MEDIA_HE.other!));
    return { handled: true, note: `unsupported ${msg.type}` };
  }
  const text = (msg.text ?? "").trim();
  if (!text) return { handled: true, note: "empty" };

  // 5. billing gates (PLAN §3/§4): suspended account, trial / monthly quota
  const sub = await ctx.db.getSubscription(user.id);
  const payLink = payLinkFor(ctx.appUrl, user.id);
  if (sub?.status === "past_due") {
    const lastBlock = typeof user.profile.past_due_notified_at === "string" ? Date.parse(user.profile.past_due_notified_at) : 0;
    if (ctx.now().getTime() - lastBlock > 24 * 3_600_000) {
      await ctx.db.mergeUserProfile(user.id, { past_due_notified_at: ctx.now().toISOString(), pending_input: text });
      await say(copy["bill.past_due_blocked_reply"](payLink));
    }
    return { handled: true, note: "past_due" };
  }
  const remaining = await ctx.db.countTrialMessage(user.id);
  if (remaining < 0) {
    const paidPlan = sub && isPaidPlan(sub.plan) && sub.status !== "trial" ? sub.plan : null;
    if (paidPlan === "basic") {
      const now = ctx.now();
      const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      await say(copy["bill.plan_limit_reached"](`${reset.getUTCDate()}.${reset.getUTCMonth() + 1}`, payLink));
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

  // 6. explicit connect requests ("לחבר את המייל", "חבר שוב") — no model needed
  const freshUser = (await ctx.db.getUser(user.id)) ?? user;
  const connections = await ctx.db.listConnections(user.id);
  const connectProvider = connectRequestProvider(text, connections);
  if (connectProvider) {
    const expired = connections.find((c) => c.provider === connectProvider && c.status === "expired");
    const link = connectLinkFor(ctx, user.id, connectProvider);
    await say(expired ? copy["err.connection_expired"](providerLabel(connectProvider), link) : copy["onb.connect_link"](providerLabel(connectProvider), link));
    return { handled: true, note: "connect link" };
  }
  const reconnect = reconnectProviderFor(text, connections);
  if (reconnect) {
    await say(copy["err.connection_expired"](providerLabel(reconnect), connectLinkFor(ctx, user.id, reconnect)));
    return { handled: true, note: "connection expired" };
  }

  // 7. assistant (Graph / Google tools when a connection is active; reminder tools always)
  let reply: string;
  try {
    const out = await runAssistant({ db: ctx.db, ai: ctx.ai, user: freshUser, connections, text, now: ctx.now(), tools: ctx.extraTools ? await ctx.extraTools(freshUser, connections) : [] });
    reply = out.text;
    // A pending action is rendered by us (draft + buttons); the model's one-liner would be redundant.
    if (reply.trim() && out.pendingActions.length === 0) await ctx.wa.sendText(to, reply);
    for (const action of out.pendingActions) await presentPendingAction(ctx, to, action);
    await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: out.pendingActions.length ? "button" : "text", text: reply || `[${out.pendingActions.map((a) => a.kind).join(",")}]`, model_used: out.model, tokens_in: out.usage.input + out.usage.cacheRead, tokens_out: out.usage.output, cost_usd: out.costUsd });
  } catch (e) {
    const retryable = e instanceof AiProviderError ? e.retryable : false;
    console.error("[bot] assistant failed:", (e as Error).message);
    await say(retryable ? copy["err.model"]() : copy["err.generic"]());
    return { handled: true, note: "assistant error" };
  }

  // 8. trial nudges (appended as a separate short bubble; not counted)
  const onTrial = !(sub && isPaidPlan(sub.plan) && sub.status !== "trial");
  if (remaining === 3 && onTrial) await say(copy["bill.trial_left_3"]());
  else if (remaining === 1 && onTrial) await say(copy["bill.trial_left_1"](payLink));

  // 9. onboarding continues after the first task
  await afterFirstTask(ctx, freshUser, to);

  // 10. memory (best effort)
  await maybeSummarize(ctx.db, ctx.ai, freshUser, ctx.now());
  return { handled: true, note: "replied" };
}
