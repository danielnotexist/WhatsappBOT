import { SttError, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/**
 * Tries each provider in order (e.g. deepgram/nova-3 → openai/gpt-transcribe); an empty transcript also falls through.
 * `costUsd` on the result covers every answered call — an empty transcript is billed too.
 */
export class FallbackStt implements SttProvider {
  readonly name: string;

  constructor(private readonly providers: SttProvider[]) {
    if (!providers.length) throw new Error("FallbackStt needs at least one provider");
    this.name = providers.map((p) => p.name).join("→");
  }

  async transcribe(audio: AudioInput, opts?: TranscribeOptions): Promise<Transcript> {
    const errors: SttError[] = [];
    let empty: Transcript | null = null;
    let spent: number | null = null; // what the answered calls so far cost, when reported
    const withSpent = (t: Transcript): Transcript => (spent === null ? t : { ...t, costUsd: spent });
    for (const p of this.providers) {
      if (opts?.signal?.aborted) {
        errors.push(new SttError(`${p.name}: not tried, the turn's deadline passed`, false, p.name)); // no further paid call
        break;
      }
      try {
        const t = await p.transcribe(audio, opts);
        if (typeof t.costUsd === "number") spent = (spent ?? 0) + t.costUsd;
        if (t.text.trim()) return withSpent(t);
        empty ??= t;
      } catch (e) {
        const err = e instanceof SttError ? e : new SttError((e as Error).message, false, p.name);
        console.warn(`[stt] ${p.name} failed: ${err.message}`);
        errors.push(err);
      }
    }
    if (empty) return withSpent(empty);
    throw new SttError(errors.map((e) => e.message).join(" | "), errors.some((e) => e.retryable), this.name);
  }
}
