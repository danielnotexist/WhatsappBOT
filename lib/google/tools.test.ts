import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/lib/ai/tools";
import { clearExecutorsForTests, registerExecutor, type ActionExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import type { ConnectionRow, PendingActionRow } from "@/lib/db/types";
import { MemoryDb } from "@/lib/db/memory";
import { createGoogleFixture } from "./__fixtures__/google-fixtures";
import { GoogleApiError, GoogleClient } from "./client";
import { providerForAction, routeExecutorsByProvider } from "./dispatch";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, GoogleOAuthError, normalizeScopes } from "./oauth";
import { googleExecutors, googleTools } from "./tools";

const decodeWords = (s: string) => s.replace(/\r\n /g, "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));
const TZ = "Asia/Jerusalem";

async function googleUser(h: ReturnType<typeof makeHarness>, scopes: string[] = normalizeScopes([...GOOGLE_BASE_SCOPES])) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  const conn = h.db.seedConnection(user.id, "google", "dana.levi@gmail.com");
  conn.scopes = scopes;
  const fixture = createGoogleFixture();
  const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fixture.fetchImpl });
  const tools = googleTools({ google: async () => google, timeZone: TZ, scopes: conn.scopes, accountEmail: conn.account_email });
  h.ctx.extraTools = async () => tools;
  const ex = googleExecutors(async () => ({ google, timeZone: TZ, connection: conn }));
  for (const [kind, fn] of Object.entries(ex)) registerExecutor(kind as keyof typeof ex, fn);
  return { user, conn, fixture, google, tools };
}

const lastToolOutput = (req: { messages: { role: string; results?: { output: unknown }[] }[] }) => req.messages.filter((m) => m.role === "tool").at(-1)!.results![0]!.output as Record<string, unknown>;
const pendingIdFrom = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!.buttons![0]!.id.split(":")[2]!;

