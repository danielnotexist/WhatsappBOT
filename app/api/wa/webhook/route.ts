import { after } from "next/server";
import type { WorkerJob } from "@/lib/bot/pipeline";
import { EnvError, requireEnv } from "@/lib/env";
import { getQueue } from "@/lib/queue";
import { META_SIGNATURE_HEADER, verifyMetaSignature, verifyMetaWebhookChallenge } from "@/lib/wa/signature";
import { parseWebhook } from "@/lib/wa/webhook";

/** The local queue (demo, no QStash) delivers to the worker inside `after()` and waits for it. */
export const maxDuration = 300;

/** GET: Meta's one-time subscription handshake (hub.verify_token must equal WA_VERIFY_TOKEN). */
export async function GET(request: Request) {
  let verifyToken: string;
  try {
    verifyToken = requireEnv(["WA_VERIFY_TOKEN"]).WA_VERIFY_TOKEN;
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    throw e;
  }
  const challenge = verifyMetaWebhookChallenge(new URL(request.url).searchParams, verifyToken);
  if (!challenge) return new Response("forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/**
 * POST: every WhatsApp event. Verify X-Hub-Signature-256 on the RAW body, parse, enqueue one job per
 * message (dedupe id = wa message id), answer 200 right away. Meta retries on non-2xx, so parse errors
 * are logged and still answered 200; only a bad signature gets 401.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let appSecret: string;
  try {
    appSecret = requireEnv(["META_APP_SECRET"]).META_APP_SECRET;
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    throw e;
  }
  if (!verifyMetaSignature(raw, request.headers.get(META_SIGNATURE_HEADER), appSecret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    console.warn("[wa:webhook] body is not JSON");
    return new Response("ok", { status: 200 });
  }
  const parsed = parseWebhook(body);
  const receivedAt = new Date().toISOString();
  const workerUrl = new URL("/api/wa/worker", process.env.APP_URL || request.url).toString();
  const jobs: WorkerJob[] = [
    ...parsed.messages.map((message): WorkerJob => ({ kind: "inbound", message, receivedAt })),
    ...parsed.statuses.filter((s) => s.status === "failed").map((status): WorkerJob => ({ kind: "status", status, receivedAt })),
  ];

  // Enqueue after the response is sent, so Meta sees a fast 200 regardless of QStash latency.
  after(async () => {
    const queue = getQueue();
    for (const job of jobs) {
      const dedupeId = job.kind === "inbound" ? `in:${job.message.waMessageId}` : `st:${job.status.waMessageId}:${job.status.status}`;
      try {
        await queue.enqueue({ url: workerUrl, body: job, dedupeId });
      } catch (e) {
        console.error(`[wa:webhook] enqueue failed (${dedupeId}):`, (e as Error).message);
      }
    }
    await queue.drain?.();
  });

  return Response.json({ ok: true, queued: jobs.length }, { status: 200 });
}
