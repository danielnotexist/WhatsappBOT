import { timingSafeEqual } from "node:crypto";
import { runWorkerJob, type WorkerJob } from "@/lib/bot/pipeline";
import { INTERNAL_SECRET_HEADER, internalSecret } from "@/lib/queue/local";
import { QSTASH_SIGNATURE_HEADER, verifyQStashSignature } from "@/lib/queue/qstash";

/** Vercel: allow long AI/tool loops (Pro plan, PLAN §2). */
export const maxDuration = 300;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * POST: executes one queued job. Trust model:
 *   - QStash configured (QSTASH_CURRENT_SIGNING_KEY) → the Upstash-Signature JWT must verify for this URL + body;
 *   - otherwise (local dev queue) → the x-internal-secret header derived from TOKEN_ENC_KEY must match.
 * Returns 200 when handled (QStash stops retrying), 5xx to ask for a retry.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  if (currentKey) {
    const url = new URL("/api/wa/worker", process.env.APP_URL || request.url).toString();
    const v = verifyQStashSignature(request.headers.get(QSTASH_SIGNATURE_HEADER), raw, url, { current: currentKey, next: process.env.QSTASH_NEXT_SIGNING_KEY?.trim() });
    if (!v.ok) return new Response(`invalid signature: ${v.reason}`, { status: 401 });
  } else {
    const given = request.headers.get(INTERNAL_SECRET_HEADER) ?? "";
    if (!given || !safeEqual(given, internalSecret())) return new Response("invalid internal secret", { status: 401 });
  }

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
    return Response.json({ handled: false, error: (e as Error).message }, { status: 500 });
  }
}
