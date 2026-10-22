import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { setAiProviderForTests } from "@/lib/ai";
import { createDemoDb } from "@/lib/auth/demo-user";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { setDbForTests } from "@/lib/db";
import type { MemoryDb } from "@/lib/db/memory";
import { demoChatPhone, isDemoChatPhone } from "@/lib/demo-chat/phone";
import { replyAllowed } from "@/lib/demo-chat/service";
import type { ChatErrorResponse, ChatHistoryResponse, ChatItem, ChatPostResponse } from "@/lib/demo-chat/types";
import { setGlobalSingleton } from "@/lib/global-singleton";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { setSttProviderForTests } from "@/lib/stt";
import { MockStt } from "@/lib/stt/mock";
import { fakeOggOpus, fakeWebm } from "@/lib/stt/test-fixtures";
import { GET, POST } from "./route";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const APP = "https://alze-demo.vercel.app";
const URL_ = `${APP}/api/demo/chat`;
let ip = 0;
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `9.9.9.${++ip % 250}`, ...headers }, body: JSON.stringify(body) });
const audio = (bytes: Uint8Array, type: string, durationMs = 4000) => {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(bytes)], "voice.webm", { type }));
  form.append("durationMs", String(durationMs));
  return new Request(URL_, { method: "POST", headers: { "x-forwarded-for": "8.8.8.8" }, body: form });
};

type Post = ChatPostResponse | ChatErrorResponse;
const send = async (req: Request) => {
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Post };
};
const ok = (r: { status: number; body: Post }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as ChatPostResponse;
};
const history = async () => (await (await GET()).json()) as ChatHistoryResponse;
const texts = (items: ChatItem[]) => items.map((m) => m.text);

function stubDemo(extra: Record<string, string> = {}) {
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 12).toString("base64"));
  vi.stubEnv("APP_URL", APP);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

let db: MemoryDb;
let ai: MockProvider;
let stt: MockStt;

async function signIn(email: string): Promise<string> {
  const user = (await db.findUserByEmail(email)) ?? (await db.createUser(email));
  jar.set(SESSION_COOKIE, createSessionToken(user.id, { email }));
  return user.id;
}

beforeEach(() => {
  jar.clear();
  stubDemo();
  db = createDemoDb();
  setDbForTests(db);
  ai = new MockProvider();
  setAiProviderForTests(ai);
  stt = new MockStt();
  setSttProviderForTests(stt);
  setRateLimiterForTests(new MemoryRateLimiter());
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setAiProviderForTests(undefined);
  setSttProviderForTests(undefined);
  setRateLimiterForTests(undefined);
  for (const n of ["graph-fixture", "google-fixture", "hyp", "wa-sender", "mailer"]) setGlobalSingleton(n, undefined);
});

