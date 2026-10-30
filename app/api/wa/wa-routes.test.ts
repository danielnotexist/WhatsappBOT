import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetaSignature } from "@/lib/wa/signature";
import { setQueueForTests, type Queue, type QueueJob } from "@/lib/queue";
import { internalHeaders } from "@/lib/queue/local";
import { signQStashJwt } from "@/lib/queue/qstash";
import { GET as webhookGet, POST as webhookPost } from "./webhook/route";
import { POST as workerPost } from "./worker/route";

const afterCallbacks: (() => Promise<void> | void)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void> | void) => afterCallbacks.push(fn) }));

const handled: unknown[] = [];
vi.mock("@/lib/bot/handle-inbound", () => ({
  handleInbound: async (m: unknown) => {
    handled.push(m);
    return { handled: true };
  },
}));

const sample = {
  object: "whatsapp_business_account",
  entry: [{ id: "W", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, contacts: [{ profile: { name: "דנה" }, wa_id: "972501234567" }], messages: [{ from: "972501234567", id: "wamid.in1", timestamp: "1760954400", type: "text", text: { body: "היי" } }] } }] }],
};

class FakeQueue implements Queue {
  readonly kind = "local" as const;
  jobs: QueueJob[] = [];
  async enqueue(job: QueueJob) {
    this.jobs.push(job);
    return { id: String(this.jobs.length) };
  }
}

describe("/api/wa/webhook", () => {
  let queue: FakeQueue;
  beforeEach(() => {
    vi.stubEnv("WA_VERIFY_TOKEN", "verify-me");
    vi.stubEnv("META_APP_SECRET", "app-secret");
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    queue = new FakeQueue();
    setQueueForTests(queue);
    afterCallbacks.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setQueueForTests(undefined);
  });

  it("GET answers the challenge only with the right verify token", async () => {
    const ok = await webhookGet(new Request("https://x/api/wa/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await webhookGet(new Request("https://x/api/wa/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"));
    expect(bad.status).toBe(403);
  });

  it("POST rejects a bad signature and queues one job per message with a dedupe id", async () => {
    const raw = JSON.stringify(sample);
    const bad = await webhookPost(new Request("https://x/api/wa/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }));
    expect(bad.status).toBe(401);

    const res = await webhookPost(new Request("https://x/api/wa/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": computeMetaSignature(raw, "app-secret") } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, queued: 1 });
    expect(queue.jobs).toHaveLength(0); // enqueued after the response
    for (const cb of afterCallbacks) await cb();
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toMatchObject({ url: "https://app.example.co.il/api/wa/worker", dedupeId: "in:wamid.in1" });
    expect((queue.jobs[0]!.body as { kind: string; message: { text: string } }).message.text).toBe("היי");
  });

  it("POST ignores events addressed to another phone number of the same app (WA_PHONE_NUMBER_ID)", async () => {
    const raw = JSON.stringify(sample);
    const signed = { "x-hub-signature-256": computeMetaSignature(raw, "app-secret") };
    vi.stubEnv("WA_PHONE_NUMBER_ID", "OTHER");
    const foreign = await webhookPost(new Request("https://x/api/wa/webhook", { method: "POST", body: raw, headers: signed }));
    expect(await foreign.json()).toEqual({ ok: true, queued: 0 });
    vi.stubEnv("WA_PHONE_NUMBER_ID", "PNID");
    const ours = await webhookPost(new Request("https://x/api/wa/webhook", { method: "POST", body: raw, headers: signed }));
    expect(await ours.json()).toEqual({ ok: true, queued: 1 });
  });

  it("POST answers 503 with a generic Hebrew message when META_APP_SECRET is missing (the names go to the log only)", async () => {
    vi.stubEnv("META_APP_SECRET", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await webhookPost(new Request("https://x/api/wa/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe("השירות אינו זמין כרגע. אפשר לנסות שוב בעוד כמה דקות.");
    expect(body).not.toContain("META_APP_SECRET");
    expect(String(log.mock.calls.at(-1))).toContain("META_APP_SECRET");
    log.mockRestore();
  });
});

describe("/api/wa/worker", () => {
  const job = { kind: "inbound", receivedAt: "2026-10-20T10:00:00Z", message: { waMessageId: "wamid.in1", from: "972501234567", fromE164: "+972501234567", profileName: "דנה", timestamp: "2026-10-20T10:00:00.000Z", type: "text", text: "היי", mediaId: null, mimeType: null, reply: null, contextMessageId: null, raw: {}, phoneNumberId: "PNID" } };
  const raw = JSON.stringify(job);

  beforeEach(() => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    handled.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("without QStash keys requires the signed internal header, then runs the job", async () => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    const bad = await workerPost(new Request("https://x/api/wa/worker", { method: "POST", body: raw }));
    expect(bad.status).toBe(401);
    const ok = await workerPost(new Request("https://x/api/wa/worker", { method: "POST", body: raw, headers: internalHeaders("https://x/api/wa/worker", raw) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ handled: true });
    expect(handled).toHaveLength(1);
    expect((handled[0] as { timestamp: Date }).timestamp).toBeInstanceOf(Date);
  });

  it("with QStash keys verifies the Upstash-Signature JWT and ignores the internal signature", async () => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "sig-current");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "sig-next");
    const url = "https://app.example.co.il/api/wa/worker";
    const spoof = await workerPost(new Request(url, { method: "POST", body: raw, headers: internalHeaders("https://x/api/wa/worker", raw) }));
    expect(spoof.status).toBe(401);
    const ok = await workerPost(new Request(url, { method: "POST", body: raw, headers: { "upstash-signature": signQStashJwt(raw, url, "sig-next") } }));
    expect(ok.status).toBe(200);
    const tampered = await workerPost(new Request(url, { method: "POST", body: raw + " ", headers: { "upstash-signature": signQStashJwt(raw, url, "sig-current") } }));
    expect(tampered.status).toBe(401);
    const badJob = await workerPost(new Request(url, { method: "POST", body: "{\"kind\":\"x\"}", headers: { "upstash-signature": signQStashJwt("{\"kind\":\"x\"}", url, "sig-current") } }));
    expect(badJob.status).toBe(400);
  });
});
