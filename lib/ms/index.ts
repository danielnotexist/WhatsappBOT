import "server-only";
import type { ConnectionRow, Db, UserRow } from "@/lib/db/types";
import { msMocked } from "@/lib/env";
import { globalSingleton } from "@/lib/global-singleton";
import { createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient } from "./graph";
import { MS_SCOPES, msOAuthConfigFromEnv, type MsOAuthConfig } from "./oauth";
import { getAccessToken } from "./token-store";

/** OAuth config: real from env, or a fixture-backed one in DATA_MODE=memory / DEMO_MODE=1 (no Entra app needed, even when MS_* keys exist) — real again in the demo with LIVE_MS=1. */
export function getMsConfig(): MsOAuthConfig {
  if (msMocked()) {
    return { clientId: "memory-client", clientSecret: "memory-secret", tenant: "common", redirectUri: new URL("/api/auth/microsoft/callback", process.env.APP_URL || "http://localhost:3000").toString(), fetchImpl: memoryTokenFetch() };
  }
  return msOAuthConfigFromEnv();
}

/**
 * The memory-mode id_token's claims: a work account whose email the domain owner verified (`xms_edov`), so Sign in with
 * Microsoft trusts it (lib/auth/sso.ts). Tests swap them through the global singleton "ms-fixture-claims" — a personal
 * account, or one Microsoft does not vouch for.
 */
export const MS_FIXTURE_CLAIMS: Readonly<Record<string, unknown>> = { tid: "memory-tenant", oid: "u1", preferred_username: "dana@levi-law.co.il", email: "dana@levi-law.co.il", xms_edov: true, name: "דנה לוי" };

/** In memory mode the token endpoint always succeeds (granting the full current scope set) and Graph is served from fixtures. */
function memoryTokenFetch(): typeof fetch {
  return (async () => {
    const claims = globalSingleton<Record<string, unknown>>("ms-fixture-claims", () => ({ ...MS_FIXTURE_CLAIMS }));
    // the binding claims a real v2.0 id_token has (checkMsIdToken): this app, Microsoft's issuer for the tenant, valid now
    const now = Math.floor(Date.now() / 1000);
    const bound = { aud: "memory-client", iss: `https://login.microsoftonline.com/${String(claims.tid)}/v2.0`, iat: now, nbf: now, exp: now + 3600, ...claims };
    return new Response(JSON.stringify({ access_token: "memory-access", refresh_token: "memory-refresh", expires_in: 3600, scope: MS_SCOPES.filter((s) => s !== "offline_access").join(" "), id_token: "e30." + Buffer.from(JSON.stringify(bound)).toString("base64url") + ".x" }), { status: 200 });
  }) as typeof fetch;
}

export function getGraphFetch(): typeof fetch | undefined {
  if (!msMocked()) return undefined;
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

/** The account the assistant works with: the most recently connected active one (the list is oldest first). */
export function activeMicrosoftConnection(connections: ConnectionRow[]): ConnectionRow | null {
  return connections.findLast((c) => c.provider === "microsoft" && c.status === "active") ?? null;
}

/** Graph + time zone for the user's active Microsoft connection, or null. */
export async function graphForUser(db: Db, user: UserRow): Promise<{ graph: GraphClient; timeZone: string; connection: ConnectionRow } | null> {
  const connection = activeMicrosoftConnection(await db.listConnections(user.id));
  if (!connection) return null;
  return { graph: graphForConnection(db, connection), timeZone: user.timezone, connection };
}
