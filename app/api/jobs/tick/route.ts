import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { dataMode } from "@/lib/env";
import { dispatchDueJobs } from "@/lib/jobs/run";
import { getQueue } from "@/lib/queue";
import { INTERNAL_SECRET_HEADER, internalSecret } from "@/lib/queue/local";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * POST: claims due jobs (claim_due_jobs) and publishes each to /api/jobs/run — the fallback for a database
 * without pg_net (call it every minute from any cron with the internal secret) and the DATA_MODE=memory
 * dev loop (no secret needed there; memory mode is refused in production by lib/env).
 */
export async function POST(request: Request) {
  const devMemory = dataMode() === "memory";
  if (!devMemory) {
    const given = request.headers.get(INTERNAL_SECRET_HEADER) ?? "";
    if (!given || !safeEqual(given, internalSecret())) return new Response("invalid internal secret", { status: 401 });
  }
  const workerUrl = new URL("/api/jobs/run", process.env.APP_URL || request.url).toString();
  const result = await dispatchDueJobs(getDb(), getQueue(), workerUrl);
  return Response.json({ ok: true, ...result }, { status: 200 });
}
