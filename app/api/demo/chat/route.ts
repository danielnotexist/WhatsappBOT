import { connection } from "next/server";
import { getSession } from "@/lib/auth/current-user";
import { botContext } from "@/lib/bot/handle-inbound";
import { awaitingAnswer } from "@/lib/bot/onboarding";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import type { UserRow } from "@/lib/db/types";
import { chatHistory, chatLinked, runChat, type ChatInput } from "@/lib/demo-chat/service";
import { DEMO_CHAT_AUDIO_TYPES, DEMO_CHAT_LIMITS, DEMO_CHAT_RATE, type ChatErrorResponse, type ChatHistoryResponse, type ChatPostResponse } from "@/lib/demo-chat/types";
import { isDemo, webChatFlag } from "@/lib/demo";
import { EnvError, aiMocked, liveAiInDemo } from "@/lib/env";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/same-origin";
import { oggOpusDurationMs } from "@/lib/stt/ogg";
import { webmDurationMs } from "@/lib/stt/webm";

/** A model turn with tools, or a recording plus its transcription, can take a while. */
export const maxDuration = 60;

const MESSAGES: Record<ChatErrorResponse["code"], string> = {
  not_found: "הדף לא נמצא.",
  unauthorized: `צריך להתחבר כדי לדבר עם ${BRAND.name} כאן.`,
  rate_limited: "הרבה הודעות ברצף. אפשר לנסות שוב בעוד דקה.",
  bad_request: "ההודעה ריקה או לא תקינה.",
  too_large: `ההקלטה ארוכה מדי. אפשר להקליט עד ${DEMO_CHAT_LIMITS.audioSeconds} שניות.`,
  too_long: `ההודעה ארוכה מדי. אפשר עד ${DEMO_CHAT_LIMITS.textChars.toLocaleString("he-IL")} תווים.`,
  forbidden: "אין הרשאה.",
  blocked: "אין הרשאה.",
  not_linked: "כדי לדבר כאן, צריך קודם לחבר את הוואטסאפ לחשבון מהאזור האישי.",
  server_error: "משהו נתקע בדרך. אפשר לנסות שוב.",
};

const STATUS: Record<ChatErrorResponse["code"], number> = {
  not_found: 404,
  unauthorized: 401,
  rate_limited: 429,
  bad_request: 400,
  too_large: 413,
  too_long: 400,
  forbidden: 403,
  blocked: 403,
  not_linked: 409,
  server_error: 500,
};

const NO_STORE = { "cache-control": "no-store" };

function fail(code: ChatErrorResponse["code"], message: string = MESSAGES[code], status: number = STATUS[code]): Response {
  return Response.json({ ok: false, code, message } satisfies ChatErrorResponse, { status, headers: NO_STORE });
}

/**
 * DEMO_MODE, or WEB_CHAT=1 outside it; signed-in only: the user, or the response to return (404 when neither is on,
 * 401 without a session). Outside the demo the chat runs on the account's own linked WhatsApp number only.
 */
async function demoUser(): Promise<UserRow | Response> {
  if (!isDemo() && !webChatFlag()) return fail("not_found");
  const session = await getSession();
  if (!session) return fail("unauthorized");
  const user = await getDb().getUser(session.userId);
  return user ?? fail("unauthorized");
}

/**
 * GET /api/demo/chat — the history of the signed-in person's chat with עלזה (their own messages only).
 * 200 ChatHistoryResponse · 401 without a session · 404 outside DEMO_MODE.
 */
export async function GET() {
  await connection();
  const user = await demoUser();
  if (user instanceof Response) return user;
  const db = getDb();
  const demo = isDemo();
  const [linked, items] = await Promise.all([chatLinked(db, user.id, { virtual: demo }), chatHistory(db, user.id)]);
  return Response.json({ ok: true, linked, liveAi: demo ? liveAiInDemo() : !aiMocked(), awaiting: awaitingAnswer(user), items } satisfies ChatHistoryResponse, { headers: NO_STORE });
}

/**
 * POST /api/demo/chat — one message to the same pipeline as WhatsApp (lib/bot/process-inbound.ts), from the person's
 * own virtual number (linked on first use, with the usual welcome and onboarding). Bodies:
 *   JSON { start: true }                                  — start the chat (link + welcome), idempotent
 *   JSON { text }                                         — a typed message (up to 2,000 characters)
 *   JSON { reply: { id, title, list? } }                  — a button / list reply; only ids that are the person's own
 *   multipart audio=<webm|ogg|mp4>, durationMs           — a recording (up to a minute / 512 KB), transcribed like a voice note
 * 200 ChatPostResponse (the person's message as stored + the bot's replies) · 400/401/403/404/413/429 ChatErrorResponse.
 */
