import { connection } from "next/server";
import { getSession } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";

/**
 * POST /api/dev/billing {"daysLeft": 183} — DATA_MODE=memory development only (404 everywhere else, like
 * /api/dev/hyp): moves the signed-in user's next charge to `daysLeft` days from now, so the e2e tests can stand in the
 * middle of an annual year (a prorated upgrade) without waiting months. GET returns the subscription as the code sees
 * it (plan, cycle, next charge) for the same checks.
 */
async function devUser(): Promise<string | null> {
  if (process.env.DATA_MODE !== "memory" || process.env.NODE_ENV === "production") return null;
  return (await getSession())?.userId ?? null;
}

export async function GET() {
  await connection();
  const userId = await devUser();
  if (!userId) return new Response("not found", { status: 404 });
  const sub = await getDb().getSubscription(userId);
  return Response.json(
    { plan: sub?.plan ?? null, status: sub?.status ?? null, cycle: sub?.billing_cycle ?? null, scheduledCycle: sub?.scheduled_cycle ?? null, nextChargeAt: sub?.next_charge_at ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  await connection();
  const userId = await devUser();
  if (!userId) return new Response("not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { daysLeft?: unknown } | null;
  const days = typeof body?.daysLeft === "number" && Number.isInteger(body.daysLeft) && body.daysLeft > 0 && body.daysLeft <= 400 ? body.daysLeft : null;
  if (!days) return Response.json({ ok: false }, { status: 400 });
  const db = getDb();
  const sub = await db.getSubscription(userId);
  if (!sub) return Response.json({ ok: false }, { status: 400 });
  const next = new Date(Date.now() + days * 86_400_000);
  await db.upsertSubscription(userId, { next_charge_at: next.toISOString() });
  return Response.json({ ok: true, nextChargeAt: next.toISOString() }, { headers: { "cache-control": "no-store" } });
}
