/** A job pushed to the worker route. `body` is JSON; `dedupeId` makes repeated webhook deliveries idempotent. */
export interface QueueJob {
  /** absolute URL of the worker route */
  url: string;
  body: unknown;
  dedupeId?: string;
  delaySeconds?: number;
  /** Upstash retries (default 3) */
  retries?: number;
}

export interface Queue {
  readonly kind: "qstash" | "local";
  enqueue(job: QueueJob): Promise<{ id: string }>;
}
