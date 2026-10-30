import { decryptToken } from "@/lib/crypto";
import type { ConnectionRow, Db } from "@/lib/db/types";
import { revokeGoogleToken } from "./oauth";
import { googleAad } from "./token-store";

/**
 * Revokes a Google connection at Google (PLAN §2.3 / §12.7: disconnect and account deletion revoke tokens).
 * Uses the refresh token when we have it (that also invalidates its access tokens), else the access token.
 * Best-effort: never throws — the local tokens are deleted by the caller either way — and always audited.
 */
export async function revokeGoogleConnection(db: Db, connection: Pick<ConnectionRow, "id" | "user_id" | "provider">, fetchImpl?: typeof fetch): Promise<"revoked" | "no_token" | "failed"> {
  if (connection.provider !== "google") return "no_token";
  let result: "revoked" | "no_token" | "failed" = "no_token";
  let detail = "";
  try {
    const secret = await db.getConnectionSecret(connection.id);
    const sealed = secret?.enc_refresh ?? secret?.enc_access ?? null;
    if (sealed) {
      const r = await revokeGoogleToken(decryptToken(sealed, { aad: googleAad(connection.user_id) }), fetchImpl);
      result = r.ok ? "revoked" : "failed";
      detail = r.error ?? String(r.status);
    }
  } catch (e) {
    result = "failed";
    detail = (e as Error).name;
  }
  await db.addAudit({ user_id: connection.user_id, action: "google.revoke", target: connection.id, result: detail ? `${result}:${detail}` : result }).catch(() => undefined);
  return result;
}

/**
 * Default provider revoker for the personal area (lib/account/service.ts). Google → token revocation;
 * Microsoft has no per-app revoke for delegated tokens (the user removes the app at myapps.microsoft.com), so its
 * inbox subscriptions are deleted at Graph (best effort — Graph would otherwise keep notifying for up to 6 days) and
 * its local tokens are deleted by the caller. In DATA_MODE=memory the calls go to the fixtures.
 */
export async function revokeAtProvider(db: Db, connection: ConnectionRow): Promise<unknown> {
  if (connection.provider === "microsoft") {
    if ((await db.listGraphSubscriptionsForConnection(connection.id)).length === 0) return "no_token";
    const [{ graphForConnection }, { removeSubscriptions }] = await Promise.all([import("@/lib/ms/index"), import("@/lib/ms/subscriptions")]);
    try {
      await removeSubscriptions(db, graphForConnection(db, connection), connection.id);
      return "subscriptions_removed";
    } catch (e) {
      console.warn("[ms:disconnect] subscription cleanup failed:", (e as Error).message);
      return "failed";
    }
  }
  if (connection.provider !== "google") return "no_token";
  const { getGoogleFetch } = await import("./index");
  return revokeGoogleConnection(db, connection, getGoogleFetch());
}
