import "server-only";
import type { ConnectionRow, Db, UserRow } from "@/lib/db/types";
import { dataMode } from "@/lib/env";
import { globalSingleton } from "@/lib/global-singleton";
import { createGoogleFixture } from "./__fixtures__/google-fixtures";
import { GoogleClient } from "./client";
import { GOOGLE_CALLBACK_PATH, googleOAuthConfigFromEnv, type GoogleOAuthConfig } from "./oauth";
import { getGoogleAccessToken } from "./token-store";

/** One fake `fetch` for every Google host in DATA_MODE=memory (token, revoke, Calendar, Drive, Gmail). */
function memoryFixture() {
  return globalSingleton("google-fixture", () => createGoogleFixture());
}

/** OAuth config: real from env, or a fixture-backed one in DATA_MODE=memory (no GCP project needed to develop). */
export function getGoogleConfig(): GoogleOAuthConfig {
  if (dataMode() === "memory") {
    return { clientId: "memory-google-client", clientSecret: "memory-google-secret", redirectUri: new URL(GOOGLE_CALLBACK_PATH, process.env.APP_URL || "http://localhost:3000").toString(), fetchImpl: memoryFixture().fetchImpl };
  }
  return googleOAuthConfigFromEnv();
}

/** `fetch` for Google APIs: the fixture in memory mode, the real one otherwise. */
export function getGoogleFetch(): typeof fetch | undefined {
  return dataMode() === "memory" ? memoryFixture().fetchImpl : undefined;
}

/** A Google client bound to a connection's token store (refresh on expiry, retry once on 401). */
export function googleForConnection(db: Db, connection: ConnectionRow): GoogleClient {
  const cfg = getGoogleConfig();
  return new GoogleClient({
    getAccessToken: () => getGoogleAccessToken(db, cfg, connection),
    onUnauthorized: () => getGoogleAccessToken(db, cfg, connection, { force: true }).catch(() => null),
    fetchImpl: getGoogleFetch(),
  });
}

export function activeGoogleConnection(connections: ConnectionRow[]): ConnectionRow | null {
  return connections.find((c) => c.provider === "google" && c.status === "active") ?? null;
}

/** Google client + time zone for the user's active Google connection, or null. */
export async function googleForUser(db: Db, user: UserRow): Promise<{ google: GoogleClient; timeZone: string; connection: ConnectionRow } | null> {
  const connection = activeGoogleConnection(await db.listConnections(user.id));
  if (!connection) return null;
  return { google: googleForConnection(db, connection), timeZone: user.timezone, connection };
}
