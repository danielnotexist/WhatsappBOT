import { describe, expect, it } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { liveCopy } from "@/lib/copy/bot-live";
import { MemoryDb } from "@/lib/db/memory";
import { EnvError } from "@/lib/env";
import { MockStt } from "@/lib/stt/mock";
import { zonedToUtc } from "@/lib/time/zoned";
import { BudgetExceededError, SpendGuard, aiCallCostUsd, spendGuardFromEnv, spendLimits, sttCallCostUsd, type SpendLimits } from "./budget";
import { MockProvider } from "./mock";

const KEY = Buffer.alloc(32, 4).toString("base64");
const demo = (extra: Record<string, string> = {}) => ({ DEMO_MODE: "1", TOKEN_ENC_KEY: KEY, ...extra });
const usage = { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 };
const CAP_DAY = "הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר.";

describe("spendLimits — where the caps apply", () => {
  it("the demo with LIVE_AI=1: $3 a day and 60 messages per user by default; both can be set", () => {
    expect(spendLimits(demo({ LIVE_AI: "1" }))).toEqual({ dailyBudgetUsd: 3, userDailyMessages: 60, demo: true });
    expect(spendLimits(demo({ LIVE_AI: "true", AI_DAILY_BUDGET_USD: "1.5", DEMO_USER_DAILY_MESSAGES: "10" }))).toEqual({ dailyBudgetUsd: 1.5, userDailyMessages: 10, demo: true });
    expect(spendLimits(demo({ LIVE_AI: "1", AI_DAILY_BUDGET_USD: "", DEMO_USER_DAILY_MESSAGES: " " }))).toEqual({ dailyBudgetUsd: 3, userDailyMessages: 60, demo: true });
    expect(spendLimits(demo({ LIVE_AI: "1", AI_DAILY_BUDGET_USD: "0" }))!.dailyBudgetUsd).toBe(0); // a kill switch
  });

  it("no guard in the mock demo or a plain deployment; outside the demo only an explicit budget, no per-user cap", () => {
    expect(spendLimits(demo())).toBeNull();
    expect(spendLimits(demo({ AI_DAILY_BUDGET_USD: "5" }))).toBeNull(); // the mock demo pays nothing
    expect(spendLimits({ ANTHROPIC_API_KEY: "x" })).toBeNull();
    expect(spendLimits({ LIVE_AI: "1" })).toBeNull();
    expect(spendLimits({ AI_DAILY_BUDGET_USD: "20", DEMO_USER_DAILY_MESSAGES: "5" })).toEqual({ dailyBudgetUsd: 20, userDailyMessages: null, demo: false });
  });

  it("an invalid value fails fast in Hebrew, naming the variable", () => {
    const thrown = (env: Record<string, string>) => {
      try {
        spendLimits(env);
      } catch (e) {
        return e as EnvError;
      }
      throw new Error("should have thrown");
    };
    const e = thrown(demo({ LIVE_AI: "1", AI_DAILY_BUDGET_USD: "שלושה", DEMO_USER_DAILY_MESSAGES: "2.5" }));
    expect(e).toBeInstanceOf(EnvError);
    expect(e.missing).toEqual(["AI_DAILY_BUDGET_USD", "DEMO_USER_DAILY_MESSAGES"]);
    expect(e.message).toContain("משתני סביבה חסרים או לא תקינים");
    expect(thrown({ AI_DAILY_BUDGET_USD: "-1" }).missing).toEqual(["AI_DAILY_BUDGET_USD"]);
    expect(spendGuardFromEnv(new MemoryDb(), demo())).toBeNull();
    expect(spendGuardFromEnv(new MemoryDb(), demo({ LIVE_AI: "1" }))).toBeInstanceOf(SpendGuard);
  });
});

describe("cost of a call", () => {
  it("uses the provider's figure, else the highest known price; STT: usage.cost, else by length", () => {
    expect(aiCallCostUsd({ costUsd: 0.0042, usage })).toBe(0.0042);
    // unknown model → priced as claude-opus-5-5 ($4 in / $20 out per 1M): 1000 × 4 + 200 × 20 = 8000 / 1M
    expect(aiCallCostUsd({ costUsd: null, usage })).toBeCloseTo(0.008, 9);
    expect(sttCallCostUsd({ costUsd: 0.000301, durationMs: 4000 })).toBe(0.000301);
    expect(sttCallCostUsd({ costUsd: null, durationMs: 120_000 })).toBeCloseTo(0.02, 9);
    expect(sttCallCostUsd({ costUsd: undefined, durationMs: 1000 })).toBe(0.001);
    expect(sttCallCostUsd({ costUsd: null, durationMs: null })).toBe(0.01);
  });
});

