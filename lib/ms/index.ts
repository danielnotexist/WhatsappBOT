import "server-only";
import type { ConnectionRow, Db, UserRow } from "@/lib/db/types";
import { dataMode } from "@/lib/env";
import { globalSingleton } from "@/lib/global-singleton";
import { createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient } from "./graph";
import { msOAuthConfigFromEnv, type MsOAuthConfig } from "./oauth";
import { getAccessToken } from "./token-store";

/** OAuth config: real from env, or a fixture-backed one in DATA_MODE=memory (no Entra app needed to develop). */
export function getMsConfig(): MsOAuthConfig {
  if (dataMode() === "memory") {
    return { clientId: "memory-client", clientSecret: "memory-secret", tenant: "common", redirectUri: new URL("/api/auth/microsoft/callback", process.env.APP_URL || "http://localhost:3000").toString(), fetchImpl: memoryTokenFetch() };
  }
  return msOAuthConfigFromEnv();
}

/** In memory mode the token endpoint always succeeds and Graph is served from fixtures. */
function memoryTokenFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ access_token: "memory-access", refresh_token: "memory-refresh", expires_in: 3600, scope: "Mail.ReadWrite", id_token: "e30." + Buffer.from(JSON.stringify({ tid: "memory-tenant", oid: "u1", preferred_username: "dana@levi-law.co.il", name: "דנה לוי" })).toString("base64url") + ".x" }), { status: 200 })) as typeof fetch;
}

export function getGraphFetch(): typeof fetch | undefined {
  if (dataMode() !== "memory") return undefined;
  return globalSingleton("graph-fixture", () => createGraphFixture()).fetchImpl;
}

/** A Graph client bound to a connection's token store (refresh on expiry, retry once on 401). */
export function graphForConnection(db: Db, connection: ConnectionRow): GraphClient {
  const cfg = getMsConfig();
  return new GraphClient({
    getAccessToken: () => getAccessToken(db, cfg, connection),
    onUnauthorized: () => getAccessToken(db, cfg, connection, { force: true }).catch(() => null),
    fetchImpl: getGraphFetch(),
  });
}

export function activeMicrosoftConnection(connections: ConnectionRow[]): ConnectionRow | null {
  return connections.find((c) => c.provider === "microsoft" && c.status === "active") ?? null;
}

/** Graph + time zone for the user's active Microsoft connection, or null. */
export async function graphForUser(db: Db, user: UserRow): Promise<{ graph: GraphClient; timeZone: string; connection: ConnectionRow } | null> {
  const connection = activeMicrosoftConnection(await db.listConnections(user.id));
  if (!connection) return null;
  return { graph: graphForConnection(db, connection), timeZone: user.timezone, connection };
}
