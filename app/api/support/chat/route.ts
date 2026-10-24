import { z } from "zod";
import { getSession } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { reportError } from "@/lib/errors/report";
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
  /** one id per conversation, made by the page (crypto.randomUUID) */
  chatId: z.uuid().optional(),
  /** the page the chat is open on (path only) */
  page: z.string().max(200).regex(/^\/[^\s?#]*$/).optional(),
});

/** The signed-in person's id (a valid session whose user still exists), or null. */
async function signedInUserId(): Promise<string | null> {
  try {
    const session = await getSession();
    if (!session) return null;
    return (await getDb().getUser(session.userId))?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Keeps the question and the answer (migration 0015 support_chats, the admin panel's "צ'אט באתר") so the support team
 * can help — the widget says so under the field. Best effort: a failure is reported, the answer still goes back.
 */
async function saveTurns(chatId: string, page: string | null, question: string, answer: string): Promise<void> {
  const userId = await signedInUserId();
  const at = new Date().toISOString();
  try {
    await getDb().appendSupportChat(chatId, { userId, page, turns: [{ role: "user", text: question, at }, { role: "assistant", text: answer, at }] });
  } catch (e) {
    await reportError("support.chat", e, { userId });
  }
}

/**
 * POST /api/support/chat — one question to the website's support chat ("שאלות ותמיכה"). No sign-in.
 * Body `{ message, history?, chatId?, page? }`: the question (up to 500 characters), at most the last six messages of the
 * chat (`{ role: "user" | "assistant", text }`, kept by the page and sent as context), the conversation's id and the
 * page. With a chatId the question and the answer are stored (support_chats, linked to the account when signed in;
 * deleted after 180 days).
 * 200 SupportChatResponse · 400 bad_request / too_long · 403 another site's Origin · 429 over 10 a minute or 60 a day
 * per IP. The answer: lib/support/answer.ts (the model from the knowledge base under the daily cap, or the
 * deterministic matcher).
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
  const { message, history, chatId, page } = parsed.data;
  if (message.length > SUPPORT_LIMITS.messageChars) return supportFail("too_long", SUPPORT_COPY.tooLong);

  try {
    const answer = await supportAnswer(message, history);
    if (chatId) await saveTurns(chatId, page ?? null, message, answer.answer);
    return Response.json(answer satisfies SupportChatResponse, { headers: NO_STORE });
  } catch (e) {
    await reportError("support.chat", e);
    return supportFail("server_error");
  }
}
