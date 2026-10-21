import { copy } from "@/lib/copy/bot";
import { copyM5 } from "@/lib/copy/bot-m5";
import { WaApiError } from "@/lib/wa/client";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";

/** err.media_too_large: up to 20MB */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
/** proc.transcript_echo: only for long (> 20 s) or low-confidence recordings */
export const ECHO_MIN_DURATION_MS = 20_000;
export const ECHO_MAX_CONFIDENCE = 0.75;

export type VoiceResult = { ok: true; transcript: string } | { ok: false; note: string };

/**
 * A WhatsApp voice note (OGG/Opus): "מקשיב…" → download the media → STT (Hebrew) → transcript stored on the
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

  let text: string;
  let durationMs: number | null = null;
  let confidence: number | null = null;
  try {
    const t = await ctx.stt().transcribe({ bytes: audio.bytes, mimeType: audio.mimeType || msg.mimeType || "audio/ogg" }, { language: "he" });
    text = t.text.trim();
    durationMs = t.durationMs;
    confidence = t.confidence;
  } catch (e) {
    console.error("[voice] transcription failed:", (e as Error).message);
    return fail("transcription failed");
  }
  if (!text) return fail("empty transcript");

  await ctx.db.setMessageTranscript(storedMessageId, text);
  if ((durationMs ?? 0) > ECHO_MIN_DURATION_MS || (confidence !== null && confidence < ECHO_MAX_CONFIDENCE)) {
    await ctx.wa.sendText(to, copy["proc.transcript_echo"](text)).catch(() => undefined);
  }
  return { ok: true, transcript: text };
}
