import "server-only";
import { trackServerEvent } from "@/lib/analytics/track";
import { replaceOtherConnections } from "@/lib/account/service";
import { copy } from "@/lib/copy/bot";
import type { Db, UserRow } from "@/lib/db/types";
import { activeMicrosoftConnection, graphForConnection } from "./index";
import { msHasScope, type MsTokens } from "./oauth";
import { ensureInboxSubscription } from "./subscriptions";
import { sealTokens } from "./token-store";

/**
 * The second half of the Microsoft callback, shared by the connect flow and Sign in with Microsoft
 * (lib/auth/sso-flow.ts): the tokens are in hand and the account is known. Stores the encrypted tokens, marks the
 * meeting-transcript consent of a pro connect, audits, records the funnel step, replaces an older Microsoft connection
 * of the user, takes the display name and subscribes to the inbox (best effort), tells the user in WhatsApp (`tell`)
 * and returns the line for the page.
 */
export async function storeMicrosoftConnection(
  db: Db,
  user: UserRow,
  tokens: MsTokens,
  input: { accountEmail: string; tenantId: string | null; admin: boolean; meetings: boolean; appUrl: string; tell: (text: string) => Promise<void> },
): Promise<{ notice: string }> {
  const { accountEmail } = input;
  const connection = await db.upsertConnection({ user_id: user.id, provider: "microsoft", account_email: accountEmail, tenant_id: input.tenantId, scopes: tokens.scope, consent_type: input.admin ? "admin" : "user", ...sealTokens(user.id, tokens) });
  if (input.meetings && msHasScope(tokens.scope, "OnlineMeetingTranscript.Read.All")) await db.mergeUserProfile(user.id, { ms_meetings_consent: "granted" });
  await db.addAudit({ user_id: user.id, action: "ms.connect", target: accountEmail, result: "ok" });
  trackServerEvent(db, "mail_connected", user.id); // the signup funnel (lib/analytics)
  await replaceOtherConnections(db, user.id, connection).catch((e) => console.error("[ms:callback] replacing older connections failed:", (e as Error).message));
  try {
    const graph = graphForConnection(db, activeMicrosoftConnection([connection]) ?? connection);
    const me = await graph.me();
    if (me.displayName && !user.name) await db.updateUserProfile(user.id, { name: me.displayName });
    await ensureInboxSubscription(db, graph, connection, input.appUrl);
  } catch (e) {
    console.warn("[ms:callback] post-connect setup failed:", (e as Error).message);
  }
  await input.tell(copy["onb.connect_done"]("Microsoft 365", accountEmail));
  return { notice: `החיבור ל-Microsoft 365 הושלם (${accountEmail}).` };
}
