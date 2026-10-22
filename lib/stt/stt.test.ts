import { describe, expect, it } from "vitest";
import { EnvError } from "@/lib/env";
import { sttFromEnv } from "./env";
import { FallbackStt } from "./fallback";
import { MockStt } from "./mock";
import { oggOpusDurationMs } from "./ogg";
import { OpenAiStt } from "./openai";
import { OpenRouterStt, openRouterAudioFormat } from "./openrouter";
import { SonioxStt } from "./soniox";
import { fakeOggOpus } from "./test-fixtures";
import { SttError, type AudioInput } from "./types";

const OGG: AudioInput = { bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]), mimeType: "audio/ogg; codecs=opus" };

interface Call {
  method: string;
  path: string;
  auth: string | null;
  headers: Record<string, string>;
  json: unknown;
  form: FormData | null;
  signal: AbortSignal | null;
}

/** fetch double: answers by "METHOD /path" from a script; records every call. */
function fakeFetch(routes: Record<string, (() => Response) | Response[]>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path: url.pathname, auth: headers.Authorization ?? null, headers, json: typeof init?.body === "string" ? JSON.parse(init.body) : null, form: init?.body instanceof FormData ? init.body : null, signal: init?.signal ?? null });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ message: `no route ${method} ${url.pathname}` }), { status: 404 });
    if (Array.isArray(route)) return route.length > 1 ? route.shift()! : route[0]!.clone();
    return route();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Soniox async adapter", () => {
  it("uploads, creates stt-async-v5 with Hebrew hints, polls, reads the transcript and deletes everything", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "POST /v1/files": () => json({ id: "file-1", filename: "voice.ogg" }, 201),
      "POST /v1/transcriptions": () => json({ id: "tr-1", status: "queued" }, 201),
      "GET /v1/transcriptions/tr-1": [json({ id: "tr-1", status: "processing" }), json({ id: "tr-1", status: "completed", audio_duration_ms: 4200 })],
      "GET /v1/transcriptions/tr-1/transcript": () => json({ id: "tr-1", text: " תזכיר לי מחר ב-9 ", tokens: [{ text: "תזכיר", confidence: 0.9 }, { text: " לי", confidence: 0.8 }, { text: "", confidence: 0.1 }] }),
      "DELETE /v1/transcriptions/tr-1": () => new Response(null, { status: 204 }),
      "DELETE /v1/files/file-1": () => new Response(null, { status: 204 }),
    });
    const sleeps: number[] = [];
    const stt = new SonioxStt({ apiKey: "sk-test", fetchImpl, pollIntervalMs: 10, sleep: async (ms) => void sleeps.push(ms) });
    const t = await stt.transcribe(OGG, { language: "he" });
    expect(t).toMatchObject({ text: "תזכיר לי מחר ב-9", provider: "soniox", model: "stt-async-v5", durationMs: 4200 });
    expect(t.confidence).toBeCloseTo(0.85); // mean of the non-empty tokens
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /v1/files",
      "POST /v1/transcriptions",
      "GET /v1/transcriptions/tr-1",
      "GET /v1/transcriptions/tr-1",
      "GET /v1/transcriptions/tr-1/transcript",
      "DELETE /v1/transcriptions/tr-1",
      "DELETE /v1/files/file-1",
    ]);
    expect(calls.every((c) => c.auth === "Bearer sk-test")).toBe(true);
    const file = calls[0]!.form!.get("file") as File;
    expect(file.name).toBe("voice.ogg");
    expect(file.type).toBe("audio/ogg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(OGG.bytes);
    expect(calls[1]!.json).toEqual({ model: "stt-async-v5", file_id: "file-1", language_hints: ["he", "en"] });
    expect(sleeps).toEqual([10, 10]);
  });

  it("reports a failed transcription (not retryable) and still cleans up", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "POST /v1/files": () => json({ id: "f" }, 201),
      "POST /v1/transcriptions": () => json({ id: "t", status: "queued" }, 201),
      "GET /v1/transcriptions/t": () => json({ id: "t", status: "error", error_message: "Audio file is empty" }),
      "DELETE /v1/transcriptions/t": () => new Response(null, { status: 204 }),
      "DELETE /v1/files/f": () => new Response(null, { status: 204 }),
    });
    const err = await new SonioxStt({ apiKey: "k", fetchImpl, sleep: async () => undefined }).transcribe(OGG).catch((e) => e);
    expect(err).toBeInstanceOf(SttError);
    expect(err).toMatchObject({ retryable: false, provider: "soniox" });
    expect(err.message).toContain("Audio file is empty");
    expect(calls.slice(-2).map((c) => c.method)).toEqual(["DELETE", "DELETE"]);
  });

  it("classifies HTTP errors and times out on a stuck transcription", async () => {
    const down = fakeFetch({ "POST /v1/files": () => json({ status_code: 503, error_type: "internal_error", message: "try again" }, 503) });
    expect(await new SonioxStt({ apiKey: "k", fetchImpl: down.fetchImpl }).transcribe(OGG).catch((e) => e)).toMatchObject({ retryable: true, status: 503 });
    const auth = fakeFetch({ "POST /v1/files": () => json({ error_type: "unauthenticated", message: "Incorrect API key" }, 401) });
    expect(await new SonioxStt({ apiKey: "k", fetchImpl: auth.fetchImpl }).transcribe(OGG).catch((e) => e)).toMatchObject({ retryable: false, status: 401 });

    let t = 0;
    const stuck = fakeFetch({
      "POST /v1/files": () => json({ id: "f" }, 201),
      "POST /v1/transcriptions": () => json({ id: "t", status: "queued" }, 201),
      "GET /v1/transcriptions/t": () => json({ id: "t", status: "processing" }),
      "DELETE /v1/transcriptions/t": () => new Response(null, { status: 204 }),
      "DELETE /v1/files/f": () => new Response(null, { status: 204 }),
    });
    const err = await new SonioxStt({ apiKey: "k", fetchImpl: stuck.fetchImpl, timeoutMs: 5_000, clock: () => t, sleep: async (ms) => void (t += ms) }).transcribe(OGG).catch((e) => e);
    expect(err).toMatchObject({ retryable: true });
    expect(err.message).toContain("timed out");
  });
});

