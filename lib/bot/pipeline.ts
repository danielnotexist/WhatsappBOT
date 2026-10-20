import "server-only";
import type { InboundMessage, InboundStatus } from "@/lib/wa/types";

/** Jobs the webhook enqueues and the worker executes. */
export type WorkerJob =
  | { kind: "inbound"; message: InboundMessage; receivedAt: string }
  | { kind: "status"; status: InboundStatus; receivedAt: string };

/**
 * Entry point of the bot for one inbound message. Filled in by the conversation pipeline
 * (lib/bot/handle-inbound.ts); kept behind this thin module so the routes have a stable import.
 */
export async function runWorkerJob(job: WorkerJob): Promise<{ handled: boolean; note?: string }> {
  const { handleInbound } = await import("./handle-inbound");
  if (job.kind === "inbound") return handleInbound(job.message);
  // delivery statuses: nothing to do yet (B5 will mark failed templates / reconnect prompts)
  return { handled: false, note: `status ${job.status.status} ignored` };
}
