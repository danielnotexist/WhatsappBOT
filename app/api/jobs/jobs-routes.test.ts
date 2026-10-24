import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { setQueueForTests } from "@/lib/queue";
import { INTERNAL_SECRET_HEADER, internalSecret } from "@/lib/queue/local";
import type { Queue, QueueJob } from "@/lib/queue/types";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { POST as runPost } from "./run/route";
import { POST as tickPost } from "./tick/route";

class FakeQueue implements Queue {
  readonly kind = "local" as const;
  jobs: QueueJob[] = [];
  async enqueue(job: QueueJob) {
    this.jobs.push(job);
    return { id: job.dedupeId ?? "x" };
  }
}

describe("/api/jobs/run (Milestone 5 kinds) and /api/jobs/tick", () => {
  let db: MemoryDb;
  let wa: RecordingWaSender;
  let queue: FakeQueue;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    db = new MemoryDb();
    wa = new RecordingWaSender();
    queue = new FakeQueue();
    setDbForTests(db);
    setWaSenderForTests(wa);
    setQueueForTests(queue);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
    setQueueForTests(undefined);
  });

  async function dueReminder() {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    const reminder = await db.createReminder({ user_id: user.id, text: "להתקשר לבנק", due_at: new Date(Date.now() - 60_000) });
    const job = (await db.createJob({ kind: "reminder", user_id: user.id, run_at: new Date(reminder.due_at), payload: { reminder_id: reminder.id, due_at: reminder.due_at } }))!;
    return { user, reminder, job };
  }

  it("runs a reminder job (template outside the window) and finishes it", async () => {
    const { user, reminder, job } = await dueReminder();
    const body = JSON.stringify({ job_id: job.id, kind: "reminder", user_id: user.id, attempts: 1, run_at: job.run_at, payload: job.payload });
    expect((await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body }))).status).toBe(401);
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: { [INTERNAL_SECRET_HEADER]: internalSecret() } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { status: "sent", mode: "template" } });
    expect(wa.sent.at(-1)!.template!.name).toBe("reminder");
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
    expect((await db.getReminder(reminder.id))!.status).toBe("sent");
  });

  it("runs a morning_summary job and reports a skip as success", async () => {
    const user = await db.createUser("dana@example.com");
    const job = (await db.createJob({ kind: "morning_summary", user_id: user.id, run_at: new Date(), payload: {} }))!;
    const body = JSON.stringify({ job_id: job.id, kind: "morning_summary", user_id: user.id, attempts: 1, run_at: job.run_at, payload: {} });
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: { [INTERNAL_SECRET_HEADER]: internalSecret() } }));
    expect(await res.json()).toMatchObject({ ok: true, result: { status: "skipped", reason: "morning summary off" } });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
  });

  it("runs the owner_alerts job (the spike check and the digest) and finishes it", async () => {
    const job = (await db.createJob({ kind: "owner_alerts", user_id: null, run_at: new Date(), payload: {}, dedupe_key: "owner_alerts:test" }))!;
    const body = JSON.stringify({ job_id: job.id, kind: "owner_alerts", user_id: null, attempts: 1, run_at: job.run_at, payload: {} });
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: { [INTERNAL_SECRET_HEADER]: internalSecret() } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { spike: "none", digest: expect.stringMatching(/^skipped: (quiet time|nothing queued)$/) } });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
  });

  it("tick claims due jobs and publishes them to /api/jobs/run (memory mode needs no secret)", async () => {
    const { job } = await dueReminder();
    const res = await tickPost(new Request("https://app.example.co.il/api/jobs/tick", { method: "POST" }));
    // the reminder, and the owner alerts' job of this quarter-hour (lib/admin/alerts.ts) that the tick makes sure exists
    expect(await res.json()).toEqual({ ok: true, dispatched: 2, failed: 0 });
    expect(queue.jobs.find((j) => (j.body as { kind: string }).kind === "reminder")).toMatchObject({ url: "https://app.example.co.il/api/jobs/run", dedupeId: `${job.id}:1`, body: { job_id: job.id, kind: "reminder" } });
    const ownerJob = db.jobs.find((j) => j.kind === "owner_alerts")!;
    expect(ownerJob).toMatchObject({ user_id: null, dedupe_key: expect.stringMatching(/^owner_alerts:\d{4}-\d\d-\d\dT\d\d:(00|15|30|45)$/) });
    expect(queue.jobs.find((j) => (j.body as { kind: string }).kind === "owner_alerts")).toMatchObject({ body: { job_id: ownerJob.id, user_id: null } });
    // the next tick in the same quarter-hour adds no second job
    await tickPost(new Request("https://app.example.co.il/api/jobs/tick", { method: "POST" }));
    expect(db.jobs.filter((j) => j.kind === "owner_alerts")).toHaveLength(1);

    vi.stubEnv("DATA_MODE", "supabase");
    expect((await tickPost(new Request("https://app.example.co.il/api/jobs/tick", { method: "POST" }))).status).toBe(401);
  });
});
