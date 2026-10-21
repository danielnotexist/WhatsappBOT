import { SttError, audioBlob, audioFilename, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/**
 * Soniox async (file) transcription — https://soniox.com/docs (OpenAPI checked 21.10.2026):
 *   POST   /v1/files                              multipart `file`            → { id }
 *   POST   /v1/transcriptions                     { model, file_id, language_hints, context?, client_reference_id? }
 *   GET    /v1/transcriptions/{id}                → { status: queued|processing|completed|error, audio_duration_ms, error_message }
 *   GET    /v1/transcriptions/{id}/transcript     → { text, tokens: [{ text, start_ms, end_ms, confidence }] }
 *   DELETE /v1/transcriptions/{id}, /v1/files/{id} (we keep no audio at the provider — PLAN §2.3 minimum data)
 * Auth: `Authorization: Bearer <SONIOX_API_KEY>`. Model `stt-async-v5` (stt-async-v4 is an alias until 30.6.2026).
 */
export const SONIOX_BASE = "https://api.soniox.com";
export const SONIOX_MODEL = "stt-async-v5";

export interface SonioxOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
  /** default ["he", "en"] — Hebrew first; English for the names and terms people mix in */
  languageHints?: string[];
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
}

interface SonioxTranscription {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  audio_duration_ms?: number | null;
  error_message?: string | null;
}

export class SonioxStt implements SttProvider {
  readonly name = "soniox";
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly model: string;

  constructor(private readonly opts: SonioxOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = (opts.baseUrl ?? SONIOX_BASE).replace(/\/+$/, "");
    this.model = opts.model ?? SONIOX_MODEL;
  }

  async transcribe(audio: AudioInput, o: TranscribeOptions = {}): Promise<Transcript> {
    const form = new FormData();
    form.append("file", audioBlob(audio), audio.filename ?? audioFilename(audio.mimeType));
    const file = await this.call<{ id: string }>("POST", "/v1/files", form);
    let transcriptionId: string | null = null;
    try {
      const hints = o.language ? [o.language, ...(this.opts.languageHints ?? ["he", "en"]).filter((l) => l !== o.language)] : (this.opts.languageHints ?? ["he", "en"]);
      let t = await this.call<SonioxTranscription>("POST", "/v1/transcriptions", { model: this.model, file_id: file.id, language_hints: hints, ...(o.context ? { context: o.context } : {}) });
      transcriptionId = t.id;
      const clock = this.opts.clock ?? Date.now;
      const sleep = this.opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
      const deadline = clock() + (this.opts.timeoutMs ?? 120_000);
      while (t.status !== "completed") {
        if (t.status === "error") throw new SttError(`Soniox: ${t.error_message ?? "transcription failed"}`, false, this.name);
        if (clock() > deadline) throw new SttError("Soniox: timed out waiting for the transcription", true, this.name);
        await sleep(this.opts.pollIntervalMs ?? 700);
        t = await this.call<SonioxTranscription>("GET", `/v1/transcriptions/${encodeURIComponent(t.id)}`);
      }
      const tr = await this.call<{ text?: string; tokens?: { text?: string; confidence?: number; is_audio_event?: boolean | null }[] }>("GET", `/v1/transcriptions/${encodeURIComponent(t.id)}/transcript`);
      const conf = (tr.tokens ?? []).filter((x) => !x.is_audio_event && typeof x.confidence === "number" && (x.text ?? "").trim()).map((x) => x.confidence!);
      return { text: (tr.text ?? "").trim(), provider: this.name, model: this.model, durationMs: t.audio_duration_ms ?? null, confidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null };
    } finally {
      if (transcriptionId) await this.call("DELETE", `/v1/transcriptions/${encodeURIComponent(transcriptionId)}`).catch(() => undefined);
      await this.call("DELETE", `/v1/files/${encodeURIComponent(file.id)}`).catch(() => undefined);
    }
  }

  private async call<T>(method: string, path: string, body?: FormData | Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new SttError(`Soniox: network error (${(e as Error).message})`, true, this.name);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = json as { error_type?: string; message?: string } | null;
      throw new SttError(`Soniox ${res.status}${err?.error_type ? ` ${err.error_type}` : ""}: ${err?.message ?? text.slice(0, 200)}`, res.status === 429 || res.status >= 500, this.name, res.status);
    }
    return json as T;
  }
}