describe("/api/demo/chat — who may use it", () => {
  it("404 outside DEMO_MODE (GET and POST), 401 without a session", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATA_MODE", "memory");
    expect((await GET()).status).toBe(404);
    expect((await POST(json({ text: "היי" }))).status).toBe(404);
    stubDemo();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "unauthorized", message: "צריך להתחבר כדי לדבר עם עלזה כאן." });
    expect((await POST(json({ text: "היי" }))).status).toBe(401);
    jar.set(SESSION_COOKIE, "v1.forged.123.abc");
    expect((await POST(json({ text: "היי" }))).status).toBe(401);
  });

  it("refuses a cross-site POST (Origin of another site)", async () => {
    await signIn("dana@example.com");
    const r = await send(json({ text: "היי" }, { origin: "https://evil.example" }));
    expect(r.status).toBe(403);
    expect(ai.calls).toHaveLength(0);
    expect(ok(await send(json({ start: true }, { origin: APP }))).replies.length).toBeGreaterThan(0);
  });

  it("rate-limits per person (20 a minute) with a Hebrew 429", async () => {
    await signIn("dana@example.com");
    for (let i = 0; i < 20; i++) expect((await POST(json({ start: true }))).status).toBe(200);
    const r = await send(json({ start: true }));
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ ok: false, code: "rate_limited", message: "הרבה הודעות ברצף. אפשר לנסות שוב בעוד דקה." });
  });

  it("validates the body: empty, too long, unknown shape", async () => {
    await signIn("dana@example.com");
    expect((await send(json({ text: "   " }))).status).toBe(400);
    expect((await send(json({ text: "א".repeat(2001) }))).body).toMatchObject({ code: "too_long" });
    expect((await send(json({ nothing: true }))).status).toBe(400);
    expect((await send(new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(ai.calls).toHaveLength(0);
  });
});

describe("/api/demo/chat — the same pipeline as WhatsApp", () => {
  it("start: links the account's virtual number once, with the usual welcome and onboarding; the history keeps it", async () => {
    const userId = await signIn("dana@example.com");
    expect(await history()).toMatchObject({ ok: true, linked: false, liveAi: false, awaiting: false, items: [] });
    const start = ok(await send(json({ start: true })));
    expect(start.user).toBeNull();
    expect(texts(start.replies)[0]).toBe("החשבון מקושר. מעכשיו אפשר לכתוב לי כאן.");
    expect(start.replies[1]).toMatchObject({ side: "bot", kind: "buttons", buttons: [{ id: "onb:tour", title: "סיור קצר" }, { id: "onb:start", title: "נתחיל לעבוד" }] });
    const identity = (await db.listWaIdentities(userId))[0]!;
    expect(identity.phone_e164).toBe(demoChatPhone(userId));
    expect(isDemoChatPhone(identity.phone_e164)).toBe(true);
    expect(db.audit.at(-1)).toMatchObject({ action: "wa.link", target: "demo-chat" });
    // idempotent
    expect(ok(await send(json({ start: true }))).replies).toEqual([]);
    const h = await history();
    expect(h.linked).toBe(true);
    expect(h.items.map((m) => [m.side, m.kind])).toEqual([
      ["bot", "text"],
      ["bot", "buttons"],
    ]);
    expect(h.items[1]!.buttons!.map((b) => b.id)).toEqual(["onb:tour", "onb:start"]);
    // nothing of this reaches the model's context (on WhatsApp these are never stored at all)
    expect(await db.recentMessages(userId, 10, { forModel: true })).toEqual([]);
  });

  it("text → button → draft → 'בטל': replies come back in order, the draft's buttons are the person's own, the history matches", async () => {
    const userId = await signIn("dana@example.com");
    await send(json({ start: true }));
    const go = ok(await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } })));
    expect(go.user).toMatchObject({ side: "user", kind: "choice", text: "נתחיל לעבוד" });
    expect(texts(go.replies)[0]).toContain("ננסה משהו אמיתי");

    const draft = ok(await send(json({ text: "תנסחי מייל לדנה שהפגישה זזה ליום ה׳" })));
    expect(draft.user).toMatchObject({ side: "user", kind: "text", text: "תנסחי מייל לדנה שהפגישה זזה ליום ה׳" });
    const card = draft.replies.find((m) => m.kind === "buttons")!;
    expect(card.text).toContain("*טיוטה למייל*");
    expect(card.buttons!.map((b) => b.title)).toEqual(["שלח", "ערוך", "בטל"]);
    // after the first task, onboarding asks the name
    expect(texts(draft.replies).at(-1)).toBe("כדי שנדבר בנוח — איך לקרוא לך?");
    const cancel = card.buttons!.find((b) => b.title === "בטל")!;
    expect(cancel.id).toMatch(/^pa:cancel:[0-9a-f-]{36}$/);

    const done = ok(await send(json({ reply: { id: cancel.id, title: "בטל" } })));
    expect(texts(done.replies)).toEqual(["בוטל. הטיוטה נמחקה ולא נשלחה."]);
    expect((await db.listPendingActions(userId, "cancelled")).length).toBe(1);

    // reload: the same conversation, in order, without the assistant's unsent one-liner next to the draft
    const items = (await history()).items;
    expect(items.map((m) => `${m.side}:${m.kind}`)).toEqual([
      "bot:text",
      "bot:buttons",
      "user:choice",
      "bot:text",
      "user:text",
      "bot:buttons",
      "bot:text",
      "user:choice",
      "bot:text",
    ]);
    expect(texts(items)).not.toContain("הכנתי טיוטה — לשלוח?");
    expect(items[5]!.buttons!.map((b) => b.title)).toEqual(["שלח", "ערוך", "בטל"]);
  });

  it("a button that is not the person's own is refused before the pipeline (another user's draft, a forged id)", async () => {
    // Noa has a pending draft
    const noa = await signIn("noa@example.com");
    await send(json({ start: true }));
    await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } }));
    const card = ok(await send(json({ text: "תנסחי מייל לדנה" }))).replies.find((m) => m.kind === "buttons")!;
    const approveNoa = card.buttons![0]!.id;

    // Dana presses it
    const dana = await signIn("dana@example.com");
    await send(json({ start: true }));
    const before = (await db.recentMessages(dana, 100)).length;
    const r = await send(json({ reply: { id: approveNoa, title: "שלח" } }));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ ok: false, code: "forbidden", message: "הכפתור הזה לא שייך לשיחה הזו." });
    expect((await db.recentMessages(dana, 100)).length).toBe(before); // nothing stored, nothing processed
    expect((await db.listPendingActions(noa, "pending")).length).toBe(1); // Noa's draft untouched

    for (const id of ["pa:approve:not-a-uuid", "rem:done:11111111-1111-4111-8111-111111111111", "bill:ok:11111111-1111-4111-8111-111111111111", "ag:del:yes:11111111-1111-4111-8111-111111111111", "x:y", "evil", "onb:start:11111111-1111-4111-8111-111111111111"]) {
      expect((await send(json({ reply: { id, title: "x" } }))).status, id).toBe(403);
    }
    expect(await replyAllowed(db, dana, "ag:save")).toBe(true);
    expect(await replyAllowed(db, dana, "pain_email")).toBe(true);
    expect(await replyAllowed(db, dana, "mt_0730")).toBe(true);
    expect(await replyAllowed(db, dana, "pain_11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(await replyAllowed(db, dana, "bill:card")).toBe(true);
    expect(await replyAllowed(db, noa, approveNoa)).toBe(true);
  });

  it("onboarding lists: the name, the business, then a list reply (pain) and the morning-time list", async () => {
    await signIn("dana@example.com");
    await send(json({ start: true }));
    await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } }));
    await send(json({ text: "תודה" })); // the first task → the name question
    await send(json({ text: "דנה" }));
    const business = ok(await send(json({ text: "משרד לוי" })));
    const pain = business.replies.find((m) => m.kind === "list")!;
    expect(pain.list!.button).toBe("לבחירה");
    expect(pain.list!.sections[0]!.rows.map((r) => r.id)).toContain("pain_email");
    const next = ok(await send(json({ reply: { id: "pain_email", title: "מיילים שמחכים לתשובה", list: true } })));
    expect(next.user).toMatchObject({ kind: "choice", text: "מיילים שמחכים לתשובה" });
    expect(next.replies.at(-1)).toMatchObject({ kind: "list", list: { sections: [{ rows: expect.arrayContaining([{ id: "mt_0730", title: "07:30" }]) }] } });
    // the list survives a reload (rows and the open button)
    const items = (await history()).items;
    expect(items.at(-1)).toMatchObject({ kind: "list", list: { button: "לבחירה" } });
  });

  it("a request instead of the name is answered, never stored as the name, and the question comes again; 'awaiting' follows the questions", async () => {
    const userId = await signIn("dana@example.com");
    await send(json({ start: true }));
    const go = ok(await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } })));
    expect(go.awaiting).toBe(false); // the first task: the suggested requests fit
    const first = ok(await send(json({ text: "מה יש לי מחר?" })));
    expect(texts(first.replies).at(-1)).toBe("כדי שנדבר בנוח — איך לקרוא לך?");
    expect(first.awaiting).toBe(true);
    expect((await history()).awaiting).toBe(true);

    // the page's own suggestion, tapped while the name question is open (the review's repro)
    const req = ok(await send(json({ text: "תזכירי לי מחר ב-9 להתקשר לבנק" })));
    expect(texts(req.replies)[0]).toMatch(/^אזכיר: להתקשר לבנק/);
    expect(texts(req.replies).at(-1)).toBe("ועוד דבר קטן, כדי שנדבר בנוח: איך לקרוא לך?");
    expect(texts(req.replies).join("\n")).not.toContain("נעים להכיר");
    expect((await db.getUser(userId))!.name).toBeNull();
    expect(req.awaiting).toBe(true);

    // a thank-you is not a name either; then the real name
    expect(texts(ok(await send(json({ text: "תודה" }))).replies)).toEqual(["כדי שנדבר בנוח — איך לקרוא לך?"]);
    const named = ok(await send(json({ text: "קוראים לי דנה" })));
    expect(texts(named.replies)).toEqual(["נעים להכיר, דנה. מה שם העסק או המשרד?"]);
    expect((await db.getUser(userId))!.name).toBe("דנה");

    // a request instead of the business name: answered, asked again, not stored
    const draft = ok(await send(json({ text: "תנסחי מייל לדנה שהפגישה זזה ליום ה׳" })));
    expect(draft.replies.find((m) => m.kind === "buttons")!.text).toContain("*טיוטה למייל*");
    expect(texts(draft.replies).at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
    expect((await db.getUser(userId))!.business_name ?? null).toBeNull();
    const business = ok(await send(json({ text: "משרד לוי" })));
    expect((await db.getUser(userId))!.business_name).toBe("משרד לוי");
    expect(business.awaiting).toBe(true); // the pain list
    const pain = ok(await send(json({ reply: { id: "pain_email", title: "מיילים שמחכים לתשובה", list: true } })));
    expect(pain.awaiting).toBe(true); // the morning-time list
    const morning = ok(await send(json({ reply: { id: "mt_none", title: "בלי סיכום", list: true } })));
    expect(morning.awaiting).toBe(false); // the connect nudge: free text is fine there
  });

  it("a recording goes through the voice path (in-memory media → STT → the transcript, answered as text)", async () => {
    const userId = await signIn("dana@example.com");
    await send(json({ start: true }));
    await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } }));
    const r = ok(await send(audio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]), "audio/webm;codecs=opus")));
    expect(stt.calls).toHaveLength(1);
    expect(stt.calls[0]!.audio.mimeType).toBe("audio/webm;codecs=opus");
    expect(Array.from(stt.calls[0]!.audio.bytes)).toEqual([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
    expect(r.user).toMatchObject({ side: "user", kind: "voice", transcript: "תזכיר לי מחר ב-9 להתקשר לבנק" });
    expect(texts(r.replies)).not.toContain("מקשיבה…"); // the page shows its typing dots instead
    expect(texts(r.replies)[0]).toMatch(/^אזכיר: להתקשר לבנק/);
    expect((await db.recentMessages(userId, 50)).find((m) => m.type === "audio")).toMatchObject({ direction: "in", transcript: "תזכיר לי מחר ב-9 להתקשר לבנק" });
  });

  it("the recording's length is kept on the inbound row: the history shows it after a reload", async () => {
    await signIn("dana@example.com");
    await send(json({ start: true }));
    await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } }));
    const measured = ok(await send(audio(fakeWebm(4000), "audio/webm;codecs=opus", 9000)));
    expect(measured.user).toMatchObject({ kind: "voice", durationMs: 3800 }); // measured from the file, not the page's figure
    const items = (await history()).items.filter((m) => m.kind === "voice");
    expect(items.map((m) => m.durationMs)).toEqual([3800]);
    const said = ok(await send(audio(new Uint8Array([0, 0, 0, 1, 2, 3]), "audio/mp4", 3200)));
    expect(said.user).toMatchObject({ kind: "voice", durationMs: 3200 }); // mp4: what the page measured
  });

  it("recording limits: type, size and (Ogg, WebM) length — 400 / 413 before any STT call", async () => {
    await signIn("dana@example.com");
    expect((await send(audio(new Uint8Array([1, 2, 3]), "video/mp4"))).status).toBe(400);
    for (const type of ["audio/mpeg", "audio/wav", "audio/aac"]) expect((await send(audio(new Uint8Array([1, 2, 3]), type))).status, type).toBe(400); // not what a browser records
    expect((await send(audio(new Uint8Array(2 * 1024 * 1024 + 1), "audio/webm"))).status).toBe(413);
    expect((await send(audio(new Uint8Array(512 * 1024 + 1), "audio/mp4"))).status).toBe(413);
    expect((await send(audio(fakeOggOpus(65_000), "audio/ogg"))).status).toBe(413);
    expect((await send(audio(fakeWebm(65_000), "audio/webm;codecs=opus", 4000))).status).toBe(413); // the page's figure is not trusted
    // a chunked upload (no Content-Length) is cut off at the limit, never buffered whole
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 64 * 1024;
        c.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const chunked = new Request(URL_, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "x-forwarded-for": "7.7.7.7" }, body: endless, duplex: "half" } as RequestInit);
    expect((await send(chunked)).status).toBe(413);
    expect(pulled).toBeLessThan(1024 * 1024);
    expect((await send(audio(new Uint8Array([1, 2]), "audio/webm", 90_000))).status).toBe(413);
    expect((await send(audio(new Uint8Array(0), "audio/webm"))).status).toBe(400);
    expect(stt.calls).toHaveLength(0);
  });

  it("LIVE_AI=1 with the day's budget spent: the calm line, and no model call at all", async () => {
    vi.stubEnv("LIVE_AI", "1");
    vi.stubEnv("AI_DAILY_BUDGET_USD", "0");
    await signIn("dana@example.com");
    expect((await history()).liveAi).toBe(true);
    await send(json({ start: true }));
    await send(json({ reply: { id: "onb:start", title: "נתחיל לעבוד" } }));
    const r = ok(await send(json({ text: "מה יש לי מחר?" })));
    expect(texts(r.replies)).toEqual(["הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר."]);
    expect(ai.calls).toHaveLength(0);
    const v = ok(await send(audio(new Uint8Array([1, 2, 3]), "audio/ogg")));
    expect(texts(v.replies)).toEqual(["הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר."]);
    expect(stt.calls).toHaveLength(0);
  });
});
