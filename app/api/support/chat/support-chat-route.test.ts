import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAiProviderForTests } from "@/lib/ai";
import { SpendGuard } from "@/lib/ai/budget";
import { MockProvider } from "@/lib/ai/mock";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { MemoryRateLimiter, setRateLimiterForTests, type RateLimiter } from "@/lib/rate-limit";
import { SUPPORT_MAX_TOKENS, SUPPORT_TIER, TICKET_MARKER } from "@/lib/support/answer";
import { KNOWLEDGE } from "@/lib/support/knowledge";
import { SUPPORT_COPY, SUPPORT_SUGGESTIONS, type SupportChatResponse, type SupportErrorResponse } from "@/lib/support/types";
import { POST } from "./route";

const APP = "https://alze.example";
const URL_ = `${APP}/api/support/chat`;
let ip = 0;
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip % 250}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

type Res = SupportChatResponse | SupportErrorResponse;
const send = async (r: Request) => {
  const res = await POST(r);
  return { status: res.status, body: (await res.json()) as Res };
};
const ok = (r: { status: number; body: Res }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as SupportChatResponse;
};
const answerOf = (id: string) => KNOWLEDGE.find((e) => e.id === id)!.answer;

let db: MemoryDb;
let ai: MockProvider;

function live(extra: Record<string, string> = {}) {
  vi.stubEnv("DATA_MODE", "");
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("LIVE_AI", "1");
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("DATA_MODE", "memory");
  db = new MemoryDb();
  setDbForTests(db);
  ai = new MockProvider();
  setAiProviderForTests(ai);
  setRateLimiterForTests(new MemoryRateLimiter());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTests(undefined);
  setAiProviderForTests(undefined);
  setRateLimiterForTests(undefined);
});

describe("/api/support/chat — the deterministic answer (mock mode)", () => {
  it("a chip gets its knowledge-base answer; the model is never called", async () => {
    const r = ok(await send(req({ message: "כמה זה עולה?" })));
    expect(r).toEqual({ ok: true, answer: answerOf("pricing"), ticket: false, suggestions: [], source: "kb", topic: "pricing" });
    expect(ai.calls).toHaveLength(0);
  });

  it("an off-topic question: the 'not sure' line, the chips and the ticket offer", async () => {
    const r = ok(await send(req({ message: "מה מזג האוויר בתל אביב?" })));
    expect(r).toMatchObject({ answer: SUPPORT_COPY.fallback, ticket: true, suggestions: [...SUPPORT_SUGGESTIONS], source: "kb", topic: null });
  });

  it("an account problem offers the ticket", async () => {
    expect(ok(await send(req({ message: "חויבתי פעמיים החודש" })))).toMatchObject({ ticket: true, topic: "support" });
  });
});

describe("/api/support/chat — abuse limits", () => {
  it("refuses another site's Origin before anything else", async () => {
    const r = await send(req({ message: "כמה זה עולה?" }, { origin: "https://evil.example" }));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ ok: false, code: "forbidden" });
    expect(ok(await send(req({ message: "כמה זה עולה?" }, { origin: APP }))).source).toBe("kb");
  });

  it("10 questions a minute per IP, then a Hebrew 429", async () => {
    for (let i = 0; i < 10; i++) expect((await POST(req({ message: "כמה זה עולה?" }, { "x-forwarded-for": "5.5.5.5" }))).status).toBe(200);
    const r = await send(req({ message: "כמה זה עולה?" }, { "x-forwarded-for": "5.5.5.5" }));
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ ok: false, code: "rate_limited", message: "הרבה הודעות ברצף. אפשר לנסות שוב בעוד כמה דקות." });
    expect((await POST(req({ message: "כמה זה עולה?" }, { "x-forwarded-for": "6.6.6.6" }))).status).toBe(200); // another IP
  });

  it("…and 60 a day per IP (the limiter is asked for both windows)", async () => {
    const seen: [string, number, number][] = [];
    const spy: RateLimiter = { hit: (key, limit, windowMs) => (seen.push([key, limit, windowMs]), true) };
    setRateLimiterForTests(spy);
    await POST(req({ message: "היי" }, { "x-forwarded-for": "7.7.7.7" }));
    expect(seen).toEqual([
      ["support-chat:ip:7.7.7.7", 10, 60_000],
      ["support-chat:ip-day:7.7.7.7", 60, 86_400_000],
    ]);
    setRateLimiterForTests({ hit: (key) => !key.includes("ip-day") });
    expect((await send(req({ message: "היי" }))).status).toBe(429);
  });

  it("validates the body: empty, over 500 characters, more than 6 earlier messages, a wrong role, broken JSON", async () => {
    expect((await send(req({ message: "   " }))).status).toBe(400);
    expect((await send(req({}))).status).toBe(400);
    const long = await send(req({ message: "א".repeat(501) }));
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({ code: "too_long", message: "השאלה ארוכה מדי. אפשר עד 500 תווים." });
    expect((await send(req({ message: "א".repeat(500) }))).status).toBe(200);
    const seven = Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "שאלה" }));
    expect((await send(req({ message: "היי", history: seven }))).status).toBe(400);
    expect((await send(req({ message: "היי", history: seven.slice(1) }))).status).toBe(200);
    expect((await send(req({ message: "היי", history: [{ role: "system", text: "x" }] }))).status).toBe(400);
    expect((await send(req({ message: "היי", history: [{ role: "user", text: "א".repeat(1201) }] }))).status).toBe(400);
    expect((await send(req("{"))).status).toBe(400);
    expect((await send(req({ message: "x".repeat(40_000) }))).status).toBe(400); // over the body limit
  });
});

