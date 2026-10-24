import { connectionExpiredAlert } from "@/lib/admin/alerts";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { ConnectionRow, Db } from "@/lib/db/types";
import { MsOAuthError, msRefreshScopes, refreshTokens, type MsOAuthConfig, type MsTokens } from "./oauth";

const aad = (userId: string) => `${userId}:microsoft`;

/** Encrypts a token set for storage (AES-256-GCM bound to the user, PLAN §2.3). */
export function sealTokens(userId: string, t: MsTokens): { enc_access: string; enc_refresh: string | null; expires_at: string } {
  return { enc_access: encryptToken(t.accessToken, { aad: aad(userId) }), enc_refresh: t.refreshToken ? encryptToken(t.refreshToken, { aad: aad(userId) }) : null, expires_at: t.expiresAt.toISOString() };
}

/**
 * Returns a valid access token for the connection, refreshing (and re-sealing) when it expires within 5 minutes.
 * On invalid_grant the connection is marked `expired` (the bot then sends err.connection_expired) and the error rethrown.
 * The refresh asks only for the scopes this connection was granted (msRefreshScopes) — never a newer, wider set.
 */
export async function getAccessToken(db: Db, cfg: MsOAuthConfig, connection: ConnectionRow, opts: { force?: boolean; now?: Date } = {}): Promise<string> {
  const secret = await db.getConnectionSecret(connection.id);
  if (!secret?.enc_access) throw new MsOAuthError("connection has no tokens", "invalid_grant", null);
  const now = opts.now ?? new Date();
  const expiresSoon = !secret.expires_at || Date.parse(secret.expires_at) - now.getTime() < 5 * 60_000;
  if (!opts.force && !expiresSoon) return decryptToken(secret.enc_access, { aad: aad(connection.user_id) });
  if (!secret.enc_refresh) throw new MsOAuthError("no refresh token", "invalid_grant", null);
  try {
    const fresh = await refreshTokens(cfg, decryptToken(secret.enc_refresh, { aad: aad(connection.user_id) }), msRefreshScopes(connection.scopes));
    const sealed = sealTokens(connection.user_id, { ...fresh, refreshToken: fresh.refreshToken ?? decryptToken(secret.enc_refresh, { aad: aad(connection.user_id) }) });
    await db.updateConnectionTokens(connection.id, sealed);
    return fresh.accessToken;
  } catch (e) {
    if (e instanceof MsOAuthError && e.needsReconnect) {
      await db.setConnectionStatus(connection.id, "expired");
      await db.addAudit({ user_id: connection.user_id, action: "connection.expired", target: connection.id, result: e.code });
      connectionExpiredAlert(db, connection);
    }
    throw e;
  }
}
