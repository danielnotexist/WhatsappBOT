import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { MockHypGateway } from "@/lib/hyp/client";
import { setHypForTests } from "@/lib/hyp";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { INTERNAL_SECRET_HEADER, internalSecret } from "@/lib/queue/local";
import { GET as mockGet } from "./mock/route";
import { GET as returnGet } from "./return/route";
import { POST as jobsPost } from "../jobs/run/route";

// the mock payment page marks itself request-time with connection(), which needs a request scope outside Next
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

describe("/api/pay/* and /api/jobs/run", () => {
  let db: MemoryDb;
  let hyp: MockHypGateway;
  let wa: RecordingWaSender;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    db = new MemoryDb();
    hyp = new MockHypGateway("https://app.example.co.il");
    wa = new RecordingWaSender();
    setDbForTests(db);
    setHypForTests(hyp);
    setWaSenderForTests(wa);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setHypForTests(undefined);
    setWaSenderForTests(undefined);
  });

  it("mock payment page redirects to the return route, which activates the plan and redirects to /account", async () => {
    const user = await db.createUser("dana@example.com");
    const mock = await mockGet(new Request(`https://app.example.co.il/api/pay/mock?Amount=99&Order=${user.id}%3Abasic`));
    expect(mock.status).toBe(303);
    const ret = new URL(mock.headers.get("location")!);
    expect(ret.pathname).toBe("/api/pay/return");
    expect(ret.searchParams.get("CCode")).toBe("0");
    const done = await returnGet(new Request(ret.toString()));
    expect(done.status).toBe(303);
    const acc = new URL(done.headers.get("location")!);
    expect(acc.pathname).toBe("/account");
    expect(acc.searchParams.get("notice")).toContain("החשבון פעיל");
    expect((await db.getSubscription(user.id))).toMatchObject({ plan: "basic", status: "active" });
    const declined = await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=2&CCode=6&Amount=99&Order=${user.id}%3Abasic&Sign=x`));
    expect(new URL(declined.headers.get("location")!).searchParams.get("error")).toContain("לא עבר");
  });

  it("jobs worker requires auth, runs a charge job and finishes it", async () => {
    const user = await db.createUser("dana@example.com");
    await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=1&CCode=0&Amount=299&Order=${user.id}%3Apro&Sign=x`));
    const job = db.jobs.find((j) => j.kind === "charge")!;
    db.now = () => new Date(Date.parse(job.run_at) + 1000);
    const body = JSON.stringify({ job_id: job.id, kind: "charge", user_id: user.id, attempts: 1, run_at: job.run_at, payload: {} });
    expect((await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body }))).status).toBe(401);
    const res = await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: { [INTERNAL_SECRET_HEADER]: internalSecret() } }));
    expect(res.status).toBe(200);
    // chargeSubscription reads `now` from the billing context (real clock) → not due yet → skipped, but the job is finished
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
    const bad = await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body: "{}", headers: { [INTERNAL_SECRET_HEADER]: internalSecret() } }));
    expect(bad.status).toBe(400);
  });
});
