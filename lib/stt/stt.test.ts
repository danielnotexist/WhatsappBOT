import { describe, expect, it } from "vitest";
import { EnvError } from "@/lib/env";
import { sttFromEnv } from "./env";
import { FallbackStt } from "./fallback";
import { MockStt } from "./mock";
import { OpenAiStt } from "./openai";
import { SonioxStt } from "./soniox";
import { SttError, type AudioInput } from "./types";

const OGG: AudioInput = { bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]), mimeType: "audio/ogg; codecs=opus" };

interface Call {
  method: string;
  path: string;
  auth: string | null;
  json: unknown;
  form: FormData | null;
}

/** fetch double: answers by "METHOD /path" from a script; records every call. */
function fakeFetch(routes: Record<string, (() => Response) | Response[]>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path: url.pathname, auth: headers.Authorization ?? null, json: typeof init?.body === "string" ? JSON.parse(init.body) : null, form: init?.body instanceof FormData ? init.body : null });
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

  it("builds the provider from env and fails fast in Hebrew naming the missing variable", () => {
    expect(sttFromEnv({ DATA_MODE: "memory", NODE_ENV: "test" })).toBeInstanceOf(MockStt);
    expect(sttFromEnv({ SONIOX_API_KEY: "k" })).toBeInstanceOf(SonioxStt);
    expect(sttFromEnv({ SONIOX_API_KEY: "k", OPENAI_API_KEY: "o" }).name).toBe("soniox→openai");
    expect(sttFromEnv({ STT_PROVIDER: "openai", OPENAI_API_KEY: "o" })).toBeInstanceOf(OpenAiStt);
    const missing = (() => {
      try {
        sttFromEnv({});
      } catch (e) {
        return e;
      }
    })() as EnvError;
    expect(missing).toBeInstanceOf(EnvError);
    expect(missing.missing).toEqual(["SONIOX_API_KEY"]);
    expect(missing.message).toContain("משתני סביבה חסרים");
    expect(() => sttFromEnv({ STT_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => sttFromEnv({ STT_PROVIDER: "whisper" })).toThrow(EnvError);
  });
});
