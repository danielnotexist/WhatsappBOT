import { z } from "zod";
import type { Db } from "@/lib/db/types";
import { isDemo } from "@/lib/demo";
import { EnvError, dataMode, liveAiInDemo } from "@/lib/env";
import type { AudioInput, SttProvider, TranscribeOptions, Transcript } from "@/lib/stt/types";
import { DEFAULT_TZ, dateKey, localDateOf } from "@/lib/time/zoned";
import { DEFAULT_MODELS, costUsd, maxTokensFor } from "./anthropic";
import type { AiProvider, CompletionRequest, CompletionResponse } from "./types";

/**
 * The daily spend cap for paid model / STT calls (round plan §2, Daniel: $3 a day) and the per-user daily message cap.
 *
 *   - Where: the demo with LIVE_AI=1 (lib/env.ts liveAiInDemo) — AI_DAILY_BUDGET_USD (default 3) and
 *     DEMO_USER_DAILY_MESSAGES (default 60). Outside the demo only when AI_DAILY_BUDGET_USD is set (an operator's safety
 *     net; no per-user cap there). The demo without LIVE_AI pays nothing and has no guard: behaviour unchanged.
 *     A deployed live demo (NODE_ENV=production or on Vercel) must keep the totals in Supabase (ai_spend): on the
 *     in-memory store every instance would have its own cap, reset on each cold start — `spendLimits` refuses that.
 *   - What: every paid call RESERVES an upper-bound estimate of its cost first (ai_spend_reserve, migration 0010: atomic,
 *     refused when the day's total would pass the budget), and is settled to its actual cost after (Anthropic usage ×
 *     the price table in lib/ai/anthropic.ts, OpenRouter `usage.cost`; a conservative estimate when a provider reports
 *     nothing). Calls in flight at once each hold their own share, so they cannot pass the cap together; a call whose
 *     result never arrives (a timeout, the function killed, a failed write) stays counted at its estimate — fail closed.
 *     The first paid call of an inbound message also counts the message against the user's daily cap (atomic in SQL).
 *     Days are calendar days in Asia/Jerusalem.
 *   - Time: in the demo a message's calls share one deadline (`turnMs`), passed to the providers as an AbortSignal, so
 *     the last call ends before the chat route's maxDuration (60 s) — never billed after the function is gone.
 *   - When a cap is reached: no call is made; the pipeline answers with one calm Hebrew line (lib/copy/bot-live.ts).
 *   - What is left: an estimate is an upper bound of the request (input bytes as tokens, max_tokens of output), so the
 *     total can pass the budget only by a settled call that cost more than its estimate.
 */

export const DEFAULT_DAILY_BUDGET_USD = 3;
export const DEFAULT_DEMO_USER_DAILY_MESSAGES = 60;

/** A model missing from the price table (an AI_*_MODEL override) is billed as the most expensive one we know. */
const UPPER_BOUND_MODEL = "claude-opus-5-5";
/** STT without a reported cost: about 2× deepgram/nova-3's list price per minute, never below a tenth of a cent. */
const STT_ESTIMATE_USD_PER_MINUTE = 0.01;
const STT_ESTIMATE_MIN_USD = 0.001;
/** The lowest bitrate we assume for a recording whose length is unknown (the page records at 32 kbps; Opus can go to 6). */
const STT_MIN_BITS_PER_SECOND = 6_000;
/** Paid STT calls one transcription may make (FallbackStt: deepgram/nova-3, then openai/gpt-transcribe). */
const STT_CALLS_PER_TRANSCRIPTION = 2;
/** Tokens the API adds around a request (the tool-use system prompt, message framing). */
const REQUEST_OVERHEAD_TOKENS = 1_500;
/** A message's calls in the live demo share this much time: the chat route's maxDuration is 60 s. */
export const DEMO_TURN_MS = 48_000;

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

/** A deployed process: Vercel, or a production build (`next start`). */
const deployed = (source: Record<string, string | undefined>) => source.NODE_ENV === "production" || Boolean(source.VERCEL?.trim());

/**
 * The limits in force, or null when no paid call is guarded. Invalid values throw a Hebrew EnvError naming them, and
 * so does a deployed live demo without Supabase: the totals would live in one instance's memory (one cap per instance,
 * reset on every cold start), so the real model is never reachable there.
 */
