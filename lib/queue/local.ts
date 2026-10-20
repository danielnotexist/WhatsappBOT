import { derivedKey, hmac } from "@/lib/auth/keys";
import type { Queue, QueueJob } from "./types";

export const INTERNAL_SECRET_HEADER = "x-internal-secret";

/** Shared secret for the local (no-QStash) delivery path, derived from TOKEN_ENC_KEY. */
export function internalSecret(): string {
  return hmac(derivedKey("internal"), "queue").toString("base64url");
}

/**
 * Dev fallback when QSTASH_TOKEN is not set: POSTs the job straight to the worker URL with an internal secret,
 * fire-and-forget (no retries, no dedupe). The webhook route still answers 200 immediately.
 */
export class LocalQueue implements Queue {
  readonly kind = "local" as const;
  private readonly fetchImpl: typeof fetch;
  /** in-flight deliveries, awaited by tests */
  pending: Promise<unknown>[] = [];

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async enqueue(job: QueueJob): Promise<{ id: string }> {
    const id = job.dedupeId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const run = async () => {
      if (job.delaySeconds) await new Promise((r) => setTimeout(r, job.delaySeconds! * 1000));
      const res = await this.fetchImpl(job.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [INTERNAL_SECRET_HEADER]: internalSecret() },
        body: JSON.stringify(job.body),
      });
      if (!res.ok) console.error(`[queue:local] worker answered ${res.status} for job ${id}`);
    };
    const p = run().catch((e) => console.error(`[queue:local] delivery failed for job ${id}:`, (e as Error).message));
    this.pending.push(p);
    return { id };
  }
}
