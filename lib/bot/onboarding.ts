import { copy, buttons, lists } from "@/lib/copy/bot";
import type { Db, UserRow } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";

/**
 * First-contact state machine (PLAN §1), persisted in users.profile.onboarding:
 *   welcome → (סיור) ways_card → first_task → ask_name → ask_business → ask_pain → ask_morning_time → connect → done
 *   welcome → (נתחיל לעבוד) first_task → … (same tail)
 * Every step is one message; any free text while a question is open is taken as the answer.
 */
export type OnboardingStep = "welcome" | "first_task" | "ask_name" | "ask_business" | "ask_pain" | "ask_morning_time" | "connect" | "done";

export interface OnboardingState {
  step: OnboardingStep;
  startedAt: string;
  /** the first task message was answered by the assistant already */
  firstTaskDone?: boolean;
}

export function onboardingOf(user: UserRow): OnboardingState | null {
  const o = user.profile.onboarding as OnboardingState | undefined;
  return o && o.step && o.step !== "done" ? o : null;
}

async function setStep(db: Db, userId: string, patch: Partial<OnboardingState> & { step: OnboardingStep }): Promise<void> {
  const user = await db.getUser(userId);
  const prev = (user?.profile.onboarding as OnboardingState | undefined) ?? { step: "welcome", startedAt: new Date().toISOString() };
  await db.mergeUserProfile(userId, { onboarding: { ...prev, ...patch } });
}

export async function startOnboarding(ctx: BotContext, userId: string): Promise<void> {
  await setStep(ctx.db, userId, { step: "welcome", startedAt: ctx.now().toISOString() });
}

const MORNING: Record<string, string | null> = { mt_0700: "07:00", mt_0730: "07:30", mt_0800: "08:00", mt_0830: "08:30", mt_none: null };

/**
 * Handles one message while onboarding is active. Returns `false` when the message should go to the
 * assistant instead (e.g. the first task), after advancing the state as needed.
 */
export async function handleOnboarding(ctx: BotContext, user: UserRow, msg: InboundMessage): Promise<boolean> {
  const state = onboardingOf(user);
  if (!state) return false;
  const to = msg.fromE164;
  const reply = msg.reply?.id ?? null;
  const text = (msg.text ?? "").trim();

  switch (state.step) {
    case "welcome": {
      if (reply === "onb:tour") {
        await ctx.wa.sendText(to, copy["onb.ways_card"]());
        await ctx.wa.sendText(to, copy["onb.first_task"]());
        await setStep(ctx.db, user.id, { step: "first_task" });
        return true;
      }
      if (reply === "onb:start") {
        await ctx.wa.sendText(to, copy["onb.first_task"]());
        await setStep(ctx.db, user.id, { step: "first_task" });
        return true;
      }
      // any other message: treat it as the first task
      await setStep(ctx.db, user.id, { step: "first_task" });
      return false;
    }
    case "first_task": {
      // the assistant answers this one; afterwards we continue with the questions (see afterFirstTask)
      return false;
    }
    case "ask_name": {
      if (!text || msg.type !== "text") {
        await ctx.wa.sendText(to, copy["onb.ask_name"]());
        return true;
      }
      const name = text.slice(0, 60);
      await ctx.db.updateUserProfile(user.id, { name });
      await ctx.wa.sendText(to, copy["onb.ask_business"](name));
      await setStep(ctx.db, user.id, { step: "ask_business" });
      return true;
    }
    case "ask_business": {
      if (text) await ctx.db.updateUserProfile(user.id, { business_name: text.slice(0, 120) });
      await ctx.wa.sendList(to, copy["onb.ask_pain"](), lists.pain.button, [{ title: lists.pain.title, rows: lists.pain.rows }]);
      await setStep(ctx.db, user.id, { step: "ask_pain" });
      return true;
    }
    case "ask_pain": {
      const pain = reply && reply.startsWith("pain_") ? reply : null;
      if (!pain) {
        await ctx.wa.sendList(to, copy["onb.ask_pain"](), lists.pain.button, [{ title: lists.pain.title, rows: lists.pain.rows }]);
        return true;
      }
      await ctx.db.mergeUserProfile(user.id, { pain_point: pain });
      await ctx.wa.sendText(to, copy["onb.pain_ack"](pain));
      await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]);
      await setStep(ctx.db, user.id, { step: "ask_morning_time" });
      return true;
    }
    case "ask_morning_time": {
      if (!reply || !(reply in MORNING)) {
        await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]);
        return true;
      }
      const time = MORNING[reply];
      if (time) {
        await ctx.db.updateUserProfile(user.id, { morning_time: time });
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: true });
        await ctx.wa.sendText(to, copy["onb.morning_time_ack"](time));
      } else {
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: false });
        await ctx.wa.sendText(to, copy["onb.morning_time_skip"]());
      }
      const connected = (await ctx.db.listConnections(user.id)).some((c) => c.status === "active");
      if (connected) {
        await finish(ctx, user.id, to);
      } else {
        await ctx.wa.sendButtons(to, copy["onb.connect_nudge"](), buttons.connect);
        await setStep(ctx.db, user.id, { step: "connect" });
      }
      return true;
    }
    case "connect": {
      if (reply === "onb:connect:microsoft" || reply === "onb:connect:google") {
        // The one-time OAuth link is issued by Milestone 4/6; until then point to the site.
        const provider = reply.endsWith("microsoft") ? "Microsoft 365" : "Google";
        await ctx.wa.sendText(to, copy["onb.connect_link"](provider, new URL("/start/connect", ctx.appUrl).toString()));
        await finish(ctx, user.id, to);
        return true;
      }
      if (reply === "onb:connect:later") {
        await ctx.wa.sendText(to, copy["onb.connect_skip"]());
        await finish(ctx, user.id, to);
        return true;
      }
      // free text during the nudge → finish onboarding and let the assistant answer
      await finish(ctx, user.id, to, false);
      return false;
    }
    default:
      return false;
  }
}

/** Called after the assistant answered the first task: continue with the questions (skip name if known). */
export async function afterFirstTask(ctx: BotContext, user: UserRow, to: string): Promise<void> {
  const state = onboardingOf(user);
  if (!state || state.step !== "first_task") return;
  if (user.name) {
    await ctx.wa.sendText(to, copy["onb.ask_business"](user.name));
    await setStep(ctx.db, user.id, { step: "ask_business", firstTaskDone: true });
  } else {
    await ctx.wa.sendText(to, copy["onb.ask_name"]());
    await setStep(ctx.db, user.id, { step: "ask_name", firstTaskDone: true });
  }
}

async function finish(ctx: BotContext, userId: string, to: string, sayDone = true): Promise<void> {
  await setStep(ctx.db, userId, { step: "done" });
  if (sayDone) await ctx.wa.sendText(to, copy["onb.done"]());
}