describe("gpt-4o-transcribe adapter", () => {
  it("posts one multipart request in Hebrew", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /v1/audio/transcriptions": () => json({ text: "מה יש לי מחר?" }) });
    const t = await new OpenAiStt({ apiKey: "sk-o", fetchImpl }).transcribe(OGG);
    expect(t).toEqual({ text: "מה יש לי מחר?", provider: "openai", model: "gpt-4o-transcribe", durationMs: null, confidence: null });
    const form = calls[0]!.form!;
    expect(calls[0]!.auth).toBe("Bearer sk-o");
    expect([form.get("model"), form.get("language"), form.get("response_format")]).toEqual(["gpt-4o-transcribe", "he", "json"]);
    expect((form.get("file") as File).name).toBe("voice.ogg");
  });

  it("maps API errors", async () => {
    const { fetchImpl } = fakeFetch({ "POST /v1/audio/transcriptions": () => json({ error: { message: "Invalid API key" } }, 401) });
    expect(await new OpenAiStt({ apiKey: "x", fetchImpl }).transcribe(OGG).catch((e) => e)).toMatchObject({ retryable: false, status: 401, provider: "openai" });
  });
});

describe("fallback and env", () => {
  it("falls back from Soniox to gpt-4o-transcribe, and reports both failures", async () => {
    const primary = new MockStt().enqueue(new SttError("Soniox 503", true, "soniox"));
    const secondary = new MockStt("שלום");
    const t = await new FallbackStt([primary, secondary]).transcribe(OGG);
    expect(t.text).toBe("שלום");
    const both = new FallbackStt([new MockStt().enqueue(new SttError("a", true, "soniox")), new MockStt().enqueue(new SttError("b", false, "openai"))]);
    expect(await both.transcribe(OGG).catch((e) => e)).toMatchObject({ message: "a | b", retryable: true });
    const emptyFirst = new FallbackStt([new MockStt().enqueue({ text: "  " }), new MockStt("טקסט")]);
    expect((await emptyFirst.transcribe(OGG)).text).toBe("טקסט");
  });

  it("adds up the cost of every answered call — an empty transcript is billed too", async () => {
    const billedTwice = new FallbackStt([new MockStt().enqueue({ text: " ", costUsd: 0.0003 }), new MockStt().enqueue({ text: "שלום", costUsd: 0.0004 })]);
    expect((await billedTwice.transcribe(OGG)).costUsd).toBeCloseTo(0.0007, 10);
    const failedThenOk = new FallbackStt([new MockStt().enqueue(new SttError("503", true, "a")), new MockStt().enqueue({ text: "שלום", costUsd: 0.0004 })]);
    expect((await failedThenOk.transcribe(OGG)).costUsd).toBe(0.0004);
    const bothEmpty = new FallbackStt([new MockStt().enqueue({ text: "", costUsd: 0.0001 }), new MockStt().enqueue({ text: "", costUsd: 0.0002 })]);
    expect((await bothEmpty.transcribe(OGG)).costUsd).toBeCloseTo(0.0003, 10);
    // no cost reported anywhere → stays unset
    expect((await new FallbackStt([new MockStt("שלום")]).transcribe(OGG)).costUsd).toBeUndefined();
  });

  it("builds the provider from env: OpenRouter by default, Soniox / OpenAI on request, mock in memory and demo", () => {
    expect(sttFromEnv({ DATA_MODE: "memory", NODE_ENV: "test" })).toBeInstanceOf(MockStt);
    expect(sttFromEnv({ DATA_MODE: "memory", NODE_ENV: "test", OPENROUTER_API_KEY: "or" })).toBeInstanceOf(MockStt);
    // memory mode only changes the default: an explicit STT_PROVIDER is the real (paid) provider, also there (.env.example)
    expect(sttFromEnv({ DATA_MODE: "memory", NODE_ENV: "development", STT_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or" }).name).toBe(
      "openrouter:deepgram/nova-3→openrouter:openai/gpt-transcribe",
    );
    expect(sttFromEnv({ DATA_MODE: "memory", NODE_ENV: "development", STT_PROVIDER: "mock", OPENROUTER_API_KEY: "or" })).toBeInstanceOf(MockStt);
    expect(sttFromEnv({ DEMO_MODE: "1", TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"), STT_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or" })).toBeInstanceOf(MockStt);
    // the demo with LIVE_AI=1: OpenRouter (whatever else STT_PROVIDER names), or mock on request; a missing key fails in Hebrew
    const live = { DEMO_MODE: "1", LIVE_AI: "1", TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"), OPENROUTER_API_KEY: "or" };
    expect(sttFromEnv(live).name).toBe("openrouter:deepgram/nova-3→openrouter:openai/gpt-transcribe");
    expect(sttFromEnv({ ...live, STT_PROVIDER: "soniox", SONIOX_API_KEY: "k" }).name).toBe("openrouter:deepgram/nova-3→openrouter:openai/gpt-transcribe");
    expect(sttFromEnv({ ...live, STT_PROVIDER: "mock" })).toBeInstanceOf(MockStt);
    expect(() => sttFromEnv({ ...live, OPENROUTER_API_KEY: "" })).toThrow(/OPENROUTER_API_KEY/);
    expect(sttFromEnv({ OPENROUTER_API_KEY: "or" }).name).toBe("openrouter:deepgram/nova-3→openrouter:openai/gpt-transcribe");
    expect(sttFromEnv({ OPENROUTER_API_KEY: "or", SONIOX_API_KEY: "k" }).name).toBe("openrouter:deepgram/nova-3→openrouter:openai/gpt-transcribe");
    expect(sttFromEnv({ OPENROUTER_API_KEY: "or", STT_MODEL: "openai/gpt-4o-transcribe", STT_FALLBACK_MODEL: "openai/gpt-4o-mini-transcribe" }).name).toBe(
      "openrouter:openai/gpt-4o-transcribe→openrouter:openai/gpt-4o-mini-transcribe",
    );
    const single = sttFromEnv({ OPENROUTER_API_KEY: "or", STT_FALLBACK_MODEL: "none" });
    expect(single).toBeInstanceOf(OpenRouterStt);
    expect(single.name).toBe("openrouter:deepgram/nova-3");
    expect(sttFromEnv({ OPENROUTER_API_KEY: "or", STT_MODEL: "openai/gpt-transcribe" })).toBeInstanceOf(OpenRouterStt); // same as the fallback
    // a deployment with only a Soniox key keeps Soniox; explicit providers still work
    expect(sttFromEnv({ SONIOX_API_KEY: "k" })).toBeInstanceOf(SonioxStt);
    expect(sttFromEnv({ STT_PROVIDER: "soniox", SONIOX_API_KEY: "k", OPENAI_API_KEY: "o", OPENROUTER_API_KEY: "or" }).name).toBe("soniox→openai");
    expect(sttFromEnv({ STT_PROVIDER: "openai", OPENAI_API_KEY: "o" })).toBeInstanceOf(OpenAiStt);
  });

  it("fails fast in Hebrew naming the missing or invalid variable", () => {
    const thrown = (env: Record<string, string>) => {
      try {
        sttFromEnv(env);
      } catch (e) {
        return e as EnvError;
      }
      throw new Error("should have thrown");
    };
    const missing = thrown({});
    expect(missing).toBeInstanceOf(EnvError);
    expect(missing.missing).toEqual(["OPENROUTER_API_KEY"]);
    expect(missing.message).toContain("משתני סביבה חסרים");
    expect(thrown({ STT_PROVIDER: "openrouter", SONIOX_API_KEY: "k" }).missing).toEqual(["OPENROUTER_API_KEY"]);
    expect(thrown({ OPENROUTER_API_KEY: "or", STT_MODEL: "nova-3", STT_FALLBACK_MODEL: "gpt transcribe" }).missing).toEqual(["STT_MODEL", "STT_FALLBACK_MODEL"]);
    expect(thrown({ STT_PROVIDER: "soniox", OPENROUTER_API_KEY: "or" }).missing).toEqual(["SONIOX_API_KEY"]);
    expect(thrown({ STT_PROVIDER: "openai" }).missing).toEqual(["OPENAI_API_KEY"]);
    expect(thrown({ STT_PROVIDER: "whisper", OPENROUTER_API_KEY: "or" }).missing).toEqual(["STT_PROVIDER"]);
  });
});

describe("OpenRouter speech-to-text adapter", () => {
  const ROUTE = "POST /api/v1/audio/transcriptions";

  it("sends one JSON request — raw base64 Ogg/Opus, format ogg, Hebrew — and reads text, seconds and cost", async () => {
    const { fetchImpl, calls } = fakeFetch({ [ROUTE]: () => json({ text: " תזכיר לי מחר ב-9 ", usage: { seconds: 4.2, cost: 0.000301, total_tokens: 0 } }) });
    const t = await new OpenRouterStt({ apiKey: "sk-or", fetchImpl }).transcribe(OGG, { language: "he", context: "דנה" });
    expect(t).toEqual({ text: "תזכיר לי מחר ב-9", provider: "openrouter:deepgram/nova-3", model: "deepgram/nova-3", durationMs: 4200, confidence: null, costUsd: 0.000301 });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.auth).toBe("Bearer sk-or");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.headers["X-Title"]).toBe("Alze");
    expect(call.signal).toBeInstanceOf(AbortSignal);
    // data_collection "deny": only providers that do not keep or train on the audio (docs/legal/privacy-policy-he.md §6)
    expect(call.json).toEqual({ model: "deepgram/nova-3", input_audio: { data: Buffer.from(OGG.bytes).toString("base64"), format: "ogg" }, language: "he", provider: { data_collection: "deny" } });
    expect((call.json as { input_audio: { data: string } }).input_audio.data).not.toMatch(/^data:/);
  });

  it("uses the configured model, defaults to Hebrew, and leaves duration / cost empty when not reported", async () => {
    const { fetchImpl, calls } = fakeFetch({ [ROUTE]: () => json({ text: "מה יש לי מחר?", usage: { input_tokens: 80, output_tokens: 12, total_tokens: 92 } }) });
    const t = await new OpenRouterStt({ apiKey: "k", model: "openai/gpt-transcribe", fetchImpl, baseUrl: "https://openrouter.ai/api/v1/" }).transcribe({ bytes: OGG.bytes, mimeType: "audio/mp4" });
    expect(t).toMatchObject({ text: "מה יש לי מחר?", provider: "openrouter:openai/gpt-transcribe", model: "openai/gpt-transcribe", durationMs: null, costUsd: null });
    expect(calls[0]!.json).toMatchObject({ model: "openai/gpt-transcribe", input_audio: { format: "m4a" }, language: "he", provider: { data_collection: "deny" } });
  });

  it("classifies errors: credits / bad input are final, rate limits and upstream failures retryable", async () => {
    const fail = async (res: () => Response) => new OpenRouterStt({ apiKey: "k", fetchImpl: fakeFetch({ [ROUTE]: res }).fetchImpl }).transcribe(OGG).catch((e) => e);
    const credits = await fail(() => json({ error: { code: 402, message: "Insufficient credits" } }, 402));
    expect(credits).toBeInstanceOf(SttError);
    expect(credits).toMatchObject({ retryable: false, status: 402, provider: "openrouter:deepgram/nova-3" });
    expect(credits.message).toContain("Insufficient credits");
    expect(await fail(() => json({ error: { code: 400, message: "Invalid base64" } }, 400))).toMatchObject({ retryable: false, status: 400 });
    expect(await fail(() => json({ error: { code: 413, message: "Payload Too Large" } }, 413))).toMatchObject({ retryable: false, status: 413 });
    expect(await fail(() => json({ error: { code: 401, message: "No auth credentials found" } }, 401))).toMatchObject({ retryable: false, status: 401 });
    for (const status of [408, 429, 502, 503, 504, 524, 529]) {
      expect(await fail(() => json({ error: { code: status, message: "upstream" } }, status))).toMatchObject({ retryable: true, status });
    }
    expect(await fail(() => new Response("<html>bad gateway</html>", { status: 502 }))).toMatchObject({ retryable: true, message: expect.stringContaining("bad gateway") });
    // an error body on a 200, and a 200 without text
    expect(await fail(() => json({ error: { code: 502, message: "provider returned error" } }))).toMatchObject({ retryable: true, status: 502 });
    expect(await fail(() => json({ usage: { cost: 0 } }))).toMatchObject({ retryable: true, message: expect.stringContaining("without text") });
  });

  it("reports network errors and timeouts as retryable", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await new OpenRouterStt({ apiKey: "k", fetchImpl: down }).transcribe(OGG).catch((e) => e)).toMatchObject({ retryable: true, message: expect.stringContaining("network error") });
    const slow = (async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof fetch;
    const err = await new OpenRouterStt({ apiKey: "k", fetchImpl: slow, timeoutMs: 30_000 }).transcribe(OGG).catch((e) => e);
    expect(err).toMatchObject({ retryable: true, message: "OpenRouter deepgram/nova-3: timed out after 30s" });
  });

  it("treats a timeout or a dropped connection while the body is still arriving the same way", async () => {
    // headers arrived (200), then the body stream fails part-way
    const partial = (failure: Error) =>
      (async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('{"te'));
              c.error(failure);
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof fetch;
    const timedOut = await new OpenRouterStt({ apiKey: "k", fetchImpl: partial(new DOMException("The operation was aborted due to timeout", "TimeoutError")), timeoutMs: 45_000 })
      .transcribe(OGG)
      .catch((e) => e);
    expect(timedOut).toBeInstanceOf(SttError);
    expect(timedOut).toMatchObject({ retryable: true, provider: "openrouter:deepgram/nova-3", message: "OpenRouter deepgram/nova-3: timed out after 45s" });
    const reset = await new OpenRouterStt({ apiKey: "k", fetchImpl: partial(new TypeError("terminated")) }).transcribe(OGG).catch((e) => e);
    expect(reset).toBeInstanceOf(SttError);
    expect(reset).toMatchObject({ retryable: true, message: expect.stringContaining("deepgram/nova-3: network error") });
  });

  it("falls back to the second model on failure or an empty transcript (env wiring, mocked fetch)", async () => {
    const { fetchImpl, calls } = fakeFetch({
      [ROUTE]: [json({ error: { code: 503, message: "Deepgram unavailable" } }, 503), json({ text: "שלום" }), json({ text: "  " }), json({ text: "שלום" })],
    });
    const stt = sttFromEnv({ OPENROUTER_API_KEY: "sk-or" }, fetchImpl);
    const t = await stt.transcribe(OGG, { language: "he" });
    expect(t).toMatchObject({ text: "שלום", model: "openai/gpt-transcribe" });
    // the primary hears nothing → the fallback is asked too
    const t2 = await stt.transcribe(OGG);
    expect(t2).toMatchObject({ text: "שלום", model: "openai/gpt-transcribe" });
    expect(calls.map((c) => (c.json as { model: string }).model)).toEqual(["deepgram/nova-3", "openai/gpt-transcribe", "deepgram/nova-3", "openai/gpt-transcribe"]);
    expect(calls.every((c) => c.auth === "Bearer sk-or")).toBe(true);
  });

  it("maps WhatsApp audio types to the container format, without transcoding", () => {
    expect(openRouterAudioFormat("audio/ogg; codecs=opus")).toBe("ogg");
    expect(openRouterAudioFormat("audio/opus")).toBe("ogg");
    expect(openRouterAudioFormat("audio/mpeg")).toBe("mp3");
    expect(openRouterAudioFormat("audio/mp4")).toBe("m4a");
    expect(openRouterAudioFormat("audio/aac")).toBe("aac");
    expect(openRouterAudioFormat("audio/wav")).toBe("wav");
    expect(openRouterAudioFormat("audio/webm")).toBe("webm");
    // the container wins over the codec
    expect(openRouterAudioFormat("audio/webm; codecs=opus")).toBe("webm");
    expect(openRouterAudioFormat("audio/mp4; codecs=mp4a.40.2")).toBe("m4a");
    expect(openRouterAudioFormat("audio/flac")).toBe("flac");
    expect(openRouterAudioFormat("audio/amr")).toBe("amr");
    expect(openRouterAudioFormat("")).toBe("ogg");
  });
});

describe("Ogg/Opus duration", () => {
  it("reads the length from the last page's granule position minus the pre-skip", () => {
    expect(oggOpusDurationMs(fakeOggOpus(25_000))).toBe(25_000);
    expect(oggOpusDurationMs(fakeOggOpus(3_480, { preSkip: 3_840 }))).toBe(3_480);
    // a last page on which no packet ends (granule -1) is skipped
    expect(oggOpusDurationMs(fakeOggOpus(7_000, { trailingGranules: [-1n] }))).toBe(7_000);
  });

  it("returns null for anything that is not Ogg/Opus", () => {
    expect(oggOpusDurationMs(OGG.bytes)).toBeNull(); // truncated
    expect(oggOpusDurationMs(new Uint8Array(100))).toBeNull();
    const vorbis = fakeOggOpus(5_000);
    vorbis.set(Uint8Array.from("OpusHeaX", (c) => c.charCodeAt(0)), 28);
    expect(oggOpusDurationMs(vorbis)).toBeNull();
  });
});
