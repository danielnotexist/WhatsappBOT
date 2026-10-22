import { describe, expect, it, vi } from "vitest";
import { LocalQueue } from "./local";

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
    expect(queue.pending).toEqual([]);
    vi.unstubAllEnvs();
  });
});
