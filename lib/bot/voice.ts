import { BudgetExceededError } from "@/lib/ai/budget";
import { copy } from "@/lib/copy/bot";
import { budgetReply } from "@/lib/copy/bot-live";
import { copyM5 } from "@/lib/copy/bot-m5";
import { oggOpusDurationMs } from "@/lib/stt/ogg";
import { WaApiError } from "@/lib/wa/client";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";

/** err.media_too_large: up to 20MB */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
/** err.voice_too_long: a longer recording is not sent to the paid STT (an Opus note of 20MB can run for hours) */
export const MAX_VOICE_MS = 5 * 60_000;
/** proc.transcript_echo: only for long (> 20 s) or low-confidence recordings (confidence only when the provider reports it — Soniox) */
export const ECHO_MIN_DURATION_MS = 20_000;
export const ECHO_MAX_CONFIDENCE = 0.75;

export type VoiceResult = { ok: true; transcript: string } | { ok: false; note: string };

/**
 * A WhatsApp voice note (OGG/Opus): "מקשיבה…" → download the media → STT (Hebrew) → transcript stored on the
 * inbound message row → the caller continues with the transcript as if it were typed. Failures answer in
 * Hebrew and stop here (an error reply is not counted against the trial — PLAN §3).
 */
export async function transcribeVoiceNote(ctx: BotContext, userId: string, msg: InboundMessage, storedMessageId: string): Promise<VoiceResult> {
  const to = msg.fromE164;
  const fail = async (note: string, text: string = copyM5["err.transcription_failed"]()): Promise<VoiceResult> => {
    await ctx.wa.sendText(to, text);
    await ctx.db.insertMessage({ user_id: userId, direction: "out", type: "text", text });
    return { ok: false, note };
  };
  if (!ctx.stt || !msg.mediaId) return fail("audio without media id / stt");

  // processing state (not stored, not counted — bot-copy.md §3)
  await ctx.wa.sendText(to, copy["proc.listening"]()).catch(() => undefined);

  let audio: { bytes: Uint8Array; mimeType: string };
  try {
    audio = await ctx.wa.downloadMedia(msg.mediaId, MAX_AUDIO_BYTES);
  } catch (e) {
    if (e instanceof WaApiError && e.status === 413) return fail("audio too large", copy["err.media_too_large"]());
    console.error("[voice] media download failed:", (e as Error).message);
    return fail("audio download failed");
  }
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) return fail("audio too large", copy["err.media_too_large"]());
  const knownLength = oggOpusDurationMs(audio.bytes);
  if (knownLength !== null && knownLength > MAX_VOICE_MS) return fail("audio too long", copyM5["err.voice_too_long"](MAX_VOICE_MS / 60_000));

  let text: string;
  let durationMs: number | null = null;
  let confidence: number | null = null;
  let stt: { model: string; costUsd: number | null };
  try {
    const t = await ctx.stt().transcribe({ bytes: audio.bytes, mimeType: audio.mimeType || msg.mimeType || "audio/ogg" }, { language: "he" });
    text = t.text.trim();
    durationMs = t.durationMs ?? oggOpusDurationMs(audio.bytes); // not every model reports the length
    confidence = t.confidence; // null through OpenRouter: there the echo is by length only
    stt = { model: t.provider, costUsd: t.costUsd ?? null };
  } catch (e) {
    // the daily spend cap was reached (lib/ai/budget.ts): no call was made
    if (e instanceof BudgetExceededError) return fail(`ai cap: ${e.reason}`, budgetReply(e.reason, e.demo, ctx.spend?.limits.userDailyMessages ?? null));
    console.error("[voice] transcription failed:", (e as Error).message);
    return fail("transcription failed");
  }
  if (!text) return fail("empty transcript");

  await ctx.db.setMessageTranscript(storedMessageId, text, stt); // STT spend per message (messages.cost_usd)
  if ((durationMs ?? 0) > ECHO_MIN_DURATION_MS || (confidence !== null && confidence < ECHO_MAX_CONFIDENCE)) {
    await ctx.wa.sendText(to, copy["proc.transcript_echo"](text)).catch(() => undefined);
  }
  return { ok: true, transcript: text };
}
