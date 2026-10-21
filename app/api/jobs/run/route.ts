import { timingSafeEqual } from "node:crypto";
import { getBillingContext } from "@/lib/billing";
import { runChargeJob } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { getJobDeps } from "@/lib/jobs";
import { runScheduledJob } from "@/lib/jobs/run";
import { renewExpiringSubscriptions } from "@/lib/ms/renewal";
import type { JobKind } from "@/lib/db/types";
import { INTERNAL_SECRET_HEADER, internalSecret } from "@/lib/queue/local";
import { QSTASH_SIGNATURE_HEADER, verifyQStashSignature } from "@/lib/queue/qstash";

export const maxDuration = 300;

/** Body as pg_cron's dispatch_due_jobs() publishes it through QStash (supabase/migrations/0003_functions.sql). */
interface DispatchedJob {
  job_id: string;
  kind: JobKind;
  user_id: string | null;
  attempts: number;
  run_at: string;
  payload: Record<string, unknown>;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * POST: runs one scheduled job (charge, renew_subscription, reminder, morning_summary) and reports back with finish_job().
 * Same trust model as /api/wa/worker: QStash signature when configured, otherwise the internal secret.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  if (currentKey) {
    const url = new URL("/api/jobs/run", process.env.APP_URL || request.url).toString();
    const v = verifyQStashSignature(request.headers.get(QSTASH_SIGNATURE_HEADER), raw, url, { current: currentKey, next: process.env.QSTASH_NEXT_SIGNING_KEY?.trim() });
    if (!v.ok) return new Response(`invalid signature: ${v.reason}`, { status: 401 });
  } else {
    const given = request.headers.get(INTERNAL_SECRET_HEADER) ?? "";
    if (!given || !safeEqual(given, internalSecret())) return new Response("invalid internal secret", { status: 401 });
  }

  let job: DispatchedJob;
  try {
    job = JSON.parse(raw) as DispatchedJob;
    if (!job?.job_id || !job.kind) throw new Error("missing job_id/kind");
  } catch (e) {
    return new Response(`bad job: ${(e as Error).message}`, { status: 400 });
  }

  const db = getDb();
  try {
    let result: unknown;
    switch (job.kind) {
      case "charge":
        if (!job.user_id) throw new Error("charge job without user_id");
        result = await runChargeJob(getBillingContext(), job.user_id);
        break;
      case "renew_subscription":
        result = await renewExpiringSubscriptions(db, process.env.APP_URL || new URL(request.url).origin);
        break;
      case "reminder":
      case "morning_summary":
        result = await runScheduledJob(getJobDeps(), { id: job.job_id, kind: job.kind, user_id: job.user_id, payload: job.payload ?? {} });
        break;
      default:
        result = { skipped: `kind ${job.kind} not handled yet` };
    }
    await db.finishJob(job.job_id, null);
    return Response.json({ ok: true, result }, { status: 200 });
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[jobs] ${job.kind} ${job.job_id} failed:`, message);
    await db.finishJob(job.job_id, message).catch(() => undefined);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