describe("Google tools in the assistant", () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  });
  afterEach(() => {
    clearExecutorsForTests();
    vi.unstubAllEnvs();
  });

  it("reads a Drive file and drafts a Gmail with it attached; the approved draft is sent through Gmail as PDF attachment", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    h.ai.enqueue(
      { text: '{"intent":"email","complexity":"tool","needs_tools":true,"reply":null}' },
      { toolCalls: [{ id: "c1", name: "gdrive_list_files", input: { query: "כהן" } }], stopReason: "tool_use" },
      (req) => {
        expect(lastToolOutput(req)).toMatchObject({ count: 1, files: [{ id: "gdoc1", name: "סיכום פגישה — כהן" }] });
        return { toolCalls: [{ id: "c2", name: "gdrive_get_file_text", input: { id: "gdoc1" } }], stopReason: "tool_use" };
      },
      (req) => {
        expect(lastToolOutput(req).text).toContain("שלוש פעימות");
        return { toolCalls: [{ id: "c3", name: "gmail_draft_email", input: { to_name: "יוסי אברהם", to_email: "avraham@example.co.il", cc: "", subject: "סיכום הפגישה", body: "שלום יוסי,\nמצורף הסיכום.\nדנה", attachment_file_id: "gdoc1" } }], stopReason: "tool_use" };
      },
      { text: "הכנתי טיוטה." },
    );
    await processInbound(h.ctx, h.inbound("תשלח ליוסי אברהם את סיכום הפגישה עם כהן מהדרייב"));
    const tools = h.ai.calls[1]!.tools!.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["gcal_list_events", "gcal_free_slots", "gcal_create_event", "gcal_update_event", "gcal_delete_event", "gdrive_list_files", "gdrive_get_file_text", "gdrive_save_doc", "gmail_draft_email", "gmail_read_status", "draft_email"]));
    const draft = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    expect(draft.body).toContain("אל: יוסי אברהם (avraham@example.co.il)");
    expect(draft.body).toContain("מצורף: סיכום פגישה — כהן");
    const id = pendingIdFrom(h);
    expect((await h.db.getPendingAction(id))!.payload).toMatchObject({ provider: "google", attachment_file_id: "gdoc1" });

    await processInbound(h.ctx, h.button(`pa:approve:${id}`, "שלח"));
    expect(h.wa.texts.at(-1)).toBe("נשלח אל יוסי אברהם מתיבת ה-Gmail (dana.levi@gmail.com).");
    expect(fixture.state.sent).toHaveLength(1);
    const mime = decodeWords(fixture.state.sent[0]!.mime);
    expect(mime).toContain("To: יוסי אברהם <avraham@example.co.il>");
    expect(mime).toContain("Subject: סיכום הפגישה");
    expect(mime).toContain('filename="סיכום פגישה — כהן.pdf"');
    expect(fixture.state.calls.some((c) => c.url.endsWith("/files/gdoc1/export?mimeType=application%2Fpdf"))).toBe(true);
    expect((await h.db.getPendingAction(id))!.status).toBe("executed");
    expect(h.db.audit.some((a) => a.action === "send_mail.execute" && a.result === "ok")).toBe(true);
  });

  it("base create_event routes to Google for a Google-only user; moves keep the duration; cancel deletes", async () => {
    const h = makeHarness();
    const { conn, fixture } = await googleUser(h);
    const microsoft: Record<string, ActionExecutor> = { send_mail: async () => ({ ok: false, message: "ms" }), create_event: async () => ({ ok: false, message: "ms" }), update_event: async () => ({ ok: false, message: "ms" }), delete_event: async () => ({ ok: false, message: "ms" }) };
    const google = googleExecutors(async () => ({ google: new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl }), timeZone: TZ, connection: conn }));
    const routed = routeExecutorsByProvider({ microsoft: microsoft as never, google }, (a) => providerForAction(h.db, a));
    for (const [kind, fn] of Object.entries(routed)) registerExecutor(kind as keyof typeof routed, fn);

    h.ai.enqueue({ text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' }, { toolCalls: [{ id: "e1", name: "create_event", input: { title: "פגישה עם כהן", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: ["cohen@example.co.il"] } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבע פגישה עם כהן מחר ב-10"));
    await processInbound(h.ctx, h.button(`pa:approve:${pendingIdFrom(h)}`, "קבע"));
    expect(h.wa.texts.at(-1)).toBe("נקבע: פגישה עם כהן, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
    const created = fixture.state.events.at(-1)!;
    expect(created).toMatchObject({ summary: "פגישה עם כהן", start: { dateTime: "2026-10-22T10:00:00+03:00", timeZone: TZ } });

    // move to 23.10 at 15:30 — only date+start given → the one-hour duration is kept
    h.ai.enqueue({ text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' }, { toolCalls: [{ id: "u1", name: "gcal_update_event", input: { id: created.id, subject: "", date: "2026-10-23", start: "15:30", end: "", location: "" } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תזיז את הפגישה עם כהן ליום שישי ב-15:30"));
    await processInbound(h.ctx, h.button(`pa:approve:${pendingIdFrom(h)}`, "הזז"));
    expect(h.wa.texts.at(-1)).toBe("הוזז. פגישה עם כהן עכשיו ב-יום ו׳ 23.10, 15:30.\nעדכון נשלח ל-1 משתתפים.");
    expect(fixture.state.calls.filter((c) => c.method === "PATCH").at(-1)!.body).toEqual({ start: { dateTime: "2026-10-23T15:30:00", timeZone: TZ }, end: { dateTime: "2026-10-23T16:30:00", timeZone: TZ } });

    h.ai.enqueue({ text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' }, { toolCalls: [{ id: "d1", name: "gcal_delete_event", input: { id: created.id, subject: "פגישה עם כהן" } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תבטל את הפגישה עם כהן"));
    await processInbound(h.ctx, h.button(`pa:approve:${pendingIdFrom(h)}`, "בטל פגישה"));
    expect(h.wa.texts.at(-1)).toBe('הפגישה "פגישה עם כהן" בוטלה.');
    expect(fixture.state.events.find((e) => e.id === created.id)).toBeUndefined();
    expect(new URL(fixture.state.calls.at(-1)!.url).searchParams.get("sendUpdates")).toBe("all");
  });

  it("lists events, finds free slots and saves a Doc without approval", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const tools = googleTools({ google: async () => google, timeZone: TZ, scopes: [], accountEmail: "a@gmail.com" });
    const ctx: ToolContext = { db, userId: user.id, now: new Date("2026-10-21T06:00:00Z"), createPending: async () => { throw new Error("no pending expected"); } };
    const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run(input, ctx);

    const listed = (await run("gcal_list_events", { from_date: "2026-10-21", to_date: "2026-10-21", query: "" })) as { count: number; events: { title: string; start: string; attendees: string[] }[] };
    expect(listed.count).toBe(3);
    expect(listed.events[2]).toMatchObject({ title: "שיחה עם משפחת אברהם", start: "2026-10-21T13:00", attendees: ["avraham@example.co.il"] });
    const listUrl = new URL(fixture.state.calls[0]!.url);
    expect(listUrl.searchParams.get("timeMin")).toBe("2026-10-20T21:00:00.000Z");
    expect(listUrl.searchParams.get("timeMax")).toBe("2026-10-21T21:00:00.000Z");
    expect(await run("gcal_list_events", { from_date: "21.10", to_date: "21.10", query: "" })).toEqual({ error: "bad_date_format" });

    expect(await run("gcal_free_slots", { date: "2026-10-21", duration_minutes: 60, day_start: "", day_end: "" })).toEqual({ date: "2026-10-21", slots: [{ start: "10:00", end: "13:00" }, { start: "13:30", end: "18:00" }] });

    const saved = (await run("gdrive_save_doc", { title: "סיכום שיחה עם כהן", text: "הוסכם על שלוש פעימות." })) as { status: string; id: string };
    expect(saved.status).toBe("done");
    expect(fixture.state.files.find((f) => f.id === saved.id)).toMatchObject({ name: "סיכום שיחה עם כהן", mimeType: "application/vnd.google-apps.document" });
    expect(db.audit.at(-1)).toMatchObject({ action: "google.drive.create", target: saved.id });

    expect(await run("gmail_read_status", {})).toMatchObject({ available: false, say: expect.stringContaining("Gmail") });
    expect(await run("gdrive_get_file_text", { id: "gimg1" })).toEqual({ error: "unsupported_format", name: "לוגו.png" });
    fixture.state.denied.add("drive");
    expect(await run("gdrive_list_files", { query: "" })).toEqual({ error: "missing_permission" });
    const expired = googleTools({ google: async () => { throw new GoogleOAuthError("x", "invalid_grant"); }, timeZone: TZ, scopes: [], accountEmail: null });
    expect(await expired.find((t) => t.name === "gcal_list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21", query: "" }, ctx)).toEqual({ error: "connection_expired" });
  });

  it("exposes only the tools whose scopes were granted", () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    const names = (scopes: string[]) => googleTools({ google: async () => { throw new Error("unused"); }, timeZone: TZ, scopes, accountEmail: null }).map((t) => t.name);
    expect(names(["openid", "email", GOOGLE_SCOPES.calendarEvents])).toEqual(["gcal_list_events", "gcal_free_slots", "gcal_create_event", "gcal_update_event", "gcal_delete_event", "gmail_read_status"]);
    expect(names(["openid", GOOGLE_SCOPES.gmailSend])).toEqual(["gmail_draft_email", "gmail_read_status"]);
    // gmail.readonly granted → the Gmail read tools (Microsoft's search_emails / get_email with the gmail_ prefix) instead of the status tool
    expect(names(["openid", GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly])).toEqual(["gmail_draft_email", "gmail_search_emails", "gmail_get_email", "gmail_get_thread", "gmail_awaiting_reply"]);
    expect(names([])).toHaveLength(10);
  });

  it("GOOGLE_GMAIL_READ_ENABLED=false is a kill switch: a connection that already granted gmail.readonly gets no gmail_* read tool", async () => {
    const readScopes = ["openid", GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly];
    const build = () => googleTools({ google: async () => { throw new Error("no Gmail call while off"); }, timeZone: TZ, scopes: readScopes, accountEmail: "dana.levi@gmail.com" });
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "false");
    const off = build();
    expect(off.map((t) => t.name)).toEqual(["gmail_draft_email", "gmail_read_status"]);
    // the status tool answers "not available" — no consent link while off
    const db = new MemoryDb();
    const ctx: ToolContext = { db, userId: "u1", now: new Date(), createPending: async () => { throw new Error("no pending"); } };
    expect(await off.find((t) => t.name === "gmail_read_status")!.run({}, ctx)).toEqual({ available: false, say: "קריאה וסיכום של מיילים ב-Gmail אינם זמינים כרגע. שליחת מיילים מ-Gmail, היומן וקבצי Drive עובדים." });
    // a bad value fails closed (and does not break the turn)
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "maybe");
    expect(build().map((t) => t.name)).not.toContain("gmail_search_emails");
    // back on (or unset with a real GOOGLE_CLIENT_ID) → the earlier grant reads again, no new consent
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "");
    expect(build().map((t) => t.name)).toContain("gmail_search_emails");
  });
});

