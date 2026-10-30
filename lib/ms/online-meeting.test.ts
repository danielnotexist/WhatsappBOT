import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateAgentFor } from "@/lib/agents/service";
import { PRODUCT_NAME } from "@/lib/brand";
import type { ToolContext } from "@/lib/ai/tools";
import { clearExecutorsForTests, registerExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { copy } from "@/lib/copy/bot";
import { acopy } from "@/lib/copy/bot-agents";
import type { PendingActionRow } from "@/lib/db/types";
import { MSA_CONSUMER_TENANT } from "@/lib/online-meeting";
import { FIXTURE_TEAMS_JOIN_URL, createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient, GraphError } from "./graph";
import { graphExecutors, graphTools, teamsAvailability } from "./tools";

const TZ = "Asia/Jerusalem";
const ROUTER = { text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' };
const MEETING = { title: "פגישה עם ברק", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: ["barak@cpa-barak.co.il"] };
// who gets the invitation first (lib/copy/bot.ts act.cal.create_confirm)
const DRAFT = "*פגישה חדשה*\nמשתתפים: barak@cpa-barak.co.il\nפגישה עם ברק\nיום ה׳ 22.10, 10:00–11:00";
const TEAMS_DRAFT = `${DRAFT}\nפגישת Teams (הקישור יישלח בהזמנה)\n\nלקבוע?`;
const WORK = "בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams.";
const PERSONAL = "בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams (יצירת פגישת Teams מהיומן זמינה רק בחשבון עבודה או בית ספר).";
const HEARING = "פגישה: דיון בבית משפט השלום ת״א, יום ד׳ 21.10 ב-09:00";
const ZOOM = "https://us02web.zoom.us/j/8123456789?pwd=Rml4dHVyZQ";

type FetchWrap = (f: typeof fetch) => typeof fetch;

/**
 * A Microsoft 365 user wired like production (lib/bot/handle-inbound.ts): Graph tools for the model, the Teams check
 * before a draft names Teams (`check: false` leaves it out, as when the account changes between the draft and the
 * press), Graph executors (with the connection) behind the buttons.
 */
async function msUser(h: ReturnType<typeof makeHarness>, opts: { providers?: string[]; email?: string; tenant?: string; fetchImpl?: FetchWrap; check?: boolean } = {}) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  const connection = h.db.seedConnection(user.id, "microsoft", opts.email ?? "dana@levi-law.co.il");
  connection.tenant_id = opts.tenant ?? "3f1a-levi-law-tenant";
  const fixture = createGraphFixture();
  if (opts.providers) fixture.state.onlineMeetingProviders = opts.providers;
  const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: opts.fetchImpl ? opts.fetchImpl(fixture.fetchImpl) : fixture.fetchImpl });
  const tools = graphTools({ graph: async () => graph, timeZone: TZ, connection });
  h.ctx.extraTools = async () => tools;
  if (opts.check !== false) h.ctx.onlineMeetingCheck = () => async (provider) => (provider === "microsoft" ? teamsAvailability(graph, connection).catch(() => null) : null);
  const ex = graphExecutors(async () => ({ graph, timeZone: TZ, connection }));
  registerExecutor("create_event", ex.create_event);
  registerExecutor("update_event", ex.update_event);
  return { user, fixture, graph, tools, connection };
}

