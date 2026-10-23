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
import { entitlements } from "@/lib/billing/plans";

const decodeWords = (s: string) => s.replace(/\r\n /g, "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));
const TZ = "Asia/Jerusalem";

async function googleUser(h: ReturnType<typeof makeHarness>, scopes: string[] = normalizeScopes([...GOOGLE_BASE_SCOPES]), plan: "basic" | "pro" = "pro") {
  const user = await h.db.createUser("dana@example.com");
  // pro: every Google tool (lib/billing/plans.ts entitlements); basic is tested on its own below
  await h.db.upsertSubscription(user.id, { plan, status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
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

  it("a change reads the meeting its draft names; who it reaches is kept (and a cancellation looks it up) only for an agent limited to a list (without the user)", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const tools = googleTools({ google: async () => google, timeZone: TZ, scopes: [], accountEmail: "dana.levi@gmail.com" });
    const drafts: Record<string, unknown>[] = [];
    const ctx = (checksRecipients: boolean): ToolContext => ({ db, userId: user.id, now: new Date("2026-10-21T06:00:00Z"), checksRecipients, createPending: async (kind, payload) => (drafts.push({ kind, ...payload }), { id: `pa${drafts.length}` }) as PendingActionRow });
    const run = (name: string, input: Record<string, unknown>, checks: boolean) => tools.find((t) => t.name === name)!.run(input, ctx(checks));
    const move = { id: "gev2", subject: "", date: "2026-10-22", start: "13:00", end: "13:30", location: "" };

    await run("gcal_update_event", move, false);
    expect(drafts.at(-1)).not.toHaveProperty("current_attendees");
    // one read: the draft says which meeting changes and whether its attendees hear about it
    expect(fixture.state.calls.map((c) => c.method)).toEqual(["GET"]);
    expect(drafts.at(-1)).toMatchObject({ current_subject: "שיחה עם משפחת אברהם", current_date: "2026-10-21", current_start: "13:00", current_attendee_count: 1 });
    await run("gcal_delete_event", { id: "gev1", subject: "דיון" }, false);
    expect(drafts.at(-1)).not.toHaveProperty("current_attendees");
    expect(fixture.state.calls).toHaveLength(1); // a cancellation by the main assistant: no extra call
    await run("gcal_update_event", move, true);
    expect(drafts.at(-1)).toMatchObject({ kind: "update_event", provider: "google", id: "gev2", current_attendees: ["avraham@example.co.il"] });
    await run("gcal_delete_event", { id: "gev1", subject: "דיון" }, true);
    expect(drafts.at(-1)).toMatchObject({ kind: "delete_event", current_attendees: [] });
    const n = drafts.length;
    expect(await run("gcal_delete_event", { id: "never-existed", subject: "x" }, true)).toEqual({ error: "not_found" });
    expect(drafts).toHaveLength(n); // no draft when the event cannot be read
  });

  it("exposes only the tools whose scopes were granted", () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    const names = (scopes: string[]) => googleTools({ google: async () => { throw new Error("unused"); }, timeZone: TZ, scopes, accountEmail: null }).map((t) => t.name);
    // always there: the Google Tasks tools (they answer with the consent link while `tasks` is missing) and, without
    // drive.readonly, gdrive_read_status — so "my tasks" / "the Docs in my Drive" always gets an answer
    const always = ["gtasks_list_tasks", "gtasks_create_task", "gdrive_read_status"];
    expect(names(["openid", "email", GOOGLE_SCOPES.calendarEvents])).toEqual(["gcal_list_events", "gcal_free_slots", "gcal_create_event", "gcal_update_event", "gcal_delete_event", "gmail_read_status", ...always]);
    expect(names(["openid", GOOGLE_SCOPES.gmailSend])).toEqual(["gmail_draft_email", "gmail_read_status", ...always]);
    // gmail.readonly granted → the Gmail read tools (Microsoft's search_emails / get_email with the gmail_ prefix) instead of the status tool
    expect(names(["openid", GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly])).toEqual(["gmail_draft_email", "gmail_search_emails", "gmail_get_email", "gmail_get_thread", "gmail_awaiting_reply", ...always]);
    expect(names([])).toHaveLength(13);
  });

  it("GOOGLE_GMAIL_READ_ENABLED=false is a kill switch: a connection that already granted gmail.readonly gets no gmail_* read tool", async () => {
    const readScopes = ["openid", GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly];
    const build = () => googleTools({ google: async () => { throw new Error("no Gmail call while off"); }, timeZone: TZ, scopes: readScopes, accountEmail: "dana.levi@gmail.com" });
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "false");
    const off = build();
    expect(off.map((t) => t.name).filter((n) => n.startsWith("gmail_"))).toEqual(["gmail_draft_email", "gmail_read_status"]);
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

describe("Google tools on basic (lib/billing/plans.ts entitlements)", () => {
  afterEach(() => {
    clearExecutorsForTests();
    vi.unstubAllEnvs();
  });

  it("the pro tools never reach the model, even from a list built for pro; pro_feature answers a task request with the plan line", async () => {
    const h = makeHarness();
    await googleUser(h, normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.driveReadonly]), "basic");
    await processInbound(h.ctx, h.inbound("תוסיפי משימה: להתקשר לבנק"));
    const tools = h.ai.calls[1]!.tools!.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["gcal_list_events", "gcal_create_event", "gdrive_list_files", "gdrive_get_file_text", "gmail_draft_email", "pro_feature"]));
    for (const t of ["gdrive_save_doc", "gtasks_list_tasks", "gtasks_create_task", "gdrive_read_status"]) expect(tools, t).not.toContain(t);
    expect(h.wa.texts.at(-1)).toBe('במסלול פרו (299 ₪ לחודש) יש גם משימות ב-Google Tasks וב-Microsoft To Do. במסלול הבסיסי זה לא כלול. אפשר לכתוב "שדרוג" ואשלח את הפרטים.');
  });

  it("built for basic: Drive is searched as drive.file even with drive.readonly granted, no save, no Tasks, no drive.readonly consent", () => {
    vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "true");
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fixture.fetchImpl });
    const scopes = normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.driveReadonly]);
    const build = (plan: "basic" | "pro") => googleTools({ google: async () => google, timeZone: TZ, scopes, accountEmail: null, entitlements: entitlements(plan) });
    const basic = build("basic").map((t) => t.name);
    for (const t of ["gdrive_save_doc", "gtasks_list_tasks", "gtasks_create_task", "gdrive_read_status"]) expect(basic, t).not.toContain(t);
    expect(build("pro").map((t) => t.name)).toEqual(expect.arrayContaining(["gdrive_save_doc", "gtasks_list_tasks", "gtasks_create_task"]));
    expect(build("basic").find((t) => t.name === "gdrive_list_files")!.description).toContain("drive.file");
    expect(build("pro").find((t) => t.name === "gdrive_list_files")!.description).toContain("בכל ה-Google Drive");
  });
});