describe("SpendGuard + the pipeline", () => {
  const LIMITS: SpendLimits = { dailyBudgetUsd: 0.05, userDailyMessages: 3, demo: true };

  async function setup(limits: SpendLimits = LIMITS, start = zonedToUtc({ year: 2026, month: 10, day: 22, hour: 12, minute: 0 }, "Asia/Jerusalem")) {
    const h = makeHarness(start);
    const guard = new SpendGuard(h.db, limits, h.ctx.now);
    h.ctx.spend = guard;
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    return { h, guard, user };
  }

  it("records what each call cost under the Jerusalem day, and counts the message once", async () => {
    const { h, guard, user } = await setup();
    // router (not simple) → strong: two calls, one message
    h.ai.enqueue({ text: '{"intent":"other","complexity":"tool","needs_tools":false,"reply":null}', costUsd: 0.001 }, { text: "בסדר.", costUsd: 0.004 });
    expect((await processInbound(h.ctx, h.inbound("מה המצב עם הדוח?"))).note).toBe("replied");
    expect(h.ai.calls).toHaveLength(2);
    expect(guard.day()).toBe("2026-10-22");
    expect(await h.db.getAiSpend("2026-10-22")).toBeCloseTo(0.005, 9);
    expect(h.db.aiSpend.get("2026-10-22")!.calls).toBe(2);
    expect(await h.db.getAiUserMessages("2026-10-22", user.id)).toBe(1);
  });

  it("the day's budget reached → one calm line, no model call, and the trial does not count the message", async () => {
    const { h, user } = await setup();
    await h.db.addAiSpend("2026-10-22", 0.05);
    const r = await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(r.note).toBe("ai cap: budget");
    expect(h.ai.calls).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(CAP_DAY);
    expect(liveCopy["budget.daily_cap_demo"]()).toBe(CAP_DAY);
    expect((await h.db.getCurrentUsage(user.id))?.counted_messages ?? 0).toBe(0);
    // the line is stored like any reply (the chat history shows it)
    expect((await h.db.recentMessages(user.id, 1))[0]).toMatchObject({ direction: "out", text: CAP_DAY });
  });

  it("the budget runs out in the middle of a message → the next call is not made", async () => {
    const { h } = await setup();
    h.ai.enqueue({ text: '{"intent":"other","complexity":"tool","needs_tools":false,"reply":null}', costUsd: 0.06 });
    const r = await processInbound(h.ctx, h.inbound("תכין לי סיכום של השבוע"));
    expect(r.note).toBe("ai cap: budget");
    expect(h.ai.calls).toHaveLength(1); // the router ran; the strong model was never called
    expect(h.wa.texts.at(-1)).toBe(CAP_DAY);
  });

  it("the per-user cap: 3 messages a day, the 4th gets the line; another user and the next day are not affected", async () => {
    const { h, user } = await setup();
    for (const t of ["תודה", "היי", "סבבה"]) expect((await processInbound(h.ctx, h.inbound(t))).note).toBe("replied");
    const callsBefore = h.ai.calls.length;
    const r = await processInbound(h.ctx, h.inbound("עוד שאלה"));
    expect(r.note).toBe("ai cap: user_messages");
    expect(h.ai.calls).toHaveLength(callsBefore);
    expect(h.wa.texts.at(-1)).toBe("הגענו ל-3 הודעות היום, המכסה של גרסת הבדיקה. אפשר להמשיך מחר.");
    expect(await h.db.getAiUserMessages("2026-10-22", user.id)).toBe(3);

    // another user on the same day
    const other = await h.db.createUser("noa@example.com");
    await h.db.mergeUserProfile(other.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(other.id, "+972509999999");
    expect((await processInbound(h.ctx, h.inbound("תודה", { from: "972509999999", fromE164: "+972509999999" }))).note).toBe("replied");

    // midnight in Jerusalem (21:00 UTC in October) → a new day
    h.advance(12 * 3_600_000);
    expect((await processInbound(h.ctx, h.inbound("בוקר טוב"))).note).toBe("replied");
    expect(await h.db.getAiUserMessages("2026-10-23", user.id)).toBe(1);
  });

  it("messages that need no paid call are not counted (buttons, onboarding, 'כניסה')", async () => {
    const { h, user } = await setup();
    await processInbound(h.ctx, h.inbound("כניסה"));
    expect(await h.db.getAiUserMessages("2026-10-22", user.id)).toBe(0);
    expect(h.ai.calls).toHaveLength(0);
  });

  it("voice notes: the cap answers before 'מקשיבה…' and the STT is never called; under the cap STT and model share one message", async () => {
    const { h, user } = await setup({ dailyBudgetUsd: 1, userDailyMessages: 1, demo: true });
    const stt = new MockStt();
    h.ctx.stt = () => stt;
    h.wa.media.set("media-1", { bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53]), mimeType: "audio/ogg; codecs=opus" });
    const voice = () => h.inbound(null as unknown as string, { type: "audio", text: null, mediaId: "media-1", mimeType: "audio/ogg; codecs=opus" });
    stt.enqueue({ text: "תודה", costUsd: 0.0003 });
    expect((await processInbound(h.ctx, voice())).note).toBe("replied");
    expect(await h.db.getAiUserMessages("2026-10-22", user.id)).toBe(1); // STT + router = one message
    expect(await h.db.getAiSpend("2026-10-22")).toBeCloseTo(0.0003, 9);

    const sent = h.wa.texts.length;
    expect((await processInbound(h.ctx, voice())).note).toBe("ai cap: user_messages");
    expect(stt.calls).toHaveLength(1);
    expect(h.wa.texts.slice(sent)).toEqual(["הגענו ל-1 הודעות היום, המכסה של גרסת הבדיקה. אפשר להמשיך מחר."]);
  });

  it("a guard error before the call fails the message (fail closed); a failed spend write never fails the answer", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("x@example.com");
    const guard = new SpendGuard(db, { dailyBudgetUsd: 1, userDailyMessages: 5, demo: true });
    const ai = new MockProvider();
    db.addAiSpend = async () => {
      throw new Error("db down");
    };
    const wrapped = guard.turn(user.id).ai(ai);
    await expect(wrapped.complete({ tier: "router", system: "", messages: [{ role: "user", content: "תודה" }] })).resolves.toMatchObject({ model: "mock-router" });
    db.getAiSpend = async () => {
      throw new Error("db down");
    };
    await expect(guard.turn(user.id).ai(ai).complete({ tier: "router", system: "", messages: [] })).rejects.toThrow("db down");
    expect(ai.calls).toHaveLength(1);
    await expect(new SpendGuard(db, { dailyBudgetUsd: 0, userDailyMessages: null, demo: false }).assertBudget()).rejects.toBeInstanceOf(Error);
  });

  it("outside the demo (AI_DAILY_BUDGET_USD only): the general wording, and no per-user count", async () => {
    const { h, user } = await setup({ dailyBudgetUsd: 0, userDailyMessages: null, demo: false });
    const r = await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(r.note).toBe("ai cap: budget");
    expect(h.wa.texts.at(-1)).toBe("הגענו לתקרת השימוש של היום. אפשר להמשיך מחר.");
    expect(await h.db.getAiUserMessages("2026-10-22", user.id)).toBe(0);
    const err = new BudgetExceededError("budget", false);
    expect(err.message).toBe("daily AI budget reached");
  });
});

