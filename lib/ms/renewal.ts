import type { Db } from "@/lib/db/types";
import { graphForConnection } from "./index";
import { RENEW_BEFORE_MS, ensureInboxSubscription } from "./subscriptions";

/** Job `renew_subscription` (pg_cron daily): renews Graph subscriptions that expire within a day. */
export async function renewExpiringSubscriptions(db: Db, appUrl: string, now: Date = new Date()): Promise<{ renewed: number; failed: number }> {
  let renewed = 0;
  let failed = 0;
  for (const sub of await db.listGraphSubscriptionsExpiring(new Date(now.getTime() + RENEW_BEFORE_MS), 100)) {
    const connection = await db.getConnection(sub.connection_id);
    if (!connection || connection.status !== "active") {
      await db.deleteGraphSubscription(sub.subscription_id);
      continue;
    }
    try {
      await ensureInboxSubscription(db, graphForConnection(db, connection), connection, appUrl, now);
      renewed++;
    } catch (e) {
      failed++;
      console.warn(`[graph] renew failed for ${sub.subscription_id}:`, (e as Error).message);
    }
  }
  return { renewed, failed };
}