export function spendLimits(source: Record<string, string | undefined> = process.env): SpendLimits | null {
  const live = liveAiInDemo(source);
  if (!live && isDemo(source)) return null; // the mock demo pays nothing
  if (live && deployed(source) && dataMode(source) === "memory") {
    const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    throw new EnvError(
      names.map((name) => ({ code: "custom", path: [name], message: "required with LIVE_AI", input: undefined })),
      `AI חי בהדגמה (LIVE_AI=1) דורש Supabase עם מיגרציות 0009 ו-0010: חסרים ${names.join(", ")} (או ש-DATA_MODE=memory). ` +
        "בלי טבלת ai_spend משותפת לכל השרתים התקרה היומית לא נאכפת, ולכן המודל האמיתי לא מופעל. ראו docs/deploy.md §9.",
    );
  }
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

/**
 * What a transcription cost: OpenRouter's `usage.cost`, else an estimate from the length, else from the size of the
 * recording at the lowest bitrate we assume (a flat cent when nothing is known).
 */
export function sttCallCostUsd(t: Pick<Transcript, "costUsd" | "durationMs">, audioBytes?: number): number {
  if (typeof t.costUsd === "number" && Number.isFinite(t.costUsd) && t.costUsd >= 0) return t.costUsd;
  if (t.durationMs && t.durationMs > 0) return Math.max(STT_ESTIMATE_MIN_USD, (t.durationMs / 60_000) * STT_ESTIMATE_USD_PER_MINUTE);
  if (audioBytes && audioBytes > 0) return sttBytesCostUsd(audioBytes);
  return STT_ESTIMATE_USD_PER_MINUTE;
}

function sttBytesCostUsd(bytes: number): number {
  const minutes = (bytes * 8) / STT_MIN_BITS_PER_SECOND / 60;
  return Math.max(STT_ESTIMATE_MIN_USD, minutes * STT_ESTIMATE_USD_PER_MINUTE);
}

const utf8 = new TextEncoder();

/**
 * The most a model call can cost, reserved before it: every byte of the request as an input token billed at the cache
 * write price, plus the request's full max_tokens of output, at the tier's model (an unknown model at the highest price).
 */
export function aiCallEstimateUsd(req: CompletionRequest, models: Record<string, string> = DEFAULT_MODELS): number {
  const bytes = utf8.encode(JSON.stringify({ s: req.system, m: req.messages, t: req.tools ?? [] })).length;
  const u = { input: 0, cacheRead: 0, cacheWrite: bytes + REQUEST_OVERHEAD_TOKENS, output: maxTokensFor(req) };
  return costUsd(models[req.tier] ?? UPPER_BOUND_MODEL, u) ?? costUsd(UPPER_BOUND_MODEL, u)!;
}

/** The most a transcription can cost, reserved before it: the recording at the lowest bitrate, on both providers. */
export function sttCallEstimateUsd(audioBytes: number): number {
  return sttBytesCostUsd(Math.max(audioBytes, 1)) * STT_CALLS_PER_TRANSCRIPTION;
}

/** The provider answered with an error status: nothing was generated, so nothing was billed. */
function answeredWithError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400;
}

/**
 * A settle that could not be written (the actual cost above the estimate) — carried into this process's next
 * reservation, so a write failure never leaves spend uncounted for long.
 */
let unsettledUsd = 0;

/** Tests only. */
export function resetUnsettledSpendForTests(): void {
  unsettledUsd = 0;
}

export interface SpendGuardOptions {
  /** the clock for the calendar day (tests move it) */
  now?: () => Date;
  /** one message's calls share this much time (an AbortSignal on each call); unset = no deadline */
  turnMs?: number;
}

export class SpendGuard {
  private readonly now: () => Date;
  readonly turnMs: number | null;

  constructor(
    private readonly db: Db,
    readonly limits: SpendLimits,
    opts: SpendGuardOptions | (() => Date) = {},
  ) {
    const o = typeof opts === "function" ? { now: opts } : opts;
    this.now = o.now ?? (() => new Date());
    this.turnMs = o.turnMs ?? null;
  }

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

  /** A read-only check: throws when the day's budget is spent. */
  async assertBudget(): Promise<void> {
    if ((await this.db.getAiSpend(this.day())) >= this.limits.dailyBudgetUsd) throw new BudgetExceededError("budget", this.limits.demo);
  }

  /**
   * Before a paid call: holds `estimate` of the day's budget (atomic). Throws BudgetExceededError when it does not fit,
   * and any write error as is — no call is made without its reservation (fail closed). Returns the day it was held on.
   */
  async reserve(estimate: number): Promise<string> {
    const day = this.day();
    if (!(this.limits.dailyBudgetUsd > 0)) throw new BudgetExceededError("budget", this.limits.demo);
    const carried = unsettledUsd;
    if ((await this.db.reserveAiSpend(day, estimate + carried, this.limits.dailyBudgetUsd)) < 0) throw new BudgetExceededError("budget", this.limits.demo);
    unsettledUsd = Math.max(unsettledUsd - carried, 0);
    return day;
  }

  /** After the call: the reservation becomes the actual cost. A failed write keeps the estimate counted (logged). */
  async settle(day: string, estimate: number, actual: number): Promise<void> {
    const delta = actual - estimate;
    if (delta === 0) return;
    try {
      await this.db.adjustAiSpend(day, delta);
    } catch (e) {
      if (delta > 0) unsettledUsd += delta; // the next reservation carries it
      console.error("[budget] could not settle the spend:", (e as Error).message);
    }
  }

