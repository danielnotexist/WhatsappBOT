import type { Db, JobKind, JobRow } from "@/lib/db/types";
import type { Queue } from "@/lib/queue/types";
import { runReminderJob } from "@/lib/reminders/service";
import { runProactiveScanJob, scheduleProactiveScan } from "@/lib/proactive/alerts";
import { runMeetingPlanJob, runMeetingSummaryJob, scheduleMeetingPlan } from "@/lib/meetings/jobs";
import type { MeetingDeps } from "@/lib/meetings/workspace";
import { runMorningSummaryJob, type MorningDeps } from "./morning-summary";

/** The meeting summaries' extras (lib/meetings): the workspaces, the summary's model, the site's URL. */
export type JobDeps = MorningDeps & { meetings?: Pick<MeetingDeps, "workspace" | "ai" | "appUrl"> };

/** Job kinds this module runs (the others — charge, renew_subscription — stay in app/api/jobs/run). */
export const M5_JOB_KINDS: readonly JobKind[] = ["reminder", "morning_summary", "proactive_scan", "meeting_plan", "meeting_summary"];

/** Runs one claimed `reminder` / `morning_summary` / `proactive_scan` / `meeting_*` job. Throws on transient failures (→ finish_job retry). */
export async function runScheduledJob(deps: JobDeps, job: Pick<JobRow, "id" | "kind" | "user_id" | "payload">): Promise<unknown> {
  switch (job.kind) {
    case "reminder":
      return runReminderJob(deps, job);
    case "morning_summary": {
      const result = await runMorningSummaryJob(deps, job);
      // pro: the day's urgent-alert scans and meeting plans follow the summary (pg_cron schedules them too; idempotent by key)
      const user = job.user_id ? await deps.db.getUser(job.user_id) : null;
      if (user) await scheduleProactiveScan(deps.db, user, deps.now()).catch(() => null);
      if (user && deps.meetings) await scheduleMeetingPlan(deps.db, user, deps.now()).catch(() => null);
      return result;
    }
    case "proactive_scan":
      return runProactiveScanJob(deps, job);
    case "meeting_plan":
      return deps.meetings ? runMeetingPlanJob({ ...deps, ...deps.meetings }, job) : { status: "skipped", reason: "meetings not wired" };
    case "meeting_summary":
      return deps.meetings ? runMeetingSummaryJob({ ...deps, ...deps.meetings }, job) : { status: "skipped", reason: "meetings not wired" };
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
