import { reportError } from "@/lib/errors/report";
import { runWorkerJob, type WorkerJob } from "@/lib/bot/pipeline";
import { rejectUnverifiedDelivery } from "@/lib/queue/verify";

/** Vercel: allow long AI/tool loops (Pro plan, PLAN §2). */
export const maxDuration = 300;

/**
 * POST: executes one queued job. Trust model:
 *   - QStash configured (QSTASH_CURRENT_SIGNING_KEY) → the Upstash-Signature JWT must verify for this URL + body;
 *   - otherwise (local queue) → the x-internal-signature HMAC (key derived from TOKEN_ENC_KEY) over time + path + body.
 * Returns 200 when handled (QStash stops retrying), 5xx to ask for a retry.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const rejected = rejectUnverifiedDelivery(request, raw, "/api/wa/worker");
  if (rejected) return rejected;

  let job: WorkerJob;
  try {
    job = JSON.parse(raw) as WorkerJob;
    if (!job || (job.kind !== "inbound" && job.kind !== "status")) throw new Error("unknown job kind");
  } catch (e) {
    return new Response(`bad job: ${(e as Error).message}`, { status: 400 });
  }
  if (job.kind === "inbound") {
    job.message.timestamp = new Date(job.message.timestamp); // JSON round-trip
  } else {
    job.status.timestamp = new Date(job.status.timestamp);
  }

  try {
    const result = await runWorkerJob(job);
    return Response.json(result, { status: 200 });
  } catch (e) {
    console.error("[wa:worker] job failed:", (e as Error).message);
    await reportError("wa.worker", e, { context: { kind: job.kind } });
    return Response.json({ handled: false, error: (e as Error).message }, { status: 500 });
  }
}