describe("Google executors — failures become Hebrew messages with the right link", () => {
  const h = makeHarness();
  let user: { id: string };
  let conn: ConnectionRow;
  const action = (kind: PendingActionRow["kind"], payload: Record<string, unknown>): PendingActionRow => ({ id: "a1", user_id: user.id, kind, payload, status: "approved", expires_at: "", approved_msg_id: null, executed_at: null, error: null, created_at: "" });
  beforeEach(async () => {
    user = await h.db.createUser(`u${Math.random()}@example.com`);
    conn = h.db.seedConnection(user.id, "google", "dana.levi@gmail.com");
  });

  it("maps missing scope, expired grant, outage, vanished event, bad address and no connection", async () => {
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const ex = googleExecutors(async () => ({ google, timeZone: TZ, connection: conn }));
    fixture.state.denied.add("gmail");
    const scope = await ex.send_mail(action("send_mail", { to_email: "a@b.co", subject: "s", body: "b" }), h.ctx);
    expect(scope).toMatchObject({ ok: false, message: expect.stringContaining("אין לי הרשאה לשלוח מיילים מ-Gmail") });
    expect(scope.message).toContain("https://app.example.co.il/api/auth/google/start?t=");

    const gone = await ex.delete_event(action("delete_event", { id: "never-existed", subject: "x" }), h.ctx);
    expect(gone.message).toContain("כבר לא נמצאת ביומן");
    expect((await ex.send_mail(action("send_mail", { to_email: "not-an-email", subject: "s", body: "b" }), h.ctx)).message).toContain("כתובת מייל תקינה");

    const expiredEx = googleExecutors(async () => ({ google: new GoogleClient({ getAccessToken: async () => { throw new GoogleOAuthError("x", "invalid_grant"); } }), timeZone: TZ, connection: conn }));
    const expired = await expiredEx.create_event(action("create_event", { title: "t", date: "2026-10-22", start: "10:00", end: "11:00", attendees: [] }), h.ctx);
    expect(expired.message).toContain("החיבור ל-Google פג תוקף");
    expect(expired.message).toContain("/api/auth/google/start?t=");

    const downEx = googleExecutors(async () => ({ google: new GoogleClient({ getAccessToken: async () => { throw new GoogleApiError("down", 503, null); } }), timeZone: TZ, connection: conn }));
    expect(await downEx.update_event(action("update_event", { id: "gev1" }), h.ctx)).toMatchObject({ ok: false, retryable: true, message: expect.stringContaining("אין תגובה כרגע מ-Google") });

    const none = googleExecutors(async () => null);
    expect((await none.send_mail(action("send_mail", {}), h.ctx)).message).toContain("לחבר את המייל");
  });

  it("a reconnect link after an approved action failed carries the 'unverified app' heads-up (real Google project only)", async () => {
    const expiredEx = googleExecutors(async () => ({ google: new GoogleClient({ getAccessToken: async () => { throw new GoogleOAuthError("x", "invalid_grant"); } }), timeZone: TZ, connection: conn }));
    const run = () => expiredEx.create_event(action("create_event", { title: "t", date: "2026-10-22", start: "10:00", end: "11:00", attendees: [] }), h.ctx);
    const HEADS_UP = "גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.";
    try {
      expect((await run()).message).not.toContain(HEADS_UP); // fixtures / no Google project
      vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
      const expired = await run();
      expect(expired.message).toContain("/api/auth/google/start?t=");
      expect(expired.message.split("\n").at(-1)).toBe(HEADS_UP);

      const fixture = createGoogleFixture();
      fixture.state.denied.add("gmail");
      const scopeEx = googleExecutors(async () => ({ google: new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl }), timeZone: TZ, connection: conn }));
      const missing = await scopeEx.send_mail(action("send_mail", { to_email: "a@b.co", subject: "s", body: "b" }), h.ctx);
      expect(missing.message).toContain("אין לי הרשאה לשלוח מיילים מ-Gmail");
      expect(missing.message.split("\n").at(-1)).toBe(HEADS_UP);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("routes by payload tag, then by the active connection", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("x@y.co");
    const a = (payload: Record<string, unknown>) => ({ user_id: u.id, payload });
    expect(await providerForAction(db, a({}))).toBe("microsoft");
    db.seedConnection(u.id, "google", "x@gmail.com");
    expect(await providerForAction(db, a({}))).toBe("google");
    const ms = db.seedConnection(u.id, "microsoft", "x@y.co");
    expect(await providerForAction(db, a({}))).toBe("microsoft");
    expect(await providerForAction(db, a({ provider: "google" }))).toBe("google");
    await db.setConnectionStatus(ms.id, "expired");
    expect(await providerForAction(db, a({}))).toBe("google");
  });
});