  /** The call failed before anything was billed: give its reservation back (best effort — kept on a failed write). */
  async release(day: string, estimate: number): Promise<void> {
    await this.settle(day, estimate, 0);
  }

  /** One more message under the user's cap (atomic); throws when the cap is full. */
  async admitUser(userId: string, day: string = this.day()): Promise<void> {
    const cap = this.limits.userDailyMessages;
    if (cap === null) return;
    if ((await this.db.admitAiUserMessage(day, userId, cap)) < 0) throw new BudgetExceededError("user_messages", this.limits.demo);
  }

  /** One inbound message: the model and STT wrapped so each paid call is reserved first and settled after. */
  turn(userId: string): SpendTurn {
    return new SpendTurn(this, userId);
  }

  /**
   * The model for a call with no user behind it (the website's support chat, app/api/support/chat): the same day's
   * budget — reserved before the call, settled to its cost after, given back when the provider answered with an error
   * status — and no per-user count (there is no account to count against). `timeoutMs` aborts a call that runs long.
   */
  anonymousAi(inner: AiProvider, timeoutMs?: number): AiProvider {
    return {
      name: inner.name,
      complete: async (req: CompletionRequest) => {
        const estimate = aiCallEstimateUsd(req);
        const day = await this.reserve(estimate);
        let res: CompletionResponse;
        try {
          res = await inner.complete(timeoutMs ? { ...req, signal: AbortSignal.timeout(timeoutMs) } : req);
        } catch (e) {
          if (answeredWithError(e)) await this.release(day, estimate);
          throw e;
        }
        await this.settle(day, estimate, aiCallCostUsd(res));
        return res;
      },
    };
  }
}

export class SpendTurn {
  private admitted = false;
  private readonly deadline: number | null;

  constructor(
    private readonly guard: SpendGuard,
    readonly userId: string,
  ) {
    this.deadline = guard.turnMs === null ? null : Date.now() + guard.turnMs;
  }

  /** The read-only look of `SpendGuard.blocked`, for this message (once counted, only the budget can block it). */
  blocked(): Promise<SpendBlock | null> {
    return this.guard.blocked(this.userId, this.admitted);
  }

  /** What is left of the turn's time, as a signal for the provider (undefined without a deadline). */
  private signal(): AbortSignal | undefined {
    if (this.deadline === null) return undefined;
    return AbortSignal.timeout(Math.max(this.deadline - Date.now(), 1));
  }

  /**
   * One paid call: reserve its estimate (and, the first time, count the message under the user's cap), make it, then
   * settle to what it cost. A call the provider refused with an error status gives its reservation back; one whose
   * outcome is unknown (a timeout, a dropped connection) keeps it.
   */
  private async paid<T>(rawEstimate: number, call: (signal: AbortSignal | undefined) => Promise<T>, actual: (r: T) => number): Promise<T> {
    // the store keeps whole micro-dollars (numeric(12, 6)): a reservation rounded there but settled with the unrounded
    // amount could leave a micro-dollar behind, so the estimate is rounded up once and used for both
    const estimate = Math.ceil(rawEstimate * 1e6 - 1e-6) / 1e6;
    const day = await this.guard.reserve(estimate);
    if (!this.admitted) {
      try {
        await this.guard.admitUser(this.userId, day);
      } catch (e) {
        await this.guard.release(day, estimate);
        throw e;
      }
      this.admitted = true;
    }
    let result: T;
    try {
      result = await call(this.signal());
    } catch (e) {
      if (answeredWithError(e)) await this.guard.release(day, estimate);
      throw e;
    }
    await this.guard.settle(day, estimate, actual(result));
    return result;
  }

  ai(inner: AiProvider): AiProvider {
    return {
      name: inner.name,
      complete: (req: CompletionRequest) =>
        this.paid(
          aiCallEstimateUsd(req),
          (signal) => inner.complete(signal ? { ...req, signal } : req),
          (res) => aiCallCostUsd(res),
        ),
    };
  }

  stt(inner: SttProvider): SttProvider {
    return {
      name: inner.name,
      transcribe: (audio: AudioInput, opts?: TranscribeOptions) =>
        this.paid(
          sttCallEstimateUsd(audio.bytes.length),
          (signal) => inner.transcribe(audio, signal ? { ...opts, signal } : opts),
          (t) => sttCallCostUsd(t, audio.bytes.length),
        ),
    };
  }
}

/** The guard for this deployment's env, or null when nothing paid is guarded (see `spendLimits`). */
export function spendGuardFromEnv(db: Db, source: Record<string, string | undefined> = process.env): SpendGuard | null {
  const limits = spendLimits(source);
  return limits ? new SpendGuard(db, limits, { turnMs: limits.demo ? DEMO_TURN_MS : undefined }) : null;
}
