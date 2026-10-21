import { describe, expect, it } from "vitest";
import { makeHarness } from "@/lib/bot/test-harness";
import type { Queue, QueueJob } from "@/lib/queue/types";
import { dispatchDueJobs, runScheduledJob, type JobDeps } from "./run";

class FakeQueue implements Queue {
  readonly kind = "local" as const;
  jobs: QueueJob[] = [];
  fail = false;
  async enqueue(job: QueueJob) {
    if (this.fail) throw new Error("qstash down");
    this.jobs.push(job);
    return { id: job.dedupeId ?? String(this.jobs.length) };
  }
}

describe("jobs runner", () => {
  it("dispatches reminder / morning_summary and refuses other kinds", async () => {
    const h = makeHarness();
    const deps: JobDeps = { db: h.db, wa: h.wa, now: h.ctx.now, graphFor: async () => null };
    expect(await runScheduledJob(deps, { id: "j", kind: "reminder", user_id: null, payload: { reminder_id: "nope" } })).toEqual({ status: "skipped", reason: "reminder not found" });
    expect(await runScheduledJob(deps, { id: "j", kind: "morning_summary", user_id: null, payload: {} })).toEqual({ status: "skipped", reason: "no user" });
    await expect(runScheduledJob(deps, { id: "j", kind: "charge", user_id: null, payload: {} })).rejects.toThrow(/not handled/);
  });

  it("claims due jobs (claim_due_jobs semantics) and publishes the dispatch_due_jobs body", async () => {
    const h = makeHarness(new Date("2026-10-21T07:00:00Z"));
    const due = await h.db.createJob({ kind: "reminder", user_id: null, run_at: new Date("2026-10-21T06:59:00Z"), payload: { reminder_id: "r1" } });
    await h.db.createJob({ kind: "reminder", user_id: null, run_at: new Date("2026-10-21T08:00:00Z"), payload: { reminder_id: "later" } });
    const q = new FakeQueue();
    expect(await dispatchDueJobs(h.db, q, "https://app.example.co.il/api/jobs/run")).toEqual({ dispatched: 1, failed: 0 });
    expect(q.jobs).toEqual([{ url: "https://app.example.co.il/api/jobs/run", dedupeId: `${due!.id}:1`, body: { job_id: due!.id, kind: "reminder", user_id: null, attempts: 1, run_at: "2026-10-21T06:59:00.000Z", payload: { reminder_id: "r1" } } }]);
    expect(h.db.jobs.find((j) => j.id === due!.id)).toMatchObject({ status: "running", attempts: 1 });
    // nothing left to claim
    expect(await dispatchDueJobs(h.db, q, "u")).toEqual({ dispatched: 0, failed: 0 });
  });

  it("a failed publish goes back to the queue with backoff", async () => {
    const h = makeHarness(new Date("2026-10-21T07:00:00Z"));
    const job = await h.db.createJob({ kind: "morning_summary", user_id: null, run_at: new Date("2026-10-21T06:00:00Z") });
    const q = new FakeQueue();
    q.fail = true;
    expect(await dispatchDueJobs(h.db, q, "u")).toEqual({ dispatched: 0, failed: 1 });
    expect(h.db.jobs.find((j) => j.id === job!.id)).toMatchObject({ status: "queued", last_error: "dispatch failed: qstash down", run_at: "2026-10-21T07:05:00.000Z" });
  });
});
