import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAiProviderForTests } from "@/lib/ai";
import { MockProvider } from "@/lib/ai/mock";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { KNOWLEDGE } from "@/lib/support/knowledge";

/**
 * The website support chat is kept for the support team (migration 0015 support_chats, the admin panel's "צ'אט באתר"):
 * each question and answer under the conversation's id, linked to the account when signed in. A failure to store never
 * costs the visitor the answer.
 */
const h = vi.hoisted(() => ({ session: null as { userId: string } | null }));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

const { POST } = await import("./route");

const APP = "https://alze.example";
const CHAT = "d6666666-6666-4666-8666-666666666666";
let ip = 0;
const req = (body: unknown) =>
  new Request(`${APP}/api/support/chat`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip % 250}` }, body: JSON.stringify(body) });

let db: MemoryDb;
beforeEach(() => {
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("DATA_MODE", "memory");
  db = new MemoryDb();
  setDbForTests(db);
  setAiProviderForTests(new MockProvider());
  setRateLimiterForTests(new MemoryRateLimiter());
  h.session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTests(undefined);
  setAiProviderForTests(undefined);
  setRateLimiterForTests(undefined);
});

describe("/api/support/chat — the conversation is stored", () => {
  it("an anonymous visitor: the question and the answer under the chat id, with the page", async () => {
    const res = await POST(req({ message: "כמה זה עולה?", chatId: CHAT, page: "/pricing" }));
    expect(res.status).toBe(200);
    const [chat] = await db.listSupportChats({ limit: 5 });
    expect(chat).toMatchObject({ id: CHAT, user_id: null, page: "/pricing" });
    expect(chat!.turns.map((t) => [t.role, t.text])).toEqual([
      ["user", "כמה זה עולה?"],
      ["assistant", KNOWLEDGE.find((e) => e.id === "pricing")!.answer],
    ]);
  });

  it("the next question joins the same chat; signing in links it to the account", async () => {
    await POST(req({ message: "כמה זה עולה?", chatId: CHAT, page: "/" }));
    const user = await db.createUser("dana@example.com");
    h.session = { userId: user.id };
    await POST(req({ message: "איך מתחברים?", chatId: CHAT, page: "/account" }));
    const chats = await db.listSupportChats({ userId: user.id, limit: 5 });
    expect(chats).toHaveLength(1);
    expect(chats[0]!.turns).toHaveLength(4);
    // another signed-in person cannot write into it
    const other = await db.createUser("other@example.com");
    h.session = { userId: other.id };
    expect((await POST(req({ message: "שלום", chatId: CHAT }))).status).toBe(200);
    expect((await db.listSupportChats({ limit: 5 }))[0]!.turns).toHaveLength(4);
  });

  it("without a chat id nothing is stored; a bad id or page is refused; a storage failure still answers", async () => {
    await POST(req({ message: "כמה זה עולה?" }));
    expect(db.supportChats).toEqual([]);
    expect((await POST(req({ message: "x", chatId: "not-a-uuid" }))).status).toBe(400);
    expect((await POST(req({ message: "x", chatId: CHAT, page: "https://evil.example/" }))).status).toBe(400);
    db.appendSupportChat = async () => {
      throw new Error("relation support_chats does not exist");
    };
    const res = await POST(req({ message: "כמה זה עולה?", chatId: CHAT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, topic: "pricing" });
    expect((await db.listAppErrors({ limit: 5 }))[0]).toMatchObject({ source: "support.chat" });
  });
});
