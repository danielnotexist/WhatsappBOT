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
 * Microsoft has no per-app revoke for delegated tokens (the user removes the app at myapps.microsoft.com),
 * so its local tokens are simply deleted. In DATA_MODE=memory the revoke goes to the fixture.
 */
export async function revokeAtProvider(db: Db, connection: ConnectionRow): Promise<unknown> {
  if (connection.provider !== "google") return "no_token";
  const { getGoogleFetch } = await import("./index");
  return revokeGoogleConnection(db, connection, getGoogleFetch());
}