export async function POST(request: Request) {
  const user = await demoUser();
  if (user instanceof Response) return user;
  if (!sameOrigin(request)) return fail("forbidden");
  const limiter = getRateLimiter();
  if (!limiter.hit(`demo-chat:user:${user.id}`, DEMO_CHAT_RATE.perUser, DEMO_CHAT_RATE.windowMs) || !limiter.hit(`demo-chat:ip:${clientIp(request.headers)}`, DEMO_CHAT_RATE.perIp, DEMO_CHAT_RATE.windowMs)) {
    return fail("rate_limited");
  }

  const parsed = await parseInput(request);
  if (parsed instanceof Response) return parsed;

  try {
    const base = getDb();
    const out = await runChat({ base, user, input: parsed, makeCtx: ({ db, wa }) => botContext({ db, wa }), virtual: isDemo() });
    if (!out.ok) return fail(out.code, out.message);
    return Response.json({ ok: true, user: out.user, replies: out.replies, awaiting: out.awaiting } satisfies ChatPostResponse, { headers: NO_STORE });
  } catch (e) {
    console.error("[demo-chat] failed:", (e as Error).message); // an EnvError names the missing variables: the log only
    if (e instanceof EnvError) return fail("server_error", MESSAGES.server_error, 503);
    return fail("server_error");
  }
}

/** Room for the multipart framing and the durationMs field around the recording. */
const FORM_OVERHEAD_BYTES = 16 * 1024;

/**
 * The body, read up to `max` bytes — never buffered past it, whatever Content-Length says (or a chunked upload that
 * has none). null when it is longer.
 */
async function readLimited(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The recording's length when the container tells it (Ogg/Opus, WebM); null for mp4 — bounded by the size. */
function measuredDurationMs(bytes: Uint8Array, mimeType: string): number | null {
  if (mimeType === "audio/ogg") return oggOpusDurationMs(bytes);
  if (mimeType === "audio/webm") return webmDurationMs(bytes);
  return null;
}

async function parseInput(request: Request): Promise<ChatInput | null | Response> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const raw = await readLimited(request, DEMO_CHAT_LIMITS.audioBytes + FORM_OVERHEAD_BYTES).catch(() => null);
    if (!raw) return fail("too_large");
    const form = await new Response(raw, { headers: { "content-type": type } }).formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof Blob) || file.size === 0) return fail("bad_request");
    if (file.size > DEMO_CHAT_LIMITS.audioBytes) return fail("too_large");
    const mimeType = file.type.split(";")[0]!.trim().toLowerCase();
    if (!(DEMO_CHAT_AUDIO_TYPES as readonly string[]).includes(mimeType)) return fail("bad_request", "סוג ההקלטה לא נתמך.");
    const maxMs = DEMO_CHAT_LIMITS.audioSeconds * 1000;
    const said = Number(form?.get("durationMs") ?? 0);
    if (Number.isFinite(said) && said > maxMs + 1500) return fail("too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const measured = measuredDurationMs(bytes, mimeType);
    if (measured !== null && measured > maxMs + 1500) return fail("too_large");
    const durationMs = measured ?? (Number.isFinite(said) && said > 0 ? Math.min(Math.round(said), maxMs) : null);
    return { kind: "audio", bytes, mimeType: file.type || mimeType, durationMs };
  }

  const body = (await request.json().catch(() => null)) as { start?: unknown; text?: unknown; reply?: unknown } | null;
  if (!body || typeof body !== "object") return fail("bad_request");
  if (body.start === true) return null;
  if (typeof body.text === "string") {
    const text = body.text.trim();
    if (!text) return fail("bad_request");
    if (text.length > DEMO_CHAT_LIMITS.textChars) return fail("too_long");
    return { kind: "text", text };
  }
  const reply = body.reply as { id?: unknown; title?: unknown; list?: unknown } | undefined;
  if (reply && typeof reply.id === "string" && typeof reply.title === "string" && reply.id && reply.title.trim() && reply.title.length <= 100) {
    return { kind: "reply", id: reply.id, title: reply.title.trim(), list: reply.list === true };
  }
  return fail("bad_request");
}
