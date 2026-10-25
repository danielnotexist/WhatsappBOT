import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { scheduleOwnerAlertsJob } from "@/lib/admin/alerts";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
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
 * dev loop (no secret needed there; memory mode is refused in production by lib/env). First it makes sure the owner
 * alerts' job of this quarter-hour exists (lib/admin/alerts.ts; SQL schedule_owner_alerts() is the same with pg_cron).
 */
export async function POST(request: Request) {
  // the demo runs in production on a public URL: it keeps the secret check like the real thing
  const devMemory = dataMode() === "memory" && !isDemo();
  if (!devMemory) {
    const given = request.headers.get(INTERNAL_SECRET_HEADER) ?? "";
    if (!given || !safeEqual(given, internalSecret())) return new Response("invalid internal secret", { status: 401 });
  }
  return tick(request);
}

/**
 * GET: Vercel Cron (vercel.json "crons", every minute) — the scheduler in production: pg_cron's dispatch_due_jobs needs
 * Vault secrets that are not set. Vercel sends `Authorization: Bearer <CRON_SECRET>`; without CRON_SECRET nothing runs.
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) {
    console.error("[jobs] CRON_SECRET חסר: Vercel Cron לא יכול להפעיל את /api/jobs/tick. להגדיר CRON_SECRET (16 תווים לפחות) ב-Vercel.");
    return new Response("CRON_SECRET חסר", { status: 503 });
  }
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("invalid cron secret", { status: 401 });
  return tick(request);
}

async function tick(request: Request): Promise<Response> {
  const workerUrl = new URL("/api/jobs/run", process.env.APP_URL || request.url).toString();
  const queue = getQueue();
  const db = getDb();
  // the owner's alerts job of this quarter-hour (error spike, the morning digest) — idempotent; pg_cron does it in production (0016)
  await scheduleOwnerAlertsJob(db).catch((e: unknown) => console.error("[jobs] owner alerts not scheduled:", (e as Error).message));
  const result = await dispatchDueJobs(db, queue, workerUrl);
  await queue.drain?.();
  return Response.json({ ok: true, ...result }, { status: 200 });
}