const lastDraft = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
const draftCount = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").length;
const idOf = (draft: { buttons?: { id: string }[] }) => draft.buttons![0]!.id.split(":")[2]!;
const path = (c: { url: string }) => new URL(c.url).pathname;
const eventPosts = <T extends { method: string; url: string }>(calls: T[]) => calls.filter((c) => c.method === "POST" && path(c).endsWith("/me/events"));
const patches = <T extends { method: string; url: string }>(calls: T[]) => calls.filter((c) => c.method === "PATCH");
/** Answers the calendar's provider list itself (the fixture's events still follow `state.onlineMeetingProviders`). */
const calendarSays = (answer: () => Response): FetchWrap => (f) => (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).pathname.endsWith("/me/calendar") ? answer() : f(input, init))) as typeof fetch;
/** The calendar lists Teams while Graph still leaves the meeting out of the event (a policy that turns off the Outlook add-in). */
const listsTeams = calendarSays(() => Response.json({ allowedOnlineMeetingProviders: ["teamsForBusiness"] }));
const unavailable503 = () => Response.json({ error: { code: "ServiceUnavailable", message: "down" } }, { status: 503 });
/** The model's view of the last tool call (what the tool returned). */
function lastToolOutput(h: ReturnType<typeof makeHarness>): Record<string, unknown> {
  for (const call of [...h.ai.calls].reverse()) for (const m of [...call.messages].reverse()) if (m.role === "tool") return m.results.at(-1)!.output as Record<string, unknown>;
  throw new Error("no tool result");
}
const createCall = (over: Record<string, unknown> = {}) => ({ toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true, ...over } }], stopReason: "tool_use" as const });
const updateCall = (id: string, over: Record<string, unknown> = {}) => ({ toolCalls: [{ id: "u1", name: "update_event", input: { id, subject: "", date: "", start: "", end: "", location: "", online_meeting: true, ...over } }], stopReason: "tool_use" as const });

