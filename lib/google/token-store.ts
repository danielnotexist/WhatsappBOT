import { connectionExpiredAlert } from "@/lib/admin/alerts";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { ConnectionRow, Db } from "@/lib/db/types";
import { GoogleOAuthError, refreshGoogleTokens, type GoogleOAuthConfig, type GoogleTokens } from "./oauth";

/** AES-256-GCM associated data: a sealed Google token only decrypts for the same user + provider (PLAN §2.3). */
export const googleAad = (userId: string) => `${userId}:google`;

export function sealGoogleTokens(userId: string, t: Pick<GoogleTokens, "accessToken" | "refreshToken" | "expiresAt">): { enc_access: string; enc_refresh: string | null; expires_at: string } {
  return {
    enc_access: encryptToken(t.accessToken, { aad: googleAad(userId) }),
    enc_refresh: t.refreshToken ? encryptToken(t.refreshToken, { aad: googleAad(userId) }) : null,
    expires_at: t.expiresAt.toISOString(),
  };
}

/** The stored refresh token in clear (for revoke / to keep it when a re-consent returns none), or null. */
export async function storedGoogleRefreshToken(db: Db, connection: Pick<ConnectionRow, "id" | "user_id">): Promise<string | null> {
  const secret = await db.getConnectionSecret(connection.id);
  return secret?.enc_refresh ? decryptToken(secret.enc_refresh, { aad: googleAad(connection.user_id) }) : null;
}

/**
 * A valid access token for the connection: the sealed one while it has >5 minutes left, otherwise a refresh
 * (re-sealed; Google normally returns no new refresh token, so the old one is kept).
 * `invalid_grant` (revoked, 6 months unused, testing-mode 7-day expiry, password change) → the connection is
 * marked `expired` and audited; the bot then offers a reconnect link (lib/google/chat.ts) and the error is rethrown.
 */
export async function getGoogleAccessToken(db: Db, cfg: GoogleOAuthConfig, connection: ConnectionRow, opts: { force?: boolean; now?: Date } = {}): Promise<string> {
  const secret = await db.getConnectionSecret(connection.id);
  if (!secret?.enc_access) throw new GoogleOAuthError("connection has no tokens", "invalid_grant");
  const now = opts.now ?? new Date();
  const expiresSoon = !secret.expires_at || Date.parse(secret.expires_at) - now.getTime() < 5 * 60_000;
  if (!opts.force && !expiresSoon) return decryptToken(secret.enc_access, { aad: googleAad(connection.user_id) });
  if (!secret.enc_refresh) throw await markExpired(db, connection, new GoogleOAuthError("no refresh token", "invalid_grant"));
  const refreshToken = decryptToken(secret.enc_refresh, { aad: googleAad(connection.user_id) });
  try {
    const fresh = await refreshGoogleTokens(cfg, refreshToken);
    await db.updateConnectionTokens(connection.id, sealGoogleTokens(connection.user_id, { ...fresh, refreshToken: fresh.refreshToken ?? refreshToken }));
    return fresh.accessToken;
  } catch (e) {
    if (e instanceof GoogleOAuthError && e.needsReconnect) throw await markExpired(db, connection, e);
    throw e;
  }
}

async function markExpired(db: Db, connection: ConnectionRow, e: GoogleOAuthError): Promise<GoogleOAuthError> {
  await db.setConnectionStatus(connection.id, "expired");
  await db.addAudit({ user_id: connection.user_id, action: "connection.expired", target: connection.id, result: `google:${e.code}` });
  connectionExpiredAlert(db, connection);
  return e;
}
