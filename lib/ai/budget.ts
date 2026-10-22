import { z } from "zod";
import type { Db } from "@/lib/db/types";
import { isDemo } from "@/lib/demo";
import { EnvError, liveAiInDemo } from "@/lib/env";
import type { AudioInput, SttProvider, TranscribeOptions, Transcript } from "@/lib/stt/types";
import { DEFAULT_TZ, dateKey, localDateOf } from "@/lib/time/zoned";
import { costUsd } from "./anthropic";
import type { AiProvider, CompletionRequest, CompletionResponse } from "./types";

/**
 * The daily spend cap for paid model / STT calls (round plan §2, Daniel: $3 a day) and the per-user daily message cap.
 *
 *   - Where: the demo with LIVE_AI=1 (lib/env.ts liveAiInDemo) — AI_DAILY_BUDGET_USD (default 3) and
 *     DEMO_USER_DAILY_MESSAGES (default 60). Outside the demo only when AI_DAILY_BUDGET_USD is set (an operator's safety
 *     net; no per-user cap there). The demo without LIVE_AI pays nothing and has no guard: behaviour unchanged.
 *   - What: every paid call is checked BEFORE it is made (the day's total in ai_spend, migration 0009) and its actual cost
 *     is added AFTER (Anthropic usage × the price table in lib/ai/anthropic.ts, OpenRouter `usage.cost`; a conservative
 *     estimate when a provider reports nothing). The first paid call of an inbound message also counts the message
 *     against the user's daily cap (atomic in SQL). Days are calendar days in Asia/Jerusalem.
 *   - When a cap is reached: no call is made; the pipeline answers with one calm Hebrew line (lib/copy/bot-live.ts).
 *   - Soft by design: two messages checked at the same moment can both pass and overshoot by one call's cost.
 */

export const DEFAULT_DAILY_BUDGET_USD = 3;
export const DEFAULT_DEMO_USER_DAILY_MESSAGES = 60;

/** A model missing from the price table (an AI_*_MODEL override) is billed as the most expensive one we know. */
const UPPER_BOUND_MODEL = "claude-opus-5-5";
/** STT without a reported cost: about 2× deepgram/nova-3's list price per minute, never below a tenth of a cent. */
const STT_ESTIMATE_USD_PER_MINUTE = 0.01;
const STT_ESTIMATE_MIN_USD = 0.001;

export interface SpendLimits {
  /** USD per calendar day (Asia/Jerusalem), all users together; 0 stops every paid call */
  dailyBudgetUsd: number;
  /** messages per user per day that may reach a paid call; null = no per-user cap */
  userDailyMessages: number | null;
  /** which words the cap reply uses (the demo's "test" wording, or the general one) */
  demo: boolean;
}

export type SpendBlock = "budget" | "user_messages";

