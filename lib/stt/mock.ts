import { SttError, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/** Deterministic STT for tests and DATA_MODE=memory: returns a fixed (or scripted) Hebrew transcript. */
export class MockStt implements SttProvider {
  readonly name = "mock";
  readonly calls: { audio: AudioInput; opts?: TranscribeOptions }[] = [];
  private queue: (Partial<Transcript> | Error)[] = [];

  constructor(private readonly fallbackText = "תזכיר לי מחר ב-9 להתקשר לבנק") {}

  enqueue(...results: (Partial<Transcript> | Error)[]): this {
    this.queue.push(...results);
    return this;
  }

  async transcribe(audio: AudioInput, opts?: TranscribeOptions): Promise<Transcript> {
    this.calls.push({ audio, opts });
    const next = this.queue.shift();
    if (next instanceof Error) throw next instanceof SttError ? next : new SttError(next.message, false, this.name);
    return { text: this.fallbackText, provider: this.name, model: "mock-stt", durationMs: 4_000, confidence: 0.95, ...next };
  }
}
