import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";
import type { Queue, QueueJob } from "./types";

/** `t=<unix seconds>,v1=<hex HMAC>` over the time, the route's path and the raw body (lib/queue/local.ts). */
export const INTERNAL_SIGNATURE_HEADER = "x-internal-signature";
/** A local-queue delivery is accepted for this long after it was signed (and at most this far in the future). */
export const INTERNAL_SIGNATURE_MAX_AGE_S = 300;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function mac(t: number, path: string, body: string): Buffer {
  return hmac(derivedKey("internal"), `${t}.${path}.${body}`);
}

/**
 * Signs one internal delivery (the local queue, no QStash) with a key derived from TOKEN_ENC_KEY. The signature binds
 * the exact body, the target path and the time, so a captured header is useless for another body or route and expires
 * after INTERNAL_SIGNATURE_MAX_AGE_S.
 */
export function signInternal(path: string, body: string, now: number = nowSeconds()): string {
  return `t=${now},v1=${mac(now, path, body).toString("hex")}`;
}

/** Headers for an internal delivery of `body` to `url` (the local queue, tests, local tooling). */
export function internalHeaders(url: string, body: string, now?: number): Record<string, string> {
  return { [INTERNAL_SIGNATURE_HEADER]: signInternal(new URL(url).pathname, body, now) };
}

/** Checks an internal signature for this path + raw body within the time window. */
export function verifyInternal(header: string | null | undefined, path: string, body: string, now: number = nowSeconds()): boolean {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header?.trim() ?? "");
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > INTERNAL_SIGNATURE_MAX_AGE_S) return false;
  const given = Buffer.from(m[2]!, "hex");
  const expected = mac(t, path, body);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Dev fallback when QSTASH_TOKEN is not set: POSTs the job straight to the worker URL with an internal signature,
 * without retries or dedupe. `enqueue` returns right away; the caller awaits `drain()` (after the response) so a
 * serverless invocation is not frozen before the worker got the job.
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
      const body = JSON.stringify(job.body);
      // signed when sent (after any delay), so the time window starts at delivery
      const res = await this.fetchImpl(job.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...internalHeaders(job.url, body) },
        body,
      });
      if (!res.ok) console.error(`[queue:local] worker answered ${res.status} for job ${id}`);
    };
    const p = run().catch((e) => console.error(`[queue:local] delivery failed for job ${id}:`, (e as Error).message));
    this.pending.push(p);
    return { id };
  }

  async drain(): Promise<void> {
    while (this.pending.length) {
      const batch = this.pending;
      this.pending = [];
      await Promise.allSettled(batch);
    }
  }
}
