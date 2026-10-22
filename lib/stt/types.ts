/**
 * Speech-to-text for WhatsApp voice notes. Default: OpenRouter (deepgram/nova-3 → openai/gpt-transcribe, lib/stt/openrouter.ts);
 * optional: Soniox / OpenAI direct (PLAN §6's original pick); mock in DATA_MODE=memory and the demo. See lib/stt/env.ts.
 */

export interface AudioInput {
  bytes: Uint8Array;
  /** WhatsApp voice notes: "audio/ogg; codecs=opus" */
  mimeType: string;
  filename?: string;
}

export interface TranscribeOptions {
  /** ISO 639-1, default "he" */
  language?: string;
  /** free-text hint (names, business terms) to improve accuracy */
  context?: string;
  /** aborts the call — the spend guard's per-turn deadline in the demo (lib/ai/budget.ts) */
  signal?: AbortSignal;
}

export interface Transcript {
  text: string;
  provider: string;
  model: string;
  durationMs: number | null;
  /** mean token confidence 0–1, when the provider reports it */
  confidence: number | null;
  /** what the call cost in USD, when the provider reports it (OpenRouter `usage.cost`) */
  costUsd?: number | null;
}

export interface SttProvider {
  readonly name: string;
  transcribe(audio: AudioInput, opts?: TranscribeOptions): Promise<Transcript>;
}

export class SttError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SttError";
  }
}

/** A filename whose extension the providers recognise ("voice.ogg", "voice.m4a"…). */
export function audioFilename(mimeType: string, base = "voice"): string {
  const m = mimeType.toLowerCase();
  const ext = m.includes("ogg") || m.includes("opus") ? "ogg" : m.includes("mpeg") || m.includes("mp3") ? "mp3" : m.includes("mp4") || m.includes("m4a") || m.includes("aac") ? "m4a" : m.includes("wav") ? "wav" : m.includes("webm") ? "webm" : m.includes("amr") ? "amr" : "ogg";
  return `${base}.${ext}`;
}

export function audioBlob(audio: AudioInput): Blob {
  return new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType.split(";")[0]!.trim() || "application/octet-stream" });
}
