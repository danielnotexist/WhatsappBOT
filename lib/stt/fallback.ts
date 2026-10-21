import { SttError, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/** Tries each provider in order (e.g. deepgram/nova-3 → openai/gpt-transcribe); an empty transcript also falls through. */
export class FallbackStt implements SttProvider {
  readonly name: string;

  constructor(private readonly providers: SttProvider[]) {
    if (!providers.length) throw new Error("FallbackStt needs at least one provider");
    this.name = providers.map((p) => p.name).join("→");
  }

  async transcribe(audio: AudioInput, opts?: TranscribeOptions): Promise<Transcript> {
    const errors: SttError[] = [];
    let empty: Transcript | null = null;
    for (const p of this.providers) {
      try {
        const t = await p.transcribe(audio, opts);
        if (t.text.trim()) return t;
        empty ??= t;
      } catch (e) {
        const err = e instanceof SttError ? e : new SttError((e as Error).message, false, p.name);
        console.warn(`[stt] ${p.name} failed: ${err.message}`);
        errors.push(err);
      }
    }
    if (empty) return empty;
    throw new SttError(errors.map((e) => e.message).join(" | "), errors.some((e) => e.retryable), this.name);
  }
}
