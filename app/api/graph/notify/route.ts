import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { GraphSubscriptionRow } from "@/lib/db/types";
import { queueScanSoon } from "@/lib/proactive/alerts";
import { readJson } from "@/lib/support/http";

/**
 * Microsoft Graph change notifications (PLAN §2): validation handshake (echo validationToken as text/plain),
 * then notifications whose clientState matches a stored subscription. Answers 202 fast; a
 * new mail queues a proactive scan (pro, lib/proactive/alerts.ts); everything is audited. Notifications for a
 * connection that is no longer active are dropped.
 * The echo is bounded (a Graph-shaped token only, sent as a download), and a notification body is size-capped and
 * shape-checked before any lookup, so an anonymous caller cannot make it throw or run thousands of queries.
 */
/** Graph's tokens are short ASCII ("Validation: Testing client application reachability…", or base64-like). */
const VALIDATION_TOKEN = /^[A-Za-z0-9 :._+/=-]{1,512}$/;
/** Graph batches a few notifications per POST; anything above this is not Graph. */
const MAX_NOTIFICATIONS = 100;
const MAX_BODY_BYTES = 256 * 1024;

const notificationsSchema = z.object({
  value: z
    .array(
      z.object({
        subscriptionId: z.string().max(200).optional(),
        clientState: z.string().max(512).optional(),
        changeType: z.string().max(100).optional(),
        resource: z.string().max(2000).optional(),
      }),
    )
    .max(MAX_NOTIFICATIONS),
});

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken !== null) {
    if (!VALIDATION_TOKEN.test(validationToken)) return new Response("bad validation token", { status: 400 });
    return new Response(validationToken, {
      status: 200,
      // Graph reads the body only; a browser that is lured here downloads the text instead of showing it on our domain
      headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "content-disposition": "attachment", "cache-control": "no-store" },
    });
  }

  const parsed = notificationsSchema.safeParse(await readJson(request, MAX_BODY_BYTES));
  if (!parsed.success) return new Response("bad notification", { status: 400 });
  const db = getDb();
  // one lookup per subscription, however many notifications name it
  const subs = new Map<string, Promise<GraphSubscriptionRow | null>>();
  let accepted = 0;
  for (const n of parsed.data.value) {
    if (!n.subscriptionId || !n.clientState) continue;
    if (!subs.has(n.subscriptionId)) subs.set(n.subscriptionId, db.findGraphSubscription(n.subscriptionId));
    const sub = await subs.get(n.subscriptionId)!;
    if (!sub || !sameSecret(sub.client_state, n.clientState)) continue; // unknown or spoofed
    const connection = await db.getConnection(sub.connection_id);
    // a disconnected mailbox: nothing is audited or scanned for it (its subscription is removed on disconnect; a late
    // notification, or one from before that cleanup, is dropped here)
    if (connection?.status !== "active") continue;
    accepted++;
    await db.addAudit({ user_id: connection?.user_id ?? null, action: "graph.notification", target: n.resource ?? "", result: n.changeType ?? "" });
    // new mail → a proactive scan soon (pro with alerts on, in alert hours; at most one per 10 minutes — lib/proactive/alerts.ts)
    if (connection?.user_id && n.changeType === "created") {
      const user = await db.getUser(connection.user_id);
      if (user) await queueScanSoon(db, user, new Date()).catch((e: unknown) => console.warn("[graph] scan queue failed:", (e as Error).message));
    }
  }
  return Response.json({ accepted }, { status: 202 });
}
