import { BRAND } from "@/lib/brand";
import { SttError, type AudioInput, type SttProvider, type TranscribeOptions, type Transcript } from "./types";

/**
 * OpenRouter Speech-to-Text — the default STT (one synchronous call: no upload, no polling, no cleanup).
 * Docs checked 21.10.2026 (openrouter.ai/docs/api/api-reference/stt/create-transcription, guides/overview/multimodal/stt):
 *   POST https://openrouter.ai/api/v1/audio/transcriptions
 *   Authorization: Bearer <OPENROUTER_API_KEY>, Content-Type: application/json
 *   { model, input_audio: { data: <raw base64 — not a data: URI>, format }, language?: ISO-639-1,
 *     provider?: { data_collection?: "allow" | "deny", zdr?: boolean } }
 *   200 → { text, usage?: { seconds?, cost?, input_tokens?, output_tokens?, total_tokens? } }
 *         (`seconds` comes from duration-priced models such as deepgram/nova-3; `cost` is USD)
 *   err → { error: { code, message, metadata? } } — 400 bad input, 401 key, 402 no credits, 413 too large,
 *         429 rate limit, 502/503/504/524/529 upstream (retryable)
 * Formats: wav, mp3, flac, m4a, ogg, webm, aac (support varies by provider). WhatsApp voice notes are Ogg/Opus and go
 * as-is with format "ogg" — there is no transcoding (none on Vercel); Deepgram and OpenAI decode Ogg/Opus natively.
 * `language` must be sent: Deepgram's default is English. We do not ask for `verbose_json` (models without timestamps,
 * e.g. openai/gpt-4o-transcribe, reject it with 400), so there is no word confidence. `context` hints are not sent:
 * `keyterms` is provider-specific and an unsupported audio option fails the request.
 * Upstream providers time out at ~60 s; inline base64 above 25 MB is accepted only for OpenAI/Groq models.
 *
 * Data policy (docs/legal/privacy-policy-he.md §6 lists OpenRouter, Deepgram and OpenAI for this): every request sends
 * `provider: { data_collection: "deny" }` — OpenRouter's default is "allow" (providers that may store the audio and train
 * on it); "deny" routes only to providers that do not collect it, and fails rather than fall back to one that does.
 * deepgram/nova-3's endpoint is on OpenRouter's public Zero Data Retention list (GET /api/v1/endpoints/zdr, 22.10.2026),
 * so it routes under "deny". `zdr: true` is not sent: OpenAI's endpoint (the fallback) is not on that list.
 * OpenRouter itself keeps no prompt content unless logging is turned on in the account (docs/guides/privacy/data-collection).
 */
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
/** Best Hebrew WhatsApp WER among the OpenRouter STT models that ivrit.ai measured (leaderboard, eval-whatsapp: 12.0%). */
export const OPENROUTER_STT_MODEL = "deepgram/nova-3";
/** The fallback when the primary fails or returns nothing. */
export const OPENROUTER_STT_FALLBACK_MODEL = "openai/gpt-transcribe";
/** Per request; leaves room for the fallback inside the worker's maxDuration. */
export const OPENROUTER_STT_TIMEOUT_MS = 45_000;

export interface OpenRouterSttOptions {
  apiKey: string;
  /** OpenRouter model slug, e.g. "deepgram/nova-3" */
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface OpenRouterSttResponse {
  text?: string;
  usage?: { seconds?: number | null; cost?: number | null } | null;
  error?: { code?: number | string; message?: string } | null;
}

/**
 * `input_audio.format` from the WhatsApp mime type — the container as it is, never a guess at transcoding. Containers
 * are matched before codecs, so "audio/webm; codecs=opus" is webm; a bare "audio/opus" is an Ogg/Opus voice note.
 */
export function openRouterAudioFormat(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("aac")) return "aac";
  if (m.includes("wav")) return "wav";
  if (m.includes("flac")) return "flac";
  if (m.includes("amr")) return "amr"; // not in OpenRouter's list; passed through for providers that decode it
  return "ogg"; // audio/opus and WhatsApp voice notes
}

export class OpenRouterStt implements SttProvider {
  readonly name: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(private readonly opts: OpenRouterSttOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.model = opts.model ?? OPENROUTER_STT_MODEL;
    this.name = `openrouter:${this.model}`;
  }

  async transcribe(audio: AudioInput, o: TranscribeOptions = {}): Promise<Transcript> {
    const body = {
      model: this.model,
      input_audio: { data: Buffer.from(audio.bytes).toString("base64"), format: openRouterAudioFormat(audio.mimeType) },
      language: o.language ?? "he",
      provider: { data_collection: "deny" }, // see the data policy note above
    };
    const timeoutMs = this.opts.timeoutMs ?? OPENROUTER_STT_TIMEOUT_MS;
    let res: Response;
    let raw: string;
    try {
      res = await this.fetchImpl(`${(this.opts.baseUrl ?? OPENROUTER_BASE).replace(/\/+$/, "")}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json", "X-Title": BRAND.latin },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // inside the same guard: the timeout (or a dropped connection) can also hit while the body is still arriving
      raw = await res.text();
    } catch (e) {
      const err = e as Error;
      const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
      throw new SttError(timedOut ? `OpenRouter ${this.model}: timed out after ${Math.round(timeoutMs / 1000)}s` : `OpenRouter ${this.model}: network error (${err.message})`, true, this.name);
    }
    let json: OpenRouterSttResponse | null = null;
    try {
      json = raw ? (JSON.parse(raw) as OpenRouterSttResponse) : null;
    } catch {
      json = null;
    }
    if (!res.ok || (json?.error && typeof json.text !== "string")) {
      const status = res.ok ? Number(json?.error?.code) || 502 : res.status;
      throw new SttError(`OpenRouter ${this.model} ${status}: ${json?.error?.message ?? raw.slice(0, 200)}`, status === 408 || status === 429 || status >= 500, this.name, status);
    }
    if (typeof json?.text !== "string") throw new SttError(`OpenRouter ${this.model}: response without text`, true, this.name, res.status);
    const seconds = json.usage?.seconds;
    const cost = json.usage?.cost;
    return {
      text: json.text.trim(),
      provider: this.name,
      model: this.model,
      durationMs: typeof seconds === "number" && seconds > 0 ? Math.round(seconds * 1000) : null,
      confidence: null,
      costUsd: typeof cost === "number" ? cost : null,
    };
  }
}