describe("MemoryDb mirror of migration 0009", () => {
  it("adds up per day, never goes down, admits under the cap only, and drops the counts with the user", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@example.com");
    expect(await db.getAiSpend("2026-10-22")).toBe(0);
    expect(await db.addAiSpend("2026-10-22", 0.0123)).toBe(0.0123);
    expect(await db.addAiSpend("2026-10-22", 0.5)).toBe(0.5123);
    expect(await db.addAiSpend("2026-10-22", -1)).toBe(0.5123);
    expect(await db.admitAiUserMessage("2026-10-22", user.id, 2)).toBe(1);
    expect(await db.admitAiUserMessage("2026-10-22", user.id, 2)).toBe(2);
    expect(await db.admitAiUserMessage("2026-10-22", user.id, 2)).toBe(-1);
    expect(await db.admitAiUserMessage("2026-10-22", user.id, 0)).toBe(-1);
    expect(await db.getAiUserMessages("2026-10-22", user.id)).toBe(2);
    await expect(db.admitAiUserMessage("2026-10-22", "00000000-0000-4000-8000-000000000000", 5)).rejects.toThrow(/unknown user/);
    await db.deleteUser(user.id);
    expect(await db.getAiUserMessages("2026-10-22", user.id)).toBe(0);
    expect(await db.getAiSpend("2026-10-22")).toBe(0.5123);
  });
});