describe("Teams meetings on Microsoft 365", () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  });
  afterEach(() => clearExecutorsForTests());

  it("GraphClient: online meeting fields and transactionId in the body, the join link from onlineMeeting.joinUrl or the text, the provider check", async () => {
    const fixture = createGraphFixture();
    const client = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const created = await client.createEvent({ subject: "פגישה", start: "2026-10-22T10:00:00", end: "2026-10-22T11:00:00", timeZone: TZ, onlineMeeting: true, transactionId: "tx-1" });
    expect(fixture.state.calls.at(-1)!.body).toMatchObject({ subject: "פגישה", isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", transactionId: "tx-1" });
    expect(created).toMatchObject({ isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", isOrganizer: true, joinUrl: expect.stringMatching(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//) });

    await client.createEvent({ subject: "פרונטלית", start: "2026-10-22T12:00:00", end: "2026-10-22T13:00:00", timeZone: TZ });
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("isOnlineMeeting");
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("onlineMeetingProvider");
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("transactionId");

    const day = await client.calendarView(new Date("2026-10-20T21:00:00Z"), new Date("2026-10-21T21:00:00Z"), TZ);
    const select = new URL(fixture.state.calls.at(-1)!.url).searchParams.get("$select")!.split(",");
    expect(select).toEqual(expect.arrayContaining(["isOnlineMeeting", "onlineMeetingProvider", "onlineMeeting", "isOrganizer"]));
    expect(day.map((e) => e.joinUrl)).toEqual([null, FIXTURE_TEAMS_JOIN_URL, expect.any(String), null]);

    // a link off the known meeting services never reaches the model or a message
    fixture.state.events[0]!.onlineMeeting = { joinUrl: "https://evil.example/teams" };
    expect((await client.getEvent(fixture.state.events[0]!.id, TZ)).joinUrl).toBeNull();
    // the Zoom add-in writes its link to the location (isOnlineMeeting stays false): found, kept apart from Teams
    fixture.state.events[0]!.location = { displayName: ZOOM };
    expect(await client.getEvent(fixture.state.events[0]!.id, TZ)).toMatchObject({ isOnlineMeeting: false, joinUrl: null, textJoinUrl: ZOOM });

    expect(await client.onlineMeetingProviders()).toEqual(["teamsForBusiness", "skypeForBusiness"]);
    // a personal account: no Teams in the list, and Graph does not refuse the request; it drops the meeting (201)
    fixture.state.onlineMeetingProviders = ["skypeForConsumer"];
    expect(await client.onlineMeetingProviders()).toEqual(["skypeForConsumer"]);
    const personal = await client.createEvent({ subject: "אישי", start: "2026-10-22T14:00:00", end: "2026-10-22T15:00:00", timeZone: TZ, onlineMeeting: true });
    expect(personal).toMatchObject({ isOnlineMeeting: false, joinUrl: null });
    // an answer without the list counts as none allowed; Graph not answering for now is unknown (null)
    const bare = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: calendarSays(() => Response.json({ id: "AQMkCAL" }))(fixture.fetchImpl) });
    expect(await bare.onlineMeetingProviders()).toEqual([]);
    const busy = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: calendarSays(unavailable503)(fixture.fetchImpl) });
    expect(await busy.onlineMeetingProviders()).toBeNull();
    const offline = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch });
    expect(await offline.onlineMeetingProviders()).toBeNull();
    // anything else will not pass by waiting (403 ErrorAccessDenied, 404 MailboxNotEnabledForRESTAPI): it throws
    for (const [status, code] of [[403, "ErrorAccessDenied"], [404, "MailboxNotEnabledForRESTAPI"], [400, "BadRequest"]] as const) {
      const denied = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: calendarSays(() => Response.json({ error: { code, message: "x" } }, { status }))(fixture.fetchImpl) });
      const err = await denied.onlineMeetingProviders().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GraphError);
      expect(err).toMatchObject({ status, code });
    }
  });

  it("create_event with online_meeting: the draft says פגישת Teams, the model hears the service, the approved event is a Teams meeting and the reply carries its link", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h);
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));

    const draft = lastDraft(h);
    expect(draft.body).toBe(TEAMS_DRAFT);
    expect(draft.buttons!.map((b) => b.title)).toEqual(["קבע", "ערוך", "בטל"]);
    // the calendar is pinned in the draft, so the service it names is the one created; the model is told which one
    expect((await h.db.getPendingAction(idOf(draft)))!.payload).toMatchObject({ online_meeting: true, provider: "microsoft" });
    expect(lastToolOutput(h)).toMatchObject({ status: "pending_approval", online_service: "Teams", note: expect.stringContaining("שתיווצר פגישת Teams") });
    expect(eventPosts(fixture.state.calls)).toHaveLength(0); // nothing before the press

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    const [post] = eventPosts(fixture.state.calls);
    // transactionId: the approved action's id, so Graph drops a repeated POST of it
    expect(post!.body).toMatchObject({ subject: "פגישה עם ברק", isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", attendees: [{ emailAddress: { address: "barak@cpa-barak.co.il" } }], transactionId: idOf(draft) });
    const joinUrl = fixture.state.events.at(-1)!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${joinUrl}\nההזמנות יצאו למשתתפים.`);
    // the provider check ran before the event was created
    const calendarCheck = fixture.state.calls.findLastIndex((c) => path(c).endsWith("/me/calendar"));
    expect(calendarCheck).toBeGreaterThanOrEqual(0);
    expect(calendarCheck).toBeLessThan(fixture.state.calls.indexOf(post!));
  });

  it("a personal Microsoft account is known before the draft: the draft is the meeting without a link, saying why", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], email: "dana.levi@outlook.com", tenant: MSA_CONSUMER_TENANT });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const draft = lastDraft(h);
    expect(draft.body).toBe(`${PERSONAL}\n\n${DRAFT}\n\nלקבוע בלי קישור?`);
    expect(draft.buttons!.map((b) => b.title)).toEqual(["קבע בלי קישור", "ערוך", "בטל"]);
    const row = (await h.db.getPendingAction(idOf(draft)))!;
    expect(row.payload).toMatchObject({ provider: "microsoft", online_fallback: "microsoft", online_personal: true });
    expect(row.payload).not.toHaveProperty("online_meeting");
    expect(lastToolOutput(h)).toMatchObject({ online_meeting: "unavailable", note: expect.stringContaining(PERSONAL) });

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע בלי קישור"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).not.toHaveProperty("isOnlineMeeting");
    expect(h.wa.texts.at(-1)).toBe("נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
  });

  it("no Teams found only after the press: nothing is created; the same meeting without a link is a new draft, created only after its approval", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], email: "dana.levi@outlook.com", tenant: MSA_CONSUMER_TENANT, check: false });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const first = lastDraft(h);
    expect(first.body).toBe(TEAMS_DRAFT);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(first)}`, "קבע"));

    expect(eventPosts(fixture.state.calls)).toHaveLength(0);
    expect((await h.db.getPendingAction(idOf(first)))!.status).toBe("failed");
    const offer = lastDraft(h);
    expect(offer).not.toBe(first);
    expect(offer.body).toBe(`${PERSONAL}\n\n${DRAFT}\n\nלקבוע בלי קישור?`);
    expect(offer.buttons!.map((b) => b.title)).toEqual(["קבע בלי קישור", "ערוך", "בטל"]);
    const next = (await h.db.getPendingAction(idOf(offer)))!;
    expect(next).toMatchObject({ kind: "create_event", status: "pending", payload: { title: "פגישה עם ברק", provider: "microsoft", online_fallback: "microsoft", online_personal: true } });
    expect(next.payload).not.toHaveProperty("online_meeting");

    await processInbound(h.ctx, h.button(`pa:approve:${next.id}`, "קבע בלי קישור"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).not.toHaveProperty("isOnlineMeeting");
    expect(h.wa.texts.at(-1)).toBe("נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
  });

  it("a work account without Teams says so without guessing why; Graph refusing the meeting gets the same offer; without room for a new draft, a plain message", async () => {
    const h = makeHarness();
    await msUser(h, { providers: ["skypeForBusiness"], check: false });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    expect(lastDraft(h).body).toBe(`${WORK}\n\n${DRAFT}\n\nלקבוע בלי קישור?`);

    // the calendar lists Teams, yet Graph answers 400 about the online meeting: nothing is created, the same offer
    const h2 = makeHarness();
    const refuse: FetchWrap = (f) => (async (input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { isOnlineMeeting?: boolean }) : {};
      if (init?.method === "POST" && new URL(String(input)).pathname.endsWith("/me/events") && body.isOnlineMeeting) return Response.json({ error: { code: "ErrorInvalidArgument", message: "Online meeting provider teamsForBusiness is not allowed for this mailbox." } }, { status: 400 });
      return f(input, init);
    }) as typeof fetch;
    const { fixture } = await msUser(h2, { fetchImpl: refuse });
    const events = fixture.state.events.length;
    h2.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h2.ctx, h2.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "קבע"));
    expect(fixture.state.events).toHaveLength(events);
    expect(lastDraft(h2).body).toBe(`${WORK}\n\n${DRAFT}\n\nלקבוע בלי קישור?`);

    // the offer cannot be stored → the explanation alone, nothing created
    h2.ai.enqueue(ROUTER, { toolCalls: [{ id: "e2", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h2.ctx, h2.inbound("ושוב, פגישת טימס עם ברק"));
    const spy = vi.spyOn(h2.db, "createPendingAction").mockRejectedValueOnce(new Error("db down"));
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "קבע"));
    spy.mockRestore();
    expect(h2.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא נקבעה. אפשר לבקש לקבוע אותה בלי קישור.`);
    expect(fixture.state.events).toHaveLength(events);
  });

  it("the Teams check does not answer: nothing is created blind, nobody promises a retry; the same draft comes back and a later press creates the meeting", async () => {
    const h = makeHarness();
    let calendarDown = true;
    const flaky: FetchWrap = (f) => (async (input: string | URL | Request, init?: RequestInit) => (calendarDown && new URL(String(input)).pathname.endsWith("/me/calendar") ? unavailable503() : f(input, init))) as typeof fetch;
    const { fixture } = await msUser(h, { fetchImpl: flaky });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const draft = lastDraft(h);
    expect(draft.body).toBe(TEAMS_DRAFT); // unknown before the draft: made as asked, the executor checks again

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    expect(eventPosts(fixture.state.calls)).toHaveLength(0);
    expect((await h.db.getPendingAction(idOf(draft)))!.status).toBe("failed");
    expect(h.wa.texts).not.toContain(copy["err.provider_down"]("Microsoft 365"));
    const again = lastDraft(h);
    expect(again).not.toBe(draft);
    expect(again.body).toBe(`לא הצלחתי לבדוק אם אפשר ליצור פגישת Teams בחשבון הזה, ולכן הפגישה לא נקבעה. אפשר לנסות שוב בעוד כמה דקות.\n\n${TEAMS_DRAFT}`);
    expect(again.buttons!.map((b) => b.title)).toEqual(["קבע", "ערוך", "בטל"]);
    expect((await h.db.getPendingAction(idOf(again)))!).toMatchObject({ status: "pending", payload: { online_meeting: true, provider: "microsoft", online_retry: true } });

    // a few minutes later Graph answers: the second press creates the Teams meeting
    calendarDown = false;
    h.advance(3 * 60_000);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(again)}`, "קבע"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).toMatchObject({ isOnlineMeeting: true, transactionId: idOf(again) });
    expect(h.wa.texts.at(-1)).toBe(`נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${fixture.state.events.at(-1)!.onlineMeeting!.joinUrl}\nההזמנות יצאו למשתתפים.`);
  });

  it("a check that fails for good (403) is reported as it is: nothing created, no second draft, no promise", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { fetchImpl: calendarSays(() => Response.json({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }, { status: 403 })) });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const draft = lastDraft(h);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    expect(eventPosts(fixture.state.calls)).toHaveLength(0);
    expect(lastDraft(h)).toBe(draft);
    expect(h.wa.texts.at(-1)).toBe(copy["err.generic"]());
  });

  it("Graph drops the meeting although the check passed: the new meeting is confirmed and the reply says Teams is unavailable, with no retry", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], fetchImpl: listsTeams });
    h.ai.enqueue(ROUTER, createCall(), { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    expect(eventPosts(fixture.state.calls)).toHaveLength(1);
    expect(h.wa.texts.at(-1)).toBe(`נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\n${WORK}\nההזמנות יצאו בלי קישור.`);
  });

  it("list_events hands the model the join link; update_event names the meeting in the draft and adds Teams after approval", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await msUser(h);
    const ctx = { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("read only"); } };
    const listed = (await tools.find((t) => t.name === "list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events[0]).not.toHaveProperty("join_url");
    expect(listed.events[1]).toMatchObject({ subject: "פגישה עם רו״ח ברק", organizer_is_me: true, join_url: FIXTURE_TEAMS_JOIN_URL });

    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    const draft = lastDraft(h);
    expect(draft.body).toBe(`*שינוי פגישה*\n${HEARING}\nהוספת פגישת Teams\nלעדכן?`);
    expect(draft.buttons!.map((b) => b.title)).toEqual(["עדכן", "ערוך", "בטל"]);
    expect(lastToolOutput(h)).toMatchObject({ status: "pending_approval", online_service: "Teams" });
    expect(patches(fixture.state.calls)).toHaveLength(0);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "עדכן"));
    expect(patches(fixture.state.calls).at(-1)!.body).toEqual({ isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" });
    const joinUrl = fixture.state.events.find((e) => e.id === "AAMkAGe1")!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נוסף קישור Teams לפגישה ״דיון בבית משפט השלום ת״א״.\nקישור לפגישה: ${joinUrl}`);
  });

  it("update_event: Graph leaves the link out although the calendar lists Teams: no 'added' line, the reply says what happened, nothing invites a retry", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], fetchImpl: listsTeams });
    const hearing = fixture.state.events.find((e) => e.id === "AAMkAGe1")!;
    hearing.attendees = [{ emailAddress: { name: "מאי כהן", address: "mai@client.co.il" }, status: { response: "accepted" } }];

    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    expect(lastDraft(h).body).toBe(`*שינוי פגישה*\n${HEARING}\nהמשתתפים יקבלו עדכון עם הקישור.\nהוספת פגישת Teams\nלעדכן?`);
    const pressed = idOf(lastDraft(h));
    await processInbound(h.ctx, h.button(`pa:approve:${pressed}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(1);
    expect(hearing).toMatchObject({ isOnlineMeeting: false, onlineMeetingProvider: "unknown", onlineMeeting: null });
    expect(h.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה ״דיון בבית משפט השלום ת״א״ נשארה בלי קישור, והמשתתפים קיבלו עדכון בלי קישור.`);
    expect(h.wa.texts.at(-1)).not.toMatch(/נוסף קישור|אפשר לבקש/);
    expect((await h.db.getPendingAction(pressed))!.status).toBe("failed");

    // with another change: the change is confirmed, the link line says Teams is unavailable
    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1", { location: "חדר ישיבות" }), { text: "" });
    await processInbound(h.ctx, h.inbound("תעבירי את הדיון לחדר ישיבות ותוסיפי טימס"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(h.wa.texts.at(-1)).toBe(`עודכן: דיון בבית משפט השלום ת״א.\n${WORK}\nעדכון נשלח ל-1 משתתפים.`);
  });

  it("update_event: the Teams check does not answer at the press (the draft comes back), and Graph answering 400 on the PATCH changes nothing", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { fetchImpl: calendarSays(unavailable503) });
    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    const draft = lastDraft(h);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(0);
    expect(lastDraft(h).body).toBe(`לא הצלחתי לבדוק אם אפשר ליצור פגישת Teams בחשבון הזה, ולכן הפגישה לא עודכנה. אפשר לנסות שוב בעוד כמה דקות.\n\n*שינוי פגישה*\n${HEARING}\nהוספת פגישת Teams\nלעדכן?`);
    expect(lastDraft(h).buttons!.map((b) => b.title)).toEqual(["עדכן", "ערוך", "בטל"]);

    const h2 = makeHarness();
    const refusePatch: FetchWrap = (f) => (async (input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { isOnlineMeeting?: boolean }) : {};
      if (init?.method === "PATCH" && body.isOnlineMeeting) return Response.json({ error: { code: "ErrorInvalidArgument", message: "Online meeting provider teamsForBusiness is not allowed for this mailbox." } }, { status: 400 });
      return f(input, init);
    }) as typeof fetch;
    const { fixture: f2 } = await msUser(h2, { fetchImpl: refusePatch });
    // the link alone: nothing left to offer
    h2.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h2.ctx, h2.inbound("תוסיפי קישור טימס לדיון"));
    const drafts = draftCount(h2);
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "עדכן"));
    expect(draftCount(h2)).toBe(drafts);
    expect(h2.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא עודכנה.`);
    // with a new place: the same change without the link is offered, and runs only after its own approval
    h2.ai.enqueue(ROUTER, updateCall("AAMkAGe1", { location: "חדר ישיבות" }), { text: "" });
    await processInbound(h2.ctx, h2.inbound("תעבירי את הדיון לחדר ישיבות ותוסיפי טימס"));
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "עדכן"));
    expect(f2.state.events.find((e) => e.id === "AAMkAGe1")!.location.displayName).toBe("בית משפט השלום, ויצמן 1");
    expect(lastDraft(h2).body).toBe(`${WORK}\n\n*שינוי פגישה*\n${HEARING}\nמקום: חדר ישיבות\nלעדכן בלי קישור?`);
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "עדכן בלי קישור"));
    expect(patches(f2.state.calls).at(-1)!.body).toEqual({ location: { displayName: "חדר ישיבות" } });
    expect(h2.wa.texts.at(-1)).toBe("עודכן: דיון בבית משפט השלום ת״א.");
  });

  it("update_event never asks Teams for a meeting that has it (or a link in its text), refuses before the draft on an account without Teams, and only the organizer adds a link", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await msUser(h);
    const drafts: Record<string, unknown>[] = [];
    const ctx: ToolContext = { db: h.db, userId: user.id, now: new Date(), createPending: async (kind, payload) => (drafts.push({ kind, ...payload }), { id: `pa${drafts.length}` }) as PendingActionRow };
    const update = (input: Record<string, unknown>, list = tools) => list.find((t) => t.name === "update_event")!.run({ subject: "", date: "", start: "", end: "", location: "", online_meeting: true, ...input }, ctx);

    // the meeting with Barak already is a Teams meeting: a link alone needs no draft, the model gets the link
    expect(await update({ id: "AAMkAGe2" })).toMatchObject({ status: "already_online", join_url: FIXTURE_TEAMS_JOIN_URL });
    expect(drafts).toHaveLength(0);
    // moving it stays a move: no Teams request in the draft, the attendee hears about the change
    expect(await update({ id: "AAMkAGe2", date: "2026-10-22", start: "15:00", end: "16:00" })).toMatchObject({ status: "pending_approval" });
    expect(drafts.at(-1)).not.toHaveProperty("online_meeting");
    expect(drafts.at(-1)).toMatchObject({ current_subject: "פגישה עם רו״ח ברק", current_attendee_count: 1, current_join_url: FIXTURE_TEAMS_JOIN_URL });

    // the Zoom add-in left its link in the location (isOnlineMeeting false): the same, a second link would confuse
    const hearing = fixture.state.events.find((e) => e.id === "AAMkAGe1")!;
    hearing.location = { displayName: ZOOM };
    const listed = (await tools.find((t) => t.name === "list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events[0]).toMatchObject({ id: "AAMkAGe1", join_url: ZOOM });
    expect(await update({ id: "AAMkAGe1" })).toMatchObject({ status: "already_online", join_url: ZOOM });
    expect(await update({ id: "AAMkAGe1", start: "09:30", end: "11:00", date: "2026-10-21" })).toMatchObject({ status: "pending_approval" });
    expect(drafts.at(-1)).not.toHaveProperty("online_meeting");
    expect(drafts.at(-1)).toMatchObject({ current_join_url: ZOOM });
    hearing.location = { displayName: "בית משפט השלום, ויצמן 1" };

    // an attendee's copy: the link would not reach the others
    hearing.isOrganizer = false;
    expect(await update({ id: "AAMkAGe1" })).toMatchObject({ status: "error", error: "not_organizer" });
    hearing.isOrganizer = true;

    // a personal account: known at draft time (the event was read anyway), no draft certain to fail after the press
    const before = drafts.length;
    fixture.state.onlineMeetingProviders = ["skypeForConsumer"];
    const personalTools = graphTools({ graph: async () => new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl }), timeZone: TZ, connection: { tenant_id: MSA_CONSUMER_TENANT, account_email: "dana.levi@outlook.com" } });
    expect(await update({ id: "AAMkAGe1" }, personalTools)).toMatchObject({ status: "error", error: "online_unavailable", personal: true, note: expect.stringContaining(PERSONAL) });
    expect(await update({ id: "AAMkAGe1", location: "חדר ישיבות" }, personalTools)).toMatchObject({ status: "error", error: "online_unavailable" });
    expect(drafts).toHaveLength(before);
    fixture.state.onlineMeetingProviders = ["teamsForBusiness", "skypeForBusiness"];

    // between the draft and the press the meeting got a link elsewhere: nothing is sent, the link is shown
    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    Object.assign(hearing, { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", onlineMeeting: { joinUrl: FIXTURE_TEAMS_JOIN_URL } });
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(`לפגישה כבר יש קישור, ולא נוסף קישור חדש.\nקישור לפגישה: ${FIXTURE_TEAMS_JOIN_URL}`);

    // the user stopped being the organizer before the press: nothing changes
    Object.assign(hearing, { isOnlineMeeting: false, onlineMeetingProvider: "unknown", onlineMeeting: null });
    h.ai.enqueue(ROUTER, updateCall("AAMkAGe1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    hearing.isOrganizer = false;
    const pressed = idOf(lastDraft(h));
    await processInbound(h.ctx, h.button(`pa:approve:${pressed}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(copy["act.cal.online_organizer_only"]());
    expect((await h.db.getPendingAction(pressed))!.status).toBe("failed");
  });

  it("an agent's draft: the offer keeps the agent's header while the agent may prepare it, else the user is pointed to the main assistant", async () => {
    const h = makeHarness();
    const { user } = await msUser(h, { providers: ["skypeForBusiness"], check: false });
    h.db.seedSubscription(user.id, "pro", "active");
    const agentDraft = () => h.db.createPendingAction(user.id, "create_event", { ...MEETING, online_meeting: true, provider: "microsoft" }, new Date(h.ctx.now().getTime() + 600_000), { agentKey: "builtin:secretary", agentName: "מזכירה" });

    const first = await agentDraft();
    await processInbound(h.ctx, h.button(`pa:approve:${first.id}`, "קבע"));
    const offer = lastDraft(h);
    expect(offer.body).toBe(`${acopy["agent.reply_header"]("מזכירה")}\n${WORK}\n\n${DRAFT}\n\nלקבוע בלי קישור?`);
    expect(await h.db.getPendingAction(idOf(offer))).toMatchObject({ agent_key: "builtin:secretary", agent_name: "מזכירה", payload: { online_fallback: "microsoft" } });

    // the agent's list no longer has Barak: it may not prepare the offer
    const listed = await updateAgentFor(h.db, user.id, "builtin:secretary", { recipients: "office@other.example" }, { source: "account", now: h.ctx.now() });
    if (!listed.ok) throw new Error(listed.message);
    const drafts = draftCount(h);
    const second = await agentDraft();
    await processInbound(h.ctx, h.button(`pa:approve:${second.id}`, "קבע"));
    expect(draftCount(h)).toBe(drafts);
    expect(h.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא נקבעה. אפשר לבקש מ-״@${PRODUCT_NAME}״ לקבוע אותה בלי קישור.`);
  });

  it("an agent that lost calendar.write between its draft and the press gets no calendar draft; an update_event offer passes its recipient list with current_attendees", async () => {
    const h = makeHarness();
    const { user, fixture } = await msUser(h, { providers: ["skypeForBusiness"], check: false });
    h.db.seedSubscription(user.id, "pro", "active");
    const opts = { source: "account" as const, now: h.ctx.now() };
    const asAgent = { agentKey: "builtin:secretary" as const, agentName: "מזכירה" };
    const expires = () => new Date(h.ctx.now().getTime() + 600_000);

    // calendar.write removed: the offer would be a calendar draft under its name
    const narrowed = await updateAgentFor(h.db, user.id, "builtin:secretary", { capabilities: ["calendar.read", "reminders"] }, opts);
    if (!narrowed.ok) throw new Error(narrowed.message);
    const created = await h.db.createPendingAction(user.id, "create_event", { ...MEETING, online_meeting: true, provider: "microsoft" }, expires(), asAgent);
    const drafts = draftCount(h);
    await processInbound(h.ctx, h.button(`pa:approve:${created.id}`, "קבע"));
    expect(draftCount(h)).toBe(drafts);
    expect(h.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא נקבעה. אפשר לבקש מ-״@${PRODUCT_NAME}״ לקבוע אותה בלי קישור.`);

    // calendar.write back, the list has Barak: the change without the link passes the guard with the same attendees
    const restored = await updateAgentFor(h.db, user.id, "builtin:secretary", { capabilities: ["calendar.read", "calendar.write", "reminders"], recipients: "barak@cpa-barak.co.il" }, opts);
    if (!restored.ok) throw new Error(restored.message);
    fixture.state.events.find((e) => e.id === "AAMkAGe1")!.attendees = [{ emailAddress: { name: "ברק", address: "barak@cpa-barak.co.il" }, status: { response: "accepted" } }];
    const change = { provider: "microsoft", online_meeting: true, id: "AAMkAGe1", subject: "", date: "", start: "", end: "", location: "חדר ישיבות", current_subject: "דיון בבית משפט השלום ת״א", current_date: "2026-10-21", current_start: "09:00", current_attendee_count: 1, current_attendees: ["barak@cpa-barak.co.il"] };
    const updated = await h.db.createPendingAction(user.id, "update_event", change, expires(), asAgent);
    await processInbound(h.ctx, h.button(`pa:approve:${updated.id}`, "עדכן"));
    const offer = lastDraft(h);
    expect(offer.body).toBe(`${acopy["agent.reply_header"]("מזכירה")}\n${WORK}\n\n*שינוי פגישה*\n${HEARING}\nהמשתתפים יקבלו עדכון.\nמקום: חדר ישיבות\nלעדכן בלי קישור?`);
    const row = (await h.db.getPendingAction(idOf(offer)))!;
    expect(row).toMatchObject({ kind: "update_event", agent_key: "builtin:secretary", payload: { current_attendees: ["barak@cpa-barak.co.il"], online_fallback: "microsoft", location: "חדר ישיבות" } });
    expect(row.payload).not.toHaveProperty("online_meeting");

    // Barak is off the list: the same offer is refused, the user is pointed to the main assistant
    const other = await updateAgentFor(h.db, user.id, "builtin:secretary", { recipients: "office@other.example" }, opts);
    if (!other.ok) throw new Error(other.message);
    const again = await h.db.createPendingAction(user.id, "update_event", change, expires(), asAgent);
    const count = draftCount(h);
    await processInbound(h.ctx, h.button(`pa:approve:${again.id}`, "עדכן"));
    expect(draftCount(h)).toBe(count);
    expect(h.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא עודכנה. אפשר לבקש מ-״@${PRODUCT_NAME}״ לעדכן אותה בלי קישור.`);
    expect(patches(fixture.state.calls)).toHaveLength(0);
  });
});