export class BudgetExceededError extends Error {
  constructor(
    readonly reason: SpendBlock,
    readonly demo: boolean,
  ) {
    super(reason === "budget" ? "daily AI budget reached" : "daily message cap reached for this user");
    this.name = "BudgetExceededError";
  }
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const limitsSchema = z.object({
  AI_DAILY_BUDGET_USD: z.preprocess(blank, z.coerce.number({ message: "AI_DAILY_BUDGET_USD חייב להיות מספר דולרים, למשל 3" }).min(0).max(10_000).optional()),
  DEMO_USER_DAILY_MESSAGES: z.preprocess(
    blank,
    z.coerce.number({ message: "DEMO_USER_DAILY_MESSAGES חייב להיות מספר שלם, למשל 60" }).int({ message: "DEMO_USER_DAILY_MESSAGES חייב להיות מספר שלם, למשל 60" }).min(0).max(100_000).optional(),
  ),
});

/** The limits in force, or null when no paid call is guarded. Invalid values throw a Hebrew EnvError naming them. */
export function spendLimits(source: Record<string, string | undefined> = process.env): SpendLimits | null {
  const live = liveAiInDemo(source);
  if (!live && isDemo(source)) return null; // the mock demo pays nothing
  const parsed = limitsSchema.safeParse({ AI_DAILY_BUDGET_USD: source.AI_DAILY_BUDGET_USD, DEMO_USER_DAILY_MESSAGES: live ? source.DEMO_USER_DAILY_MESSAGES : undefined });
  if (!parsed.success) throw new EnvError(parsed.error.issues);
  const { AI_DAILY_BUDGET_USD: budget, DEMO_USER_DAILY_MESSAGES: perUser } = parsed.data;
  if (live) return { dailyBudgetUsd: budget ?? DEFAULT_DAILY_BUDGET_USD, userDailyMessages: perUser ?? DEFAULT_DEMO_USER_DAILY_MESSAGES, demo: true };
  return budget === undefined ? null : { dailyBudgetUsd: budget, userDailyMessages: null, demo: false };
}

/** What a model call cost: the provider's figure, else the usage at the highest known price. */
export function aiCallCostUsd(r: Pick<CompletionResponse, "costUsd" | "usage">): number {
  if (typeof r.costUsd === "number" && Number.isFinite(r.costUsd) && r.costUsd >= 0) return r.costUsd;
  return costUsd(UPPER_BOUND_MODEL, r.usage) ?? ((r.usage.input + r.usage.cacheWrite + r.usage.cacheRead) * 5 + r.usage.output * 25) / 1_000_000;
}

/** What a transcription cost: OpenRouter's `usage.cost`, else an estimate from the length (or a flat cent). */
export function sttCallCostUsd(t: Pick<Transcript, "costUsd" | "durationMs">): number {
  if (typeof t.costUsd === "number" && Number.isFinite(t.costUsd) && t.costUsd >= 0) return t.costUsd;
  if (t.durationMs && t.durationMs > 0) return Math.max(STT_ESTIMATE_MIN_USD, (t.durationMs / 60_000) * STT_ESTIMATE_USD_PER_MINUTE);
  return STT_ESTIMATE_USD_PER_MINUTE;
}

export class SpendGuard {
  constructor(
    private readonly db: Db,
    readonly limits: SpendLimits,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The current calendar day in Asia/Jerusalem, "YYYY-MM-DD" (the ai_spend key). */
  day(): string {
    return dateKey(localDateOf(this.now(), DEFAULT_TZ));
  }

  /**
   * A read-only look before a message is handled (nothing is counted): why it would be blocked, or null.
   * `admitted`: the message was already counted (a voice note after its transcription) — only the budget matters.
   */
  async blocked(userId: string, admitted = false): Promise<SpendBlock | null> {
    const day = this.day();
    const cap = admitted ? null : this.limits.userDailyMessages;
    const [spent, used] = await Promise.all([this.db.getAiSpend(day), cap === null ? Promise.resolve(0) : this.db.getAiUserMessages(day, userId)]);
    if (spent >= this.limits.dailyBudgetUsd) return "budget";
    if (cap !== null && used >= cap) return "user_messages";
    return null;
  }

  /** Before every paid call: throws when the day's budget is spent. */
  async assertBudget(): Promise<void> {
    if ((await this.db.getAiSpend(this.day())) >= this.limits.dailyBudgetUsd) throw new BudgetExceededError("budget", this.limits.demo);
  }

  /** Before a message's first paid call: the budget, then one more message under the user's cap (atomic). */
  async admitMessage(userId: string): Promise<void> {
    await this.assertBudget();
    const cap = this.limits.userDailyMessages;
    if (cap === null) return;
    if ((await this.db.admitAiUserMessage(this.day(), userId, cap)) < 0) throw new BudgetExceededError("user_messages", this.limits.demo);
  }

  /** After a paid call: adds what it cost. A failed write is logged, never thrown — the answer is already paid for. */
  async record(cost: number): Promise<void> {
    try {
      await this.db.addAiSpend(this.day(), cost, 1);
    } catch (e) {
      console.error("[budget] could not record the spend:", (e as Error).message);
    }
  }

  /** One inbound message: the model and STT wrapped so each paid call is checked first and recorded after. */
  turn(userId: string): SpendTurn {
    return new SpendTurn(this, userId);
  }
}

export class SpendTurn {
  private admitted = false;

  constructor(
    private readonly guard: SpendGuard,
    readonly userId: string,
  ) {}

  /** The read-only look of `SpendGuard.blocked`, for this message (once counted, only the budget can block it). */
  blocked(): Promise<SpendBlock | null> {
    return this.guard.blocked(this.userId, this.admitted);
  }

  /** The first paid call of the message counts it; every later one only checks the budget. */
  async beforeCall(): Promise<void> {
    if (this.admitted) return this.guard.assertBudget();
    await this.guard.admitMessage(this.userId);
    this.admitted = true;
  }

  ai(inner: AiProvider): AiProvider {
    return {
      name: inner.name,
      complete: async (req: CompletionRequest) => {
        await this.beforeCall();
        const res = await inner.complete(req);
        await this.guard.record(aiCallCostUsd(res));
        return res;
      },
    };
  }

  stt(inner: SttProvider): SttProvider {
    return {
      name: inner.name,
      transcribe: async (audio: AudioInput, opts?: TranscribeOptions) => {
        await this.beforeCall();
        const t = await inner.transcribe(audio, opts);
        await this.guard.record(sttCallCostUsd(t));
        return t;
      },
    };
  }
}

/** The guard for this deployment's env, or null when nothing paid is guarded (see `spendLimits`). */
export function spendGuardFromEnv(db: Db, source: Record<string, string | undefined> = process.env): SpendGuard | null {
  const limits = spendLimits(source);
  return limits ? new SpendGuard(db, limits) : null;
}
