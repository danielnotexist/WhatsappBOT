import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, createAdminToken } from "@/lib/admin/tokens";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";

/**
 * The gate of the pages about one user that open in their own tab — /admin/users/<id>/conversation and /activity —
 * the same as the user's card (lib/admin/user-view.ts): anyone but the owner with an open panel, a malformed id or an
 * unknown user gets notFound(); the owner's view is written to the audit log. Mocks as in lib/admin/auth.test.ts.
 */
const h = vi.hoisted(() => {
  class NotFound extends Error {
    readonly digest = "NEXT_HTTP_ERROR_FALLBACK;404";
  }
  return { NotFound, session: null as { userId: string } | null, jar: new Map<string, string>() };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new h.NotFound("not found");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void h.jar.set(name, value),
    delete: (opt: string | { name: string }) => void h.jar.delete(typeof opt === "string" ? opt : opt.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

const { ConversationView } = await import("./conversation/view");
const { ActivityView } = await import("./activity/view");

const OWNER = "danielnotexist@gmail.com";
let db: MemoryDb;

beforeEach(() => {
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("DATA_MODE", "memory");
  vi.stubEnv("ADMIN_EMAILS", "");
  db = new MemoryDb();
  setDbForTests(db);
  h.jar.clear();
  h.session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
});

const views = [
  ["conversation", "admin.view_conversation", (id: string) => ConversationView({ params: Promise.resolve({ id }) })],
  ["activity", "admin.view_activity", (id: string) => ActivityView({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })],
] as const;

describe.each(views)("/admin/users/<id>/%s", (_name, action, render) => {
  it("no session, a regular user, or the owner without the panel cookie: 404, and nothing is audited", async () => {
    const target = await db.createUser("dana@example.com");
    await expect(render(target.id)).rejects.toBeInstanceOf(h.NotFound);

    const regular = await db.createUser("someone@example.com");
    h.session = { userId: regular.id };
    h.jar.set(ADMIN_COOKIE, createAdminToken(regular.id));
    await expect(render(target.id)).rejects.toBeInstanceOf(h.NotFound);

    const owner = await db.createUser(OWNER);
    h.session = { userId: owner.id };
    h.jar.clear();
    await expect(render(target.id)).rejects.toBeInstanceOf(h.NotFound);
    expect(db.audit.filter((a) => a.action.startsWith("admin.view"))).toEqual([]);
  });

  it("the owner with the panel open: a malformed or unknown id is a 404; a real user renders and the view is audited", async () => {
    const owner = await db.createUser(OWNER);
    h.session = { userId: owner.id };
    h.jar.set(ADMIN_COOKIE, createAdminToken(owner.id));
    await expect(render("not-a-uuid")).rejects.toBeInstanceOf(h.NotFound);
    await expect(render("11111111-1111-4111-8111-111111111111")).rejects.toBeInstanceOf(h.NotFound);

    const target = await db.createUser("dana@example.com");
    await db.insertMessage({ user_id: target.id, direction: "in", text: "שלום" });
    expect(await render(target.id)).toBeTruthy();
    expect(db.audit.filter((a) => a.action === action)).toEqual([expect.objectContaining({ user_id: owner.id, target: target.id, result: "ok" })]);
  });
});
