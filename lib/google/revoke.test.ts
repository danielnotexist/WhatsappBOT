import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE_CONFIRM_WORD, deleteAccountFor, disconnectConnectionFor } from "@/lib/account/service";
import { MemoryDb } from "@/lib/db/memory";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { createGoogleFixture } from "./__fixtures__/google-fixtures";
import { revokeAtProvider, revokeGoogleConnection } from "./revoke";
import { sealGoogleTokens } from "./token-store";

async function seeded(db: MemoryDb, email = "dana@example.com") {
  const user = await db.createUser(email);
  const conn = await db.upsertConnection({ user_id: user.id, provider: "google", account_email: "dana.levi@gmail.com", tenant_id: null, scopes: [], consent_type: "user", ...sealGoogleTokens(user.id, { accessToken: "ya29.a", refreshToken: "1//refresh", expiresAt: new Date(Date.now() + 3_600_000) }) });
  return { user, conn };
}

describe("Google revoke on disconnect and account deletion", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    setGlobalSingleton("google-fixture", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("disconnect revokes the refresh token at Google before wiping it locally", async () => {
    const db = new MemoryDb();
    const { user, conn } = await seeded(db);
    const f = createGoogleFixture();
    const r = await disconnectConnectionFor(db, user.id, conn.id, (d, c) => revokeGoogleConnection(d, c, f.fetchImpl));
    expect(r).toEqual({ ok: true, message: "החיבור ל-Google נותק." });
    expect(f.state.revoked).toEqual(["1//refresh"]);
    expect((await db.listConnections(user.id))[0]!.status).toBe("revoked");
    expect(await db.getConnectionSecret(conn.id)).toBeNull();
    expect(db.audit.map((a) => [a.action, a.result])).toEqual([
      ["google.revoke", "revoked:200"],
      ["connection.revoke", "ok"],
    ]);
  });

  it("a failed revoke is audited but never blocks the disconnect; Microsoft rows are left to the local wipe", async () => {
    const db = new MemoryDb();
    const { user, conn } = await seeded(db);
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(await revokeGoogleConnection(db, conn, down)).toBe("failed");
    expect(db.audit.at(-1)).toMatchObject({ action: "google.revoke", result: "failed:http_503" });
    const throwing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await revokeGoogleConnection(db, conn, throwing)).toBe("failed");
    expect((await disconnectConnectionFor(db, user.id, conn.id, (d, c) => revokeGoogleConnection(d, c, throwing))).ok).toBe(true);
    const ms = db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
    expect(await revokeAtProvider(db, ms)).toBe("no_token");
    expect(await revokeGoogleConnection(db, db.seedConnection(user.id, "google", "x@gmail.com"))).toBe("no_token");
  });

  it("account deletion revokes every Google connection (memory mode → fixture) before the cascade", async () => {
    vi.stubEnv("DATA_MODE", "memory");
    const db = new MemoryDb();
    const { user } = await seeded(db);
    expect(await deleteAccountFor(db, user.id, DELETE_CONFIRM_WORD)).toEqual({ ok: true, message: "החשבון נמחק." });
    expect(globalSingleton("google-fixture", () => createGoogleFixture()).state.revoked).toEqual(["1//refresh"]);
    expect(await db.getUser(user.id)).toBeNull();
    expect(db.audit.some((a) => a.action === "google.revoke" && a.result === "revoked:200")).toBe(true);
  });
});