describe("Google Tasks and Drive read (23.10.2026)", () => {
  const ctxFor = (db: MemoryDb, userId: string): ToolContext => ({ db, userId, now: new Date("2026-10-21T06:00:00Z"), createPending: async () => { throw new Error("no approval for tasks or reads"); } });
  afterEach(() => vi.unstubAllEnvs());

  it("lists open tasks from every list and adds one to the default list right away, echoing it", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const tools = googleTools({ google: async () => google, timeZone: TZ, scopes: [], accountEmail: "dana.levi@gmail.com" });
    const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run(input, ctxFor(db, user.id));

    const listed = (await run("gtasks_list_tasks", { include_completed: false })) as { count: number; tasks: { title: string; due: string | null; list: string; notes?: string }[]; note: string };
    expect(listed.count).toBe(3);
    expect(listed.tasks[0]).toEqual({ id: "gt-1", title: "להחזיר לעו״ד כהן את ההסכם", due: "2026-10-23", list: "My Tasks", notes: "עם ההערות מהפגישה" });
    expect(listed.tasks.map((t) => t.list)).toEqual(["My Tasks", "My Tasks", "לקוחות"]);
    expect(listed.note).toContain("מידע בלבד");
    const listCall = new URL(fixture.state.calls.find((c) => c.url.includes("/lists/MDE4fixtureDefault/tasks"))!.url);
    expect(listCall.searchParams.get("showCompleted")).toBe("false");

    const created = (await run("gtasks_create_task", { title: "  לשלם   ביטוח לאומי ", notes: "", due_date: "2026-10-24" })) as { status: string; reply: string };
    expect(created).toMatchObject({ status: "done", reply: "נוספה משימה ל-Google Tasks: לשלם ביטוח לאומי, עד 24.10." });
    const post = fixture.state.calls.at(-1)!;
    expect(post).toMatchObject({ method: "POST", url: "https://tasks.googleapis.com/tasks/v1/lists/%40default/tasks", body: { title: "לשלם ביטוח לאומי", due: "2026-10-24T00:00:00.000Z" } });
    expect(fixture.state.taskLists[0]!.tasks[0]!.title).toBe("לשלם ביטוח לאומי");
    expect(db.audit.at(-1)).toMatchObject({ action: "google.tasks.create", result: "ok" });
    expect(await run("gtasks_create_task", { title: " ", notes: "", due_date: "" })).toEqual({ status: "error", error: "empty_title" });
  });

  it("without the tasks scope: the consent link (feature=tasks) and no API call; a token without it answers the same", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const link = "https://app.example.co.il/api/auth/google/start?t=x&feature=tasks";
    const old = googleTools({ google: async () => google, timeZone: TZ, scopes: ["openid", GOOGLE_SCOPES.calendarEvents], accountEmail: "a@gmail.com", consentLink: (f) => (f === "tasks" ? link : "wrong") });
    const out = (await old.find((t) => t.name === "gtasks_create_task")!.run({ title: "x", notes: "", due_date: "" }, ctxFor(db, user.id))) as { status: string; say: string };
    expect(out.status).toBe("consent_needed");
    expect(out.say).toContain("Google Tasks");
    expect(out.say).toContain(link);
    expect(fixture.state.calls).toHaveLength(0);
    // the box was unticked in a later consent: Google answers 403 insufficient scope → the same consent answer
    fixture.state.denied.add("tasks");
    const granted = googleTools({ google: async () => google, timeZone: TZ, scopes: [], accountEmail: "a@gmail.com" });
    expect(await granted.find((t) => t.name === "gtasks_list_tasks")!.run({ include_completed: false }, ctxFor(db, user.id))).toMatchObject({ status: "consent_needed", say: expect.stringContaining('לחבר את גוגל') });
  });

  it("drive.readonly granted and on: the whole Drive by name or content; Docs → text, Sheets → CSV, Slides → text; no status tool", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const fixture = createGoogleFixture();
    fixture.state.files.push({ kind: "drive#file", id: "gslides1", name: "מצגת משקיעים", mimeType: "application/vnd.google-apps.presentation", modifiedTime: "2026-10-05T08:00:00.000Z", webViewLink: "https://docs.google.com/presentation/d/gslides1/edit", content: new Uint8Array(Buffer.from("שקף 1: הצמיחה ברבעון", "utf8")) });
    const google = new GoogleClient({ getAccessToken: async () => "t", fetchImpl: fixture.fetchImpl });
    const scopes = normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.driveReadonly]);
    const tools = googleTools({ google: async () => google, timeZone: TZ, scopes, accountEmail: "a@gmail.com", driveReadEnabled: true });
    expect(tools.map((t) => t.name)).not.toContain("gdrive_read_status");
    const list = tools.find((t) => t.name === "gdrive_list_files")!;
    expect(list.description).toContain("בכל ה-Google Drive");
    const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run(input, ctxFor(db, user.id));

    // "פעימות" is only in the Doc's text, not in any file name
    const found = (await run("gdrive_list_files", { query: "פעימות" })) as { files: { id: string }[] };
    expect(found.files.map((f) => f.id)).toEqual(["gdoc1"]);
    expect(new URL(fixture.state.calls.at(-1)!.url).searchParams.get("q")).toContain("fullText contains 'פעימות'");
    expect(await run("gdrive_get_file_text", { id: "gdoc1" })).toMatchObject({ text: "סיכום: הוסכם על תשלום בשלוש פעימות." });
    expect(await run("gdrive_get_file_text", { id: "gsheet1" })).toMatchObject({ text: "חודש,סכום\nינואר,4200" });
    expect(await run("gdrive_get_file_text", { id: "gslides1" })).toMatchObject({ text: "שקף 1: הצמיחה ברבעון" });
    const exports = fixture.state.calls.filter((c) => c.url.includes("/export")).map((c) => new URL(c.url).searchParams.get("mimeType"));
    expect(exports).toEqual(["text/plain", "text/csv", "text/plain"]);

    // the switch off (or a bad value) → back to drive.file only, with the status tool
    const off = googleTools({ google: async () => google, timeZone: TZ, scopes, accountEmail: "a@gmail.com", driveReadEnabled: false });
    expect(off.find((t) => t.name === "gdrive_list_files")!.description).toContain("drive.file");
    expect(off.map((t) => t.name)).toContain("gdrive_read_status");
  });

  it("gdrive_read_status: the consent link (feature=drive_read) under the cap, one line when off", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const build = () => googleTools({ google: async () => { throw new Error("no API call"); }, timeZone: TZ, scopes: [], accountEmail: "a@gmail.com", consentLink: (f) => `https://app.example.co.il/api/auth/google/start?t=x&feature=${f}` });
    const status = () => build().find((t) => t.name === "gdrive_read_status")!.run({}, ctxFor(db, user.id));
    expect(await status()).toEqual({ available: false, say: "קריאה של כל הקבצים ב-Drive אינה זמינה כרגע. קבצים שנוצרו דרכי, היומן ו-Gmail ממשיכים לעבוד." });
    vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "true");
    const on = (await status()) as { consent_needed: boolean; say: string };
    expect(on.consent_needed).toBe(true);
    expect(on.say).toContain("כולל Docs, Sheets ו-Slides");
    expect(on.say).toContain("feature=drive_read");
    const empty = (await googleTools({ google: async () => new GoogleClient({ getAccessToken: async () => "t", fetchImpl: createGoogleFixture().fetchImpl }), timeZone: TZ, scopes: [], accountEmail: "a@gmail.com" }).find((t) => t.name === "gdrive_list_files")!.run({ query: "לא קיים" }, ctxFor(db, user.id))) as { note: string };
    expect(empty.note).toContain("gdrive_read_status");
  });
});

describe("Google executors — failures become Hebrew messages with the right link", () => {
  const h = makeHarness();
  let user: { id: string };
  let conn: ConnectionRow;
  const action = (kind: PendingActionRow["kind"], payload: Record<string, unknown>): PendingActionRow => ({ id: "a1", user_id: user.id, kind, payload, status: "approved", expires_at: "", approved_msg_id: null, executed_at: null, error: null, agent_key: null, agent_name: null, created_at: "" });
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
