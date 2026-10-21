/** Speech-to-text for WhatsApp voice notes (PLAN §6: Soniox primary, gpt-4o-transcribe fallback). */

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
}

export interface Transcript {
  text: string;
  provider: string;
  model: string;
  durationMs: number | null;
  /** mean token confidence 0–1, when the provider reports it */
  confidence: number | null;
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
