import { describe, expect, it, vi } from "vitest";
import { INTERNAL_SIGNATURE_HEADER, INTERNAL_SIGNATURE_MAX_AGE_S, LocalQueue, signInternal, verifyInternal } from "./local";

describe("LocalQueue", () => {
  it("drain() waits until every enqueued job reached the worker", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
    let release!: () => void;
    const delivered: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((r) => (release = r));
      delivered.push(String(init?.body));
      return new Response("ok");
    }) as unknown as typeof fetch;
    const queue = new LocalQueue(fetchImpl);
    await queue.enqueue({ url: "https://x/api/wa/worker", body: { n: 1 } });
    expect(delivered).toEqual([]);
    const drained = queue.drain();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    await drained;
    expect(delivered).toEqual(['{"n":1}']);
    const headers = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1].headers as Record<string, string>;
    expect(verifyInternal(headers[INTERNAL_SIGNATURE_HEADER], "/api/wa/worker", '{"n":1}')).toBe(true);
    expect(queue.pending).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("the internal signature binds the body, the path and a 5-minute window", () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
    const now = 1_800_000_000;
    const sig = signInternal("/api/jobs/run", '{"job_id":"a"}', now);
    expect(verifyInternal(sig, "/api/jobs/run", '{"job_id":"a"}', now)).toBe(true);
    expect(verifyInternal(sig, "/api/jobs/run", '{"job_id":"b"}', now)).toBe(false);
    expect(verifyInternal(sig, "/api/wa/worker", '{"job_id":"a"}', now)).toBe(false);
    expect(verifyInternal(sig, "/api/jobs/run", '{"job_id":"a"}', now + INTERNAL_SIGNATURE_MAX_AGE_S + 1)).toBe(false);
    expect(verifyInternal(sig, "/api/jobs/run", '{"job_id":"a"}', now - INTERNAL_SIGNATURE_MAX_AGE_S - 1)).toBe(false);
    expect(verifyInternal(null, "/api/jobs/run", "", now)).toBe(false);
    // the old static header value is no longer a credential
    expect(verifyInternal("static-secret", "/api/jobs/run", "", now)).toBe(false);
    vi.unstubAllEnvs();
  });
});
