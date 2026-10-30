import { runOwnerAlertsJob } from "@/lib/admin/alerts";
import { reportError } from "@/lib/errors/report";
import { getBillingContext } from "@/lib/billing";
import { runChargeJob } from "@/lib/billing/service";
import { getDb } from "@/lib/db";
import { maybeCheckGoogleUserCapAlerts } from "@/lib/google/user-cap";
import { getJobDeps } from "@/lib/jobs";
import { runScheduledJob } from "@/lib/jobs/run";
import { renewExpiringSubscriptions } from "@/lib/ms/renewal";
import { rejectUnverifiedDelivery } from "@/lib/queue/verify";

export const maxDuration = 300;

/**
 * Body as pg_cron's dispatch_due_jobs() and the tick publish it ({job_id, kind, user_id, attempts, run_at, payload},
 * supabase/migrations/0003_functions.sql). Only job_id and attempts are used: kind, user and payload are read again
 * from the jobs row, so a delivery cannot run a job for someone else or with another payload.
 */
interface DispatchedJob {
  job_id: string;
  attempts?: number;
}

/**
 * POST: runs one scheduled job (charge, renew_subscription, reminder, morning_summary, proactive_scan, meeting_plan,
 * meeting_summary, owner_alerts) and reports back with finish_job().
 * Same trust model as /api/wa/worker (lib/queue/verify.ts): QStash signature when configured, otherwise the signed
 * internal delivery. A job that is not running (already finished, cancelled, re-queued) or a delivery of an older
 * attempt is answered 200 and skipped.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const rejected = rejectUnverifiedDelivery(request, raw, "/api/jobs/run");
  if (rejected) return rejected;

  let dispatched: DispatchedJob;
  try {
    dispatched = JSON.parse(raw) as DispatchedJob;
    if (!dispatched || typeof dispatched.job_id !== "string" || !dispatched.job_id) throw new Error("missing job_id");
  } catch (e) {
    return new Response(`bad job: ${(e as Error).message}`, { status: 400 });
  }

  const db = getDb();
  const job = await db.getJob(dispatched.job_id);
  if (!job) return Response.json({ ok: true, skipped: "unknown job" }, { status: 200 });
  const attempts = typeof dispatched.attempts === "number" ? dispatched.attempts : null;
  if (job.status !== "running" || (attempts !== null && job.attempts !== attempts)) {
    return Response.json({ ok: true, skipped: `job is ${job.status} (attempt ${job.attempts})` }, { status: 200 });
  }

  let result: unknown;
  try {
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
      case "proactive_scan":
      case "meeting_plan":
      case "meeting_summary":
        result = await runScheduledJob(getJobDeps(), { id: job.id, kind: job.kind, user_id: job.user_id, payload: job.payload ?? {} });
        break;
      case "owner_alerts":
        result = await runOwnerAlertsJob({ db });
        break;
      default:
        result = { skipped: `kind ${job.kind} not handled yet` };
    }
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[jobs] ${job.kind} ${job.id} failed:`, message);
    await reportError("jobs", e, { userId: job.user_id ?? null, context: { kind: job.kind, job: job.id } });
    await db.finishJob(job.id, message, null, job.attempts).catch(() => undefined);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
  // outside the try above: a failure from here on never turns a job that ran into a retry
  await db.finishJob(job.id, null, null, job.attempts);
  // operator alerts for Google's unverified-app user cap also when the count moved without a connect (backfill)
  await maybeCheckGoogleUserCapAlerts(db);
  return Response.json({ ok: true, result }, { status: 200 });
}
