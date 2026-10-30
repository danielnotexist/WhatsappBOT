import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { MockHypGateway } from "@/lib/hyp/client";
import { setHypForTests } from "@/lib/hyp";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { internalHeaders } from "@/lib/queue/local";
import { GET as mockGet } from "./mock/route";
import { GET as returnGet } from "./return/route";
import { POST as jobsPost } from "../jobs/run/route";

// the mock payment page marks itself request-time with connection(), which needs a request scope outside Next
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
// whether this browser is signed in: the result lands on /account (signed in) or on /pay/done (a link opened on the phone)
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth/current-user", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/current-user")>()), hasSession: async () => session.signedIn }));

describe("/api/pay/* and /api/jobs/run", () => {
  let db: MemoryDb;
  let hyp: MockHypGateway;
  let wa: RecordingWaSender;
  beforeEach(() => {
    session.signedIn = true;
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
    // a decline the (signing) mock page made: verified, so the page says the payment did not go through
    setHypForTests(undefined);
    const signedDecline = new URL((await mockGet(new Request(`https://app.example.co.il/api/pay/mock?Amount=99&Order=${user.id}%3Abasic&decline=1`))).headers.get("location")!);
    const declined = await returnGet(new Request(signedDecline.toString()));
    expect(new URL(declined.headers.get("location")!).searchParams.get("error")).toContain("לא עבר");
  });

  it("an unsigned return with a decline code does nothing: no WhatsApp message, no audit row, no owner alert, never the query's amount", async () => {
    setHypForTests(undefined); // the real wiring: the mock gateway checks the mock page's signature, like HYP's VERIFY
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    for (const order of [`${user.id}:pro`, `${user.id}:card`, `${user.id}:basic:annual`]) {
      const res = await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=${Math.random()}&CCode=33&Amount=99999&Order=${encodeURIComponent(order)}&Sign=x`));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).not.toContain("99999");
    }
    expect(wa.sent).toEqual([]);
    expect(db.audit.filter((a) => a.action.startsWith("payment.") || a.action.startsWith("billing."))).toEqual([]);
    await new Promise((r) => setTimeout(r, 20)); // ownerAlert() runs after the response
    expect(db.ownerAlerts).toEqual([]);
  });

  it("the app's mock gateway: only the mock page's own signature activates; a hand-made return (Sign=mock) does nothing", async () => {
    setHypForTests(undefined); // the real wiring (lib/hyp/index.ts): MockHypGateway with the signing key
    const user = await db.createUser("dana@example.com");
    for (const sign of ["mock", "x", ""]) {
      await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=123&CCode=0&Amount=1&ACode=0001234&Order=${user.id}%3Apro&Sign=${sign}`));
    }
    expect((await db.getSubscription(user.id))?.status ?? "none").not.toBe("active");
    // a signed return whose Order was swapped is refused too
    const mock = new URL((await mockGet(new Request(`https://app.example.co.il/api/pay/mock?Amount=99&Order=${user.id}%3Abasic`))).headers.get("location")!);
    const other = await db.createUser("eve@example.com");
    const swapped = new URL(mock);
    swapped.searchParams.set("Order", `${other.id}:basic`);
    await returnGet(new Request(swapped.toString()));
    expect((await db.getSubscription(other.id))?.status ?? "none").not.toBe("active");
    await returnGet(new Request(mock.toString()));
    expect(await db.getSubscription(user.id)).toMatchObject({ plan: "basic", status: "active" });
  });

  it("the mock payment page is a 404 on a real deployment (no demo, not the memory store)", async () => {
    vi.stubEnv("DATA_MODE", "supabase");
    expect((await mockGet(new Request("https://app.example.co.il/api/pay/mock?Amount=99&Order=x"))).status).toBe(404);
  });

  it("a browser that is not signed in lands on /pay/done with a result code, never with text from the URL", async () => {
    session.signedIn = false;
    const user = await db.createUser("dana@example.com");
    const paid = new URL((await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=3&CCode=0&Amount=99&Order=${user.id}%3Abasic&Sign=x`))).headers.get("location")!);
    expect(paid.pathname).toBe("/pay/done");
    expect([...paid.searchParams.entries()]).toEqual([["r", "paid"]]);
    expect((await db.getSubscription(user.id))).toMatchObject({ plan: "basic", status: "active" });
    setHypForTests(undefined); // the signing mock page: a verified decline
    const signedDecline = new URL((await mockGet(new Request(`https://app.example.co.il/api/pay/mock?Amount=99&Order=${user.id}%3Abasic&decline=1`))).headers.get("location")!);
    const declined = new URL((await returnGet(new Request(signedDecline.toString()))).headers.get("location")!);
    expect(declined.pathname + declined.search).toBe("/pay/done?r=declined");
  });

  it("jobs worker requires auth, runs a charge job and finishes it", async () => {
    const user = await db.createUser("dana@example.com");
    await returnGet(new Request(`https://app.example.co.il/api/pay/return?Id=1&CCode=0&Amount=299&Order=${user.id}%3Apro&Sign=x`));
    const job = db.jobs.find((j) => j.kind === "charge")!;
    db.now = () => new Date(Date.parse(job.run_at) + 1000);
    await db.claimDueJobs(10);
    const body = JSON.stringify({ job_id: job.id, kind: "charge", user_id: user.id, attempts: 1, run_at: job.run_at, payload: {} });
    expect((await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body }))).status).toBe(401);
    const res = await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body, headers: internalHeaders("https://app.example.co.il/api/jobs/run", body) }));
    expect(res.status).toBe(200);
    // chargeSubscription reads `now` from the billing context (real clock) → not due yet → skipped, but the job is finished
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(db.jobs.find((j) => j.id === job.id)!.status).toBe("done");
    const bad = await jobsPost(new Request("https://app.example.co.il/api/jobs/run", { method: "POST", body: "{}", headers: internalHeaders("https://app.example.co.il/api/jobs/run", "{}") }));
    expect(bad.status).toBe(400);
  });
});
