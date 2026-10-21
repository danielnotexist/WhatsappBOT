import { SttError, audioBlob, audioFilename, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/**
 * OpenAI gpt-4o-transcribe — the fallback (PLAN §6). One multipart call:
 *   POST https://api.openai.com/v1/audio/transcriptions  file, model, language=he, response_format=json → { text }
 * Accepts ogg/opus as WhatsApp sends it. No duration / confidence in the json response.
 */
export const OPENAI_BASE = "https://api.openai.com";
export const OPENAI_STT_MODEL = "gpt-4o-transcribe";

export interface OpenAiSttOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
}

export class OpenAiStt implements SttProvider {
  readonly name = "openai";
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(private readonly opts: OpenAiSttOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.model = opts.model ?? OPENAI_STT_MODEL;
  }

  async transcribe(audio: AudioInput, o: TranscribeOptions = {}): Promise<Transcript> {
    const form = new FormData();
    form.append("file", audioBlob(audio), audio.filename ?? audioFilename(audio.mimeType));
    form.append("model", this.model);
    form.append("language", o.language ?? "he");
    form.append("response_format", "json");
    if (o.context) form.append("prompt", o.context);
    let res: Response;
    try {
      res = await this.fetchImpl(`${(this.opts.baseUrl ?? OPENAI_BASE).replace(/\/+$/, "")}/v1/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${this.opts.apiKey}` }, body: form });
    } catch (e) {
      throw new SttError(`OpenAI: network error (${(e as Error).message})`, true, this.name);
    }
    const text = await res.text();
    let json: { text?: string; error?: { message?: string } } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) throw new SttError(`OpenAI ${res.status}: ${json?.error?.message ?? text.slice(0, 200)}`, res.status === 429 || res.status >= 500, this.name, res.status);
    return { text: (json?.text ?? "").trim(), provider: this.name, model: this.model, durationMs: null, confidence: null };
  }
}
