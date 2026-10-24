import { connection } from "next/server";
import { seedAdminDemo } from "@/lib/admin/demo-seed";
import { getDb } from "@/lib/db";
import type { MemoryDb } from "@/lib/db/memory";

/**
 * POST /api/dev/admin-seed — DATA_MODE=memory development only (404 everywhere else, like /api/dev/outbox): fills the
 * in-memory store with a month of fictional activity (lib/admin/demo-seed.ts) so the admin panel can be seen and
 * photographed with believable data. Idempotent per address.
 */
export async function POST() {
  await connection();
  if (process.env.DATA_MODE !== "memory" || process.env.NODE_ENV === "production") return new Response("not found", { status: 404 });
  const db = getDb() as Partial<MemoryDb>;
  // by shape, not instanceof (the dev server may bundle the class twice — see app/api/dev/hyp)
  if (!(db.users instanceof Map) || !Array.isArray(db.supportChats)) return new Response("not found", { status: 404 });
  return Response.json(seedAdminDemo(db as MemoryDb), { headers: { "cache-control": "no-store" } });
}