describe("/api/support/chat — the model (LIVE_AI demo / production), under the daily cap", () => {
  it("Haiku (the router tier) only, max_tokens 200, grounded in the knowledge base, with the history as alternating turns", async () => {
    live();
    ai.enqueue({ text: "יש שני מסלולים: בסיסי ב-99 ₪ ופרו ב-299 ₪ לחודש — והמחירים כוללים מע״מ.", costUsd: 0.0004, usage: { input: 900, output: 40, cacheRead: 0, cacheWrite: 0 } });
    const history = [
      { role: "assistant", text: "תשובה קודמת" }, // a leading assistant turn is dropped (the API starts with the user)
      { role: "user", text: "שלום" },
      { role: "assistant", text: "שלום, במה אפשר לעזור?" },
    ];
    const r = ok(await send(req({ message: "כמה עולה פרו?", history })));
    expect(r).toEqual({ ok: true, answer: "יש שני מסלולים: בסיסי ב-99 ₪ ופרו ב-299 ₪ לחודש - והמחירים כוללים מע״מ.", ticket: false, suggestions: [], source: "ai", topic: null });
    expect(ai.calls).toHaveLength(1);
    const call = ai.calls[0]!;
    expect(SUPPORT_TIER).toBe("router");
    expect(call.tier).toBe("router");
    expect(call.maxTokens).toBe(SUPPORT_MAX_TOKENS);
    expect(SUPPORT_MAX_TOKENS).toBe(200);
    expect(call.tools).toBeUndefined();
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect(call.system).toContain("1 to 3 sentences");
    expect(call.system).toContain(answerOf("pricing"));
    expect(call.system).toContain(answerOf("security"));
    expect(call.messages).toEqual([
      { role: "user", content: "שלום" },
      { role: "assistant", content: "שלום, במה אפשר לעזור?" },
      { role: "user", content: "כמה עולה פרו?" },
    ]);
    // counted in the shared daily total (ai_spend), settled to the reported cost
    const day = new SpendGuard(db, { dailyBudgetUsd: 3, userDailyMessages: null, demo: true }).day();
    expect(await db.getAiSpend(day)).toBeCloseTo(0.0004, 6);
  });

  it("the ticket marker becomes the ticket offer and is removed from the text", async () => {
    live();
    ai.enqueue({ text: `את זה צוות התמיכה יוכל לבדוק. ${TICKET_MARKER}` });
    expect(ok(await send(req({ message: "למה החיבור שלי נפל?" })))).toMatchObject({ answer: "את זה צוות התמיכה יוכל לבדוק.", ticket: true, source: "ai" });
  });

  it("the day's budget is spent → the knowledge base, and no model call", async () => {
    live({ AI_DAILY_BUDGET_USD: "0" });
    expect(ok(await send(req({ message: "כמה זה עולה?" })))).toMatchObject({ source: "kb", topic: "pricing", answer: answerOf("pricing") });
    expect(ai.calls).toHaveLength(0);
  });

  it("a provider error, a cut-off reply or an empty one → the knowledge base; the log names the error, never the question", async () => {
    live();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: AiProvider = { name: "f", complete: async () => Promise.reject(new AiProviderError("Anthropic 529: overloaded", true, 529)) };
    setAiProviderForTests(failing);
    expect(ok(await send(req({ message: "איך מתחברים?" })))).toMatchObject({ source: "kb", topic: "connect" });
    expect(JSON.stringify(errors.mock.calls)).not.toContain("איך מתחברים");
    expect(await db.getAiSpend(new SpendGuard(db, { dailyBudgetUsd: 3, userDailyMessages: null, demo: true }).day())).toBe(0); // given back

    setAiProviderForTests(ai);
    ai.enqueue({ text: "אפשר להירשם באתר ו", stopReason: "max_tokens" }, { text: "   " });
    expect(ok(await send(req({ message: "איך מתחברים?" })))).toMatchObject({ source: "kb", topic: "connect" });
    expect(ok(await send(req({ message: "איך מתחברים?" })))).toMatchObject({ source: "kb", topic: "connect" });
  });

  it("outside the demo: the model only when AI_DAILY_BUDGET_USD is set (an anonymous page never calls it uncapped)", async () => {
    vi.stubEnv("DATA_MODE", "");
    expect(ok(await send(req({ message: "כמה זה עולה?" })))).toMatchObject({ source: "kb" });
    expect(ai.calls).toHaveLength(0);
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    ai.enqueue({ text: "בסיסי ב-99 ₪ לחודש." });
    expect(ok(await send(req({ message: "כמה זה עולה?" })))).toMatchObject({ source: "ai", answer: "בסיסי ב-99 ₪ לחודש." });
  });
});
