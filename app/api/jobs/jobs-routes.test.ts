import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { setQueueForTests } from "@/lib/queue";
import { internalHeaders } from "@/lib/queue/local";
import type { Queue, QueueJob } from "@/lib/queue/types";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { POST as runPost } from "./run/route";
import { GET as tickGet, POST as tickPost } from "./tick/route";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

class FakeQueue implements Queue {
  readonly kind = "local" as const;
  jobs: QueueJob[] = [];
  async enqueue(job: QueueJob) {
    this.jobs.push(job);
    return { id: job.dedupeId ?? "x" };
  }
}

const RUN_URL = "https://app.example.co.il/api/jobs/run";

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
    await db.claimDueJobs(10);
    const body = JSON.stringify({ job_id: job.id, kind: "reminder", user_id: user.id, attempts: 1, run_at: job.run_at, payload: job.payload });
    expect((await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body }))).status).toBe(401);
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: internalHeaders(RUN_URL, body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { status: "sent", mode: "template" } });
    expect(wa.sent.at(-1)!.template!.name).toBe("reminder");
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
    expect((await db.getReminder(reminder.id))!.status).toBe("sent");
  });

  it("runs a morning_summary job and reports a skip as success", async () => {
    const user = await db.createUser("dana@example.com");
    const job = (await db.createJob({ kind: "morning_summary", user_id: user.id, run_at: new Date(), payload: {} }))!;
    await db.claimDueJobs(10);
    const body = JSON.stringify({ job_id: job.id, kind: "morning_summary", user_id: user.id, attempts: 1, run_at: job.run_at, payload: {} });
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: internalHeaders(RUN_URL, body) }));
    expect(await res.json()).toMatchObject({ ok: true, result: { status: "skipped", reason: "morning summary off" } });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
  });

  it("runs the owner_alerts job (the spike check and the digest) and finishes it", async () => {
    const job = (await db.createJob({ kind: "owner_alerts", user_id: null, run_at: new Date(), payload: {}, dedupe_key: "owner_alerts:test" }))!;
    await db.claimDueJobs(10);
    const body = JSON.stringify({ job_id: job.id, kind: "owner_alerts", user_id: null, attempts: 1, run_at: job.run_at, payload: {} });
    const res = await runPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: internalHeaders(RUN_URL, body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { spike: "none", digest: expect.stringMatching(/^skipped: (quiet time|nothing queued)$/) } });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
  });

  it("runs what the jobs row says, not what the body says; skips a job that is not running or an older attempt", async () => {
    const { user, reminder, job } = await dueReminder();
    const victim = await db.createUser("victim@example.com");
    await db.claimDueJobs(10);
    // a forged body: another kind, another user, another payload — only job_id and attempts are taken from it
    const forged = JSON.stringify({ job_id: job.id, kind: "charge", user_id: victim.id, attempts: 1, run_at: job.run_at, payload: { reminder_id: "x" } });
    const res = await runPost(new Request(RUN_URL, { method: "POST", body: forged, headers: internalHeaders(RUN_URL, forged) }));
    expect(await res.json()).toMatchObject({ ok: true, result: { status: "sent" } });
    expect((await db.getReminder(reminder.id))!.status).toBe("sent");
    expect(db.jobs.filter((j) => j.kind === "charge")).toHaveLength(0);
    expect(wa.sent.every((m) => m.to === "+972501234567")).toBe(true);
    expect(user.id).not.toBe(victim.id);

    // the same delivery again: the job is done → skipped, nothing sent, still done
    const sent = wa.sent.length;
    const again = await runPost(new Request(RUN_URL, { method: "POST", body: forged, headers: internalHeaders(RUN_URL, forged) }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, skipped: expect.stringContaining("done") });
    expect(wa.sent.length).toBe(sent);

    // a late delivery of attempt 1 while attempt 2 runs: skipped, attempt 2 untouched
    const job2 = (await db.createJob({ kind: "morning_summary", user_id: user.id, run_at: new Date(), payload: {} }))!;
    await db.claimDueJobs(10);
    db.jobs.find((j) => j.id === job2.id)!.attempts = 2;
    const late = JSON.stringify({ job_id: job2.id, attempts: 1 });
    expect(await (await runPost(new Request(RUN_URL, { method: "POST", body: late, headers: internalHeaders(RUN_URL, late) }))).json()).toMatchObject({ skipped: expect.stringContaining("attempt 2") });
    expect(db.jobs.find((j) => j.id === job2.id)!.status).toBe("running");

    // an unknown job id: answered 200 so QStash stops retrying
    const unknown = JSON.stringify({ job_id: "00000000-0000-4000-8000-000000000000", attempts: 1 });
    expect(await (await runPost(new Request(RUN_URL, { method: "POST", body: unknown, headers: internalHeaders(RUN_URL, unknown) }))).json()).toMatchObject({ ok: true, skipped: "unknown job" });
  });

  it("a signed delivery is bound to its body and expires after 5 minutes", async () => {
    const { job } = await dueReminder();
    await db.claimDueJobs(10);
    const body = JSON.stringify({ job_id: job.id, attempts: 1 });
    const other = JSON.stringify({ job_id: job.id, attempts: 1, x: 1 });
    expect((await runPost(new Request(RUN_URL, { method: "POST", body: other, headers: internalHeaders(RUN_URL, body) }))).status).toBe(401);
    const old = internalHeaders(RUN_URL, body, Math.floor(Date.now() / 1000) - 301);
    expect((await runPost(new Request(RUN_URL, { method: "POST", body, headers: old }))).status).toBe(401);
    // a signature for the worker route does not open /api/jobs/run
    expect((await runPost(new Request(RUN_URL, { method: "POST", body, headers: internalHeaders("https://app.example.co.il/api/wa/worker", body) }))).status).toBe(401);
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("running");
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
    const TICK = "https://app.example.co.il/api/jobs/tick";
    expect((await tickPost(new Request(TICK, { method: "POST" }))).status).toBe(401);
    // outside memory mode a POST needs a fresh signed header (lib/queue/local.ts), not a static secret
    expect((await tickPost(new Request(TICK, { method: "POST", headers: internalHeaders(TICK, "", Math.floor(Date.now() / 1000) - 301) }))).status).toBe(401);
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("DEMO_MODE", "1");
    expect((await tickPost(new Request(TICK, { method: "POST", headers: internalHeaders(TICK, "") }))).status).toBe(200);
  });

  it("Vercel Cron: GET with the CRON_SECRET bearer runs the tick; a wrong or missing secret does not", async () => {
    vi.stubEnv("DATA_MODE", "supabase");
    const get = (auth?: string) =>
      tickGet(new Request("https://app.example.co.il/api/jobs/tick", { headers: auth ? { authorization: auth } : {} }));
    vi.stubEnv("CRON_SECRET", "");
    expect((await get("Bearer anything")).status).toBe(503);
    // shorter than 32 characters: treated as unset, even with the right bearer
    vi.stubEnv("CRON_SECRET", "cron-secret-0123456789");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get("Bearer cron-secret-0123456789")).status).toBe(503);
    log.mockRestore();
    vi.stubEnv("CRON_SECRET", "cron-secret-0123456789-0123456789");
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong-secret-0123456789")).status).toBe(401);
    expect(queue.jobs).toHaveLength(0);
    vi.stubEnv("DATA_MODE", "memory");
    await dueReminder();
    const res = await get("Bearer cron-secret-0123456789-0123456789");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, failed: 0 });
    expect(queue.jobs.some((j) => (j.body as { kind: string }).kind === "reminder")).toBe(true);
  });
});
