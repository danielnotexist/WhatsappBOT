import { randomBytes } from "node:crypto";
import type { ConnectionRow, Db } from "@/lib/db/types";
import type { GraphClient } from "./graph";

/** Outlook message subscriptions live at most 10,080 minutes (7 days); we renew every 6 days (PLAN §2). */
export const SUBSCRIPTION_TTL_MS = 6 * 24 * 3_600_000;
export const RENEW_BEFORE_MS = 24 * 3_600_000;
export const INBOX_RESOURCE = "me/mailFolders('inbox')/messages";

export function notificationUrl(appUrl: string): string {
  return new URL("/api/graph/notify", appUrl).toString();
}

/** Creates (or keeps) the inbox "created" subscription for a connection; stores subscription id + clientState. */
export async function ensureInboxSubscription(db: Db, graph: GraphClient, connection: ConnectionRow, appUrl: string, now: Date = new Date()): Promise<void> {
  const existing = (await db.listGraphSubscriptionsForConnection(connection.id)).find((s) => s.resource === INBOX_RESOURCE);
  if (existing && Date.parse(existing.expires_at) - now.getTime() > RENEW_BEFORE_MS) return;
  const clientState = existing?.client_state ?? randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + SUBSCRIPTION_TTL_MS);
  if (existing) {
    try {
      const renewed = await graph.renewSubscription(existing.subscription_id, expiresAt);
      await db.upsertGraphSubscription({ connection_id: connection.id, subscription_id: renewed.id, resource: INBOX_RESOURCE, expires_at: renewed.expirationDateTime, client_state: clientState });
      return;
    } catch {
      await db.deleteGraphSubscription(existing.subscription_id); // gone on Graph's side → recreate
    }
  }
  const created = await graph.createSubscription({ resource: INBOX_RESOURCE, notificationUrl: notificationUrl(appUrl), clientState, expiresAt });
  await db.upsertGraphSubscription({ connection_id: connection.id, subscription_id: created.id, resource: INBOX_RESOURCE, expires_at: created.expirationDateTime, client_state: clientState });
}

export async function removeSubscriptions(db: Db, graph: GraphClient, connectionId: string): Promise<void> {
  for (const s of await db.listGraphSubscriptionsForConnection(connectionId)) {
    await graph.deleteSubscription(s.subscription_id).catch(() => undefined);
    await db.deleteGraphSubscription(s.subscription_id);
  }
}
