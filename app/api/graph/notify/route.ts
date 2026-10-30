import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { queueScanSoon } from "@/lib/proactive/alerts";

/**
 * Microsoft Graph change notifications (PLAN §2): validation handshake (echo validationToken as text/plain),
 * then notifications whose clientState matches a stored subscription. Answers 202 fast; a
 * new mail queues a proactive scan (pro, lib/proactive/alerts.ts); everything is audited. Notifications for a
 * connection that is no longer active are dropped.
 */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) return new Response(validationToken, { status: 200, headers: { "content-type": "text/plain" } });

  let body: { value?: { subscriptionId?: string; clientState?: string; changeType?: string; resource?: string; resourceData?: { id?: string } }[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const db = getDb();
  let accepted = 0;
  for (const n of body.value ?? []) {
    if (!n.subscriptionId || !n.clientState) continue;
    const sub = await db.findGraphSubscription(n.subscriptionId);
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
