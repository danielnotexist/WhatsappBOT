import type { Db, JobKind, JobRow } from "@/lib/db/types";
import type { Queue } from "@/lib/queue/types";
import { runReminderJob } from "@/lib/reminders/service";
import { runMorningSummaryJob, type MorningDeps } from "./morning-summary";

export type JobDeps = MorningDeps;

/** Job kinds this module runs (the others — charge, renew_subscription — stay in app/api/jobs/run). */
export const M5_JOB_KINDS: readonly JobKind[] = ["reminder", "morning_summary"];

/** Runs one claimed `reminder` / `morning_summary` job. Throws on transient failures (→ finish_job retry). */
export async function runScheduledJob(deps: JobDeps, job: Pick<JobRow, "id" | "kind" | "user_id" | "payload">): Promise<unknown> {
  switch (job.kind) {
    case "reminder":
      return runReminderJob(deps, job);
    case "morning_summary":
      return runMorningSummaryJob(deps, job);
    default:
      throw new Error(`runScheduledJob: kind ${job.kind} is not handled here`);
  }
}

/**
 * The no-pg_net path (0003_functions.sql: "מסלול חלופי בלי pg_net") and the DATA_MODE=memory dev loop:
 * claim due jobs (claim_due_jobs) and publish each to /api/jobs/run through the queue — the same body
 * dispatch_due_jobs() sends through QStash, so the worker cannot tell the two paths apart.
 */
export async function dispatchDueJobs(db: Db, queue: Queue, workerUrl: string, limit = 50): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;
  for (const j of await db.claimDueJobs(limit)) {
    try {
      await queue.enqueue({ url: workerUrl, body: { job_id: j.id, kind: j.kind, user_id: j.user_id, attempts: j.attempts, run_at: j.run_at, payload: j.payload }, dedupeId: `${j.id}:${j.attempts}` });
      dispatched++;
    } catch (e) {
      failed++;
      await db.finishJob(j.id, `dispatch failed: ${(e as Error).message}`).catch(() => undefined);
    }
  }
  return { dispatched, failed };
}
