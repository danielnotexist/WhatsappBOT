import { z } from "zod";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/same-origin";
import { supportAnswer } from "@/lib/support/answer";
import { NO_STORE, readJson, supportFail } from "@/lib/support/http";
import { SUPPORT_COPY, SUPPORT_LIMITS, SUPPORT_RATE, type SupportChatResponse } from "@/lib/support/types";

/** One short model call at most (lib/support/answer.ts SUPPORT_AI_TIMEOUT_MS), or none. */
export const maxDuration = 30;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** The body: a question, up to six earlier messages and the JSON framing. */
const MAX_BODY_BYTES = 32 * 1024;

const turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(SUPPORT_LIMITS.historyChars) });
const body = z.object({
  message: z.string().trim().min(1),
  history: z.array(turn).max(SUPPORT_LIMITS.historyTurns).optional().default([]),
});

/**
 * POST /api/support/chat — one question to the website's support chat ("שאלות ותמיכה"). No sign-in.
 * Body `{ message, history? }`: the question (up to 500 characters) and at most the last six messages of the chat
 * (`{ role: "user" | "assistant", text }`, kept by the page — the server stores nothing).
 * 200 SupportChatResponse · 400 bad_request / too_long · 403 another site's Origin · 429 over 10 a minute or 60 a day
 * per IP. The answer: lib/support/answer.ts (the model from the knowledge base under the daily cap, or the
 * deterministic matcher). The conversation is never logged.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return supportFail("forbidden");
  const ip = clientIp(request.headers);
  const limiter = getRateLimiter();
  if (!limiter.hit(`support-chat:ip:${ip}`, SUPPORT_RATE.chatPerMinute, MINUTE) || !limiter.hit(`support-chat:ip-day:${ip}`, SUPPORT_RATE.chatPerDay, DAY)) {
    return supportFail("rate_limited");
  }

  const parsed = body.safeParse(await readJson(request, MAX_BODY_BYTES));
  if (!parsed.success) return supportFail("bad_request");
  const { message, history } = parsed.data;
  if (message.length > SUPPORT_LIMITS.messageChars) return supportFail("too_long", SUPPORT_COPY.tooLong);

  try {
    const answer = await supportAnswer(message, history);
    return Response.json(answer satisfies SupportChatResponse, { headers: NO_STORE });
  } catch (e) {
    console.error("[support-chat] failed:", (e as Error).name);
    return supportFail("server_error");
  }
}
