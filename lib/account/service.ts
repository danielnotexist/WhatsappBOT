import type { ConnectionRow, Db } from "@/lib/db/types";
import { revokeAtProvider } from "@/lib/google/revoke";
import { setAlertsEnabled } from "@/lib/proactive/actions";

/** Business logic of the personal area — framework-free so it is unit-testable with MemoryDb. */
export type AccountActionResult = { ok: true; message: string } | { ok: false; message: string };

/** Provider-side revoke before the local tokens are wiped (Google: oauth2 revoke; Microsoft: none per-app). */
export type ProviderRevoker = (db: Db, connection: ConnectionRow) => Promise<unknown>;

export const DELETE_CONFIRM_WORD = "מחיקה";

export async function disconnectConnectionFor(db: Db, userId: string, connectionId: string, revoke: ProviderRevoker = revokeAtProvider): Promise<AccountActionResult> {
  if (!connectionId) return { ok: false, message: "לא נבחר חיבור." };
  const owned = (await db.listConnections(userId)).find((c) => c.id === connectionId);
  if (owned && owned.status !== "revoked") await revoke(db, owned);
  const row = await db.revokeConnection(userId, connectionId);
  if (!row) return { ok: false, message: "החיבור לא נמצא." };
  await db.addAudit({ user_id: userId, action: "connection.revoke", target: `${row.provider}:${row.account_email ?? ""}`, result: "ok" });
  return { ok: true, message: `החיבור ל-${row.provider === "microsoft" ? "Microsoft 365" : "Google"} נותק.` };
}

/**
 * One account per provider: after a new connect, every other active connection of the same provider is disconnected
 * (provider revoke + local tokens wiped), so the tools never keep working with an older account — e.g. an admin
 * account without a mailbox connected first, then the real one.
 */
export async function replaceOtherConnections(db: Db, userId: string, keep: ConnectionRow, revoke: ProviderRevoker = revokeAtProvider): Promise<number> {
  let replaced = 0;
  for (const c of await db.listConnections(userId)) {
    if (c.id === keep.id || c.provider !== keep.provider || c.status !== "active") continue;
    const result = await disconnectConnectionFor(db, userId, c.id, revoke).catch(() => null);
    if (result?.ok) replaced++;
  }
  return replaced;
}

/** /account → הגדרות: proactive alerts on / off (pro only — another plan gets the pro line as the error). */
export async function setProactiveAlertsFor(db: Db, userId: string, enabled: boolean, now: Date): Promise<AccountActionResult> {
  const user = await db.getUser(userId);
  if (!user) return { ok: false, message: "החשבון לא נמצא." };
  const r = await setAlertsEnabled(db, user, enabled, now, "account");
  return r.ok ? { ok: true, message: enabled ? "ההתראות היזומות פעילות." : "ההתראות היזומות כבויות." } : { ok: false, message: r.message };
}

export async function unlinkPhoneFor(db: Db, userId: string, identityId: string): Promise<AccountActionResult> {
  if (!identityId) return { ok: false, message: "לא נבחר מספר." };
  const ok = await db.unlinkWaIdentity(userId, identityId);
  if (!ok) return { ok: false, message: "המספר לא נמצא." };
  await db.addAudit({ user_id: userId, action: "wa.unlink", target: identityId, result: "ok" });
  return { ok: true, message: "המספר נותק. אפשר לקשר מספר חדש מהעמוד הזה." };
}

export async function cancelSubscriptionFor(db: Db, userId: string): Promise<AccountActionResult> {
  const sub = await db.getSubscription(userId);
  if (!sub || sub.status === "trial") return { ok: false, message: "אין מנוי פעיל לבטל." };
  if (sub.status === "cancelled") return { ok: false, message: "המנוי כבר בוטל." };
  const row = await db.cancelSubscription(userId);
  await db.addAudit({ user_id: userId, action: "subscription.cancel", result: row ? "ok" : "noop" });
  const until = row?.next_charge_at ? formatDate(row.next_charge_at) : "סוף התקופה";
  return { ok: true, message: `המנוי בוטל ויישאר פעיל עד ${until}. לא יהיה חיוב נוסף.` };
}

export async function deleteAccountFor(db: Db, userId: string, confirmWord: string, revoke: ProviderRevoker = revokeAtProvider): Promise<AccountActionResult> {
  if (confirmWord.trim() !== DELETE_CONFIRM_WORD) {
    return { ok: false, message: `כדי למחוק יש להקליד את המילה "${DELETE_CONFIRM_WORD}".` };
  }
  const user = await db.getUser(userId);
  if (!user) return { ok: false, message: "החשבון לא נמצא." };
  // Order matters: revoke what we can before the cascade removes the rows.
  for (const c of await db.listConnections(userId)) {
    if (c.status !== "revoked") await revoke(db, c);
    if (c.status === "active") await db.revokeConnection(userId, c.id);
  }
  const sub = await db.getSubscription(userId);
  if (sub && sub.status !== "cancelled") await db.cancelSubscription(userId);
  await db.addAudit({ user_id: null, action: "account.delete", target: user.email, result: "ok" });
  await db.deleteUser(userId);
  return { ok: true, message: "החשבון נמחק." };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function planLabel(plan: string): string {
  return plan === "basic" ? "בסיסי (99 ₪)" : plan === "pro" ? "פרו (299 ₪)" : "ניסיון";
}

export function statusLabel(status: string): string {
  return (
    { trial: "ניסיון", active: "פעיל", past_due: "תשלום נכשל - ממתין", cancelled: "בוטל (פעיל עד סוף התקופה)" }[status] ??
    status
  );
}
