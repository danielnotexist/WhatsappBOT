import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
const h = vi.hoisted(() => ({ session: null as { userId: string } | null }));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

let db: MemoryDb;
beforeEach(() => {
  db = new MemoryDb();
  setDbForTests(db);
});
afterEach(() => {
  setDbForTests(undefined);
  vi.unstubAllEnvs();
  h.session = null;
});

const post = (body: unknown) => POST(new Request("http://localhost/api/dev/billing", { method: "POST", body: JSON.stringify(body) }));

describe("/api/dev/billing (memory-mode development only)", () => {
  it("moves the session user's next charge and reads the subscription back", async () => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("NODE_ENV", "development");
    const u = await db.createUser("a@example.com");
    db.seedSubscription(u.id, "basic", "active");
    h.session = { userId: u.id };
    const r = await (await post({ daysLeft: 183 })).json();
    expect(r.ok).toBe(true);
    expect(Math.round((Date.parse(r.nextChargeAt) - Date.now()) / 86_400_000)).toBe(183);
    expect(await (await GET()).json()).toMatchObject({ plan: "basic", status: "active", cycle: "monthly", scheduledCycle: null, nextChargeAt: r.nextChargeAt });
    expect((await post({ daysLeft: 0 })).status).toBe(400);
    expect((await post({ daysLeft: 1.5 })).status).toBe(400);
  });

  it("is a 404 outside memory mode, in production and without a session", async () => {
    const u = await db.createUser("a@example.com");
    h.session = { userId: u.id };
    vi.stubEnv("DATA_MODE", "supabase");
    expect((await post({ daysLeft: 3 })).status).toBe(404);
    expect((await GET()).status).toBe(404);
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ daysLeft: 3 })).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    h.session = null;
    expect((await GET()).status).toBe(404);
  });
});
