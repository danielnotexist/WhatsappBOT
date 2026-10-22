import type { ActionExecutor } from "@/lib/bot/pending";
import type { ConnectionProvider, Db, PendingActionRow } from "@/lib/db/types";

/**
 * One executor per pending-action kind is registered (lib/bot/pending.ts), but a user may have Microsoft and
 * Google connected. This routes each approved action to the right provider:
 *   1. `payload.provider` when the tool tagged it (gcal_*, gmail_* → "google"),
 *   2. otherwise the active Microsoft connection (the main audience, PLAN §2), then Google,
 *   3. otherwise Microsoft, whose executor answers "not connected".
 */
export type RoutedKind = "send_mail" | "create_event" | "update_event" | "delete_event";

export async function providerForAction(db: Db, action: Pick<PendingActionRow, "user_id" | "payload">): Promise<ConnectionProvider> {
  const tagged = action.payload.provider;
  if (tagged === "google" || tagged === "microsoft") return tagged;
  const active = (await db.listConnections(action.user_id)).filter((c) => c.status === "active");
  if (active.some((c) => c.provider === "microsoft")) return "microsoft";
  if (active.some((c) => c.provider === "google")) return "google";
  return "microsoft";
}

/**
 * `forward_mail` always goes to Microsoft: forwarding needs the original message, and Gmail reading waits for CASA
 * (PLAN §2/§8) — the tool does not exist for Google, so no Google draft of this kind can be created.
 */
export function routeExecutorsByProvider(
  byProvider: { microsoft: Record<RoutedKind | "forward_mail", ActionExecutor>; google: Record<RoutedKind, ActionExecutor> },
  providerFor: (action: PendingActionRow) => Promise<ConnectionProvider>,
): Record<RoutedKind | "forward_mail", ActionExecutor> {
  const route =
    (kind: RoutedKind): ActionExecutor =>
    async (action, ctx) =>
      byProvider[await providerFor(action)][kind](action, ctx);
  return { send_mail: route("send_mail"), create_event: route("create_event"), update_event: route("update_event"), delete_event: route("delete_event"), forward_mail: byProvider.microsoft.forward_mail };
}
