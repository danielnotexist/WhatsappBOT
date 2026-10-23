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
import { GraphClient } from "./graph";
import { graphExecutors, graphTools } from "./tools";

const TZ = "Asia/Jerusalem";
const ROUTER = { text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' };
const MEETING = { title: "פגישה עם ברק", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: ["barak@cpa-barak.co.il"] };
const DRAFT = "*פגישה חדשה*\nפגישה עם ברק\nיום ה׳ 22.10, 10:00–11:00\nמשתתפים: barak@cpa-barak.co.il";
const WORK = "בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams.";
const PERSONAL = "בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams (היא זמינה רק בחשבון עבודה או בית ספר).";

type FetchWrap = (f: typeof fetch) => typeof fetch;

/** A Microsoft 365 user wired like production: Graph tools for the model, Graph executors (with the connection) behind the buttons. */
async function msUser(h: ReturnType<typeof makeHarness>, opts: { providers?: string[]; email?: string; tenant?: string; fetchImpl?: FetchWrap } = {}) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  const connection = h.db.seedConnection(user.id, "microsoft", opts.email ?? "dana@levi-law.co.il");
  connection.tenant_id = opts.tenant ?? "3f1a-levi-law-tenant";
  const fixture = createGraphFixture();
  if (opts.providers) fixture.state.onlineMeetingProviders = opts.providers;
  const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: opts.fetchImpl ? opts.fetchImpl(fixture.fetchImpl) : fixture.fetchImpl });
  const tools = graphTools({ graph: async () => graph, timeZone: TZ });
  h.ctx.extraTools = async () => tools;
  const ex = graphExecutors(async () => ({ graph, timeZone: TZ, connection }));
  registerExecutor("create_event", ex.create_event);
  registerExecutor("update_event", ex.update_event);
  return { user, fixture, graph, tools, connection };
}

const lastDraft = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
const idOf = (draft: { buttons?: { id: string }[] }) => draft.buttons![0]!.id.split(":")[2]!;
const path = (c: { url: string }) => new URL(c.url).pathname;
const eventPosts = <T extends { method: string; url: string }>(calls: T[]) => calls.filter((c) => c.method === "POST" && path(c).endsWith("/me/events"));
const patches = <T extends { method: string; url: string }>(calls: T[]) => calls.filter((c) => c.method === "PATCH");
/** Answers the calendar's provider list itself (the fixture's events still follow `state.onlineMeetingProviders`). */
const calendarSays = (answer: () => Response): FetchWrap => (f) => (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).pathname.endsWith("/me/calendar") ? answer() : f(input, init))) as typeof fetch;

describe("Teams meetings on Microsoft 365", () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  });
  afterEach(() => clearExecutorsForTests());

  it("GraphClient: online meeting fields in the body, the join link from onlineMeeting.joinUrl, the provider check", async () => {
    const fixture = createGraphFixture();
    const client = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const created = await client.createEvent({ subject: "פגישה", start: "2026-10-22T10:00:00", end: "2026-10-22T11:00:00", timeZone: TZ, onlineMeeting: true });
    expect(fixture.state.calls.at(-1)!.body).toMatchObject({ subject: "פגישה", isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" });
    expect(created).toMatchObject({ isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", isOrganizer: true, joinUrl: expect.stringMatching(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//) });

    await client.createEvent({ subject: "פרונטלית", start: "2026-10-22T12:00:00", end: "2026-10-22T13:00:00", timeZone: TZ });
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("isOnlineMeeting");
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("onlineMeetingProvider");

    const day = await client.calendarView(new Date("2026-10-20T21:00:00Z"), new Date("2026-10-21T21:00:00Z"), TZ);
    const select = new URL(fixture.state.calls.at(-1)!.url).searchParams.get("$select")!.split(",");
    expect(select).toEqual(expect.arrayContaining(["isOnlineMeeting", "onlineMeetingProvider", "onlineMeeting", "isOrganizer"]));
    expect(day.map((e) => e.joinUrl)).toEqual([null, FIXTURE_TEAMS_JOIN_URL, expect.any(String), null]);

    // a link off the known meeting services never reaches the model or a message
    fixture.state.events[0]!.onlineMeeting = { joinUrl: "https://evil.example/teams" };
    expect((await client.getEvent(fixture.state.events[0]!.id, TZ)).joinUrl).toBeNull();

    expect(await client.onlineMeetingProviders()).toEqual(["teamsForBusiness", "skypeForBusiness"]);
    // a personal account: no Teams in the list, and Graph does not refuse the request; it drops the meeting (201)
    fixture.state.onlineMeetingProviders = ["skypeForConsumer"];
    expect(await client.onlineMeetingProviders()).toEqual(["skypeForConsumer"]);
    const personal = await client.createEvent({ subject: "אישי", start: "2026-10-22T14:00:00", end: "2026-10-22T15:00:00", timeZone: TZ, onlineMeeting: true });
    expect(personal).toMatchObject({ isOnlineMeeting: false, joinUrl: null });
    // an answer without the list counts as none allowed; a failed request is unknown (null)
    const bare = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: calendarSays(() => Response.json({ id: "AQMkCAL" }))(fixture.fetchImpl) });
    expect(await bare.onlineMeetingProviders()).toEqual([]);
    const down = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: calendarSays(() => Response.json({ error: { code: "BadRequest", message: "x" } }, { status: 400 }))(fixture.fetchImpl) });
    expect(await down.onlineMeetingProviders()).toBeNull();
  });

  it("create_event with online_meeting: the draft says פגישת Teams, the approved event is a Teams meeting and the reply carries its link", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h);
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));

    const draft = lastDraft(h);
    expect(draft.body).toBe(`${DRAFT}\nפגישת Teams (הקישור יישלח בהזמנה)\n\nלקבוע?`);
    expect(draft.buttons!.map((b) => b.title)).toEqual(["קבע", "ערוך", "בטל"]);
    // the calendar is pinned in the draft, so the service it names is the one created
    expect((await h.db.getPendingAction(idOf(draft)))!.payload).toMatchObject({ online_meeting: true, provider: "microsoft" });
    expect(eventPosts(fixture.state.calls)).toHaveLength(0); // nothing before the press

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).toMatchObject({ subject: "פגישה עם ברק", isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", attendees: [{ emailAddress: { address: "barak@cpa-barak.co.il" } }] });
    const joinUrl = fixture.state.events.at(-1)!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${joinUrl}\nההזמנות יצאו למשתתפים.`);
    // the provider check ran before the event was created
    const calendarCheck = fixture.state.calls.findIndex((c) => path(c).endsWith("/me/calendar"));
    expect(calendarCheck).toBeGreaterThanOrEqual(0);
    expect(calendarCheck).toBeLessThan(fixture.state.calls.indexOf(post!));
  });

  it("a personal Microsoft account (no Teams): nothing is created; the same meeting without a link is a new draft, created only after its approval", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], email: "dana.levi@outlook.com", tenant: MSA_CONSUMER_TENANT });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const first = lastDraft(h);
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
    await msUser(h, { providers: ["skypeForBusiness"] });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
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
    h2.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
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

  it("the provider check fails: nothing is created blind; Graph drops the meeting although the check passed: the reply says the link is missing", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { fetchImpl: calendarSays(() => Response.json({ error: { code: "ServiceUnavailable", message: "down" } }, { status: 503 })) });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const draft = lastDraft(h);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    expect(eventPosts(fixture.state.calls)).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(copy["err.provider_down"]("Microsoft 365"));
    expect(lastDraft(h)).toBe(draft); // no offer: nothing is known to be wrong with Teams

    const h2 = makeHarness();
    const lists = calendarSays(() => Response.json({ allowedOnlineMeetingProviders: ["teamsForBusiness"] }));
    const { fixture: f2 } = await msUser(h2, { providers: ["skypeForConsumer"], fetchImpl: lists });
    h2.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h2.ctx, h2.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    await processInbound(h2.ctx, h2.button(`pa:approve:${idOf(lastDraft(h2))}`, "קבע"));
    expect(eventPosts(f2.state.calls)).toHaveLength(1);
    expect(h2.wa.texts.at(-1)).toBe("נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nקישור Teams לא נוצר לפגישה הזו.\nההזמנות יצאו בלי קישור. אפשר לבקש להוסיף אותו.");
  });

  it("list_events hands the model the join link; update_event names the meeting in the draft and adds Teams after approval", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await msUser(h);
    const ctx = { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("read only"); } };
    const listed = (await tools.find((t) => t.name === "list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events[0]).not.toHaveProperty("join_url");
    expect(listed.events[1]).toMatchObject({ subject: "פגישה עם רו״ח ברק", organizer_is_me: true, join_url: FIXTURE_TEAMS_JOIN_URL });

    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "u1", name: "update_event", input: { id: "AAMkAGe1", subject: "", date: "", start: "", end: "", location: "", online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    const draft = lastDraft(h);
    expect(draft.body).toBe("*שינוי פגישה*\nפגישה: דיון בבית משפט השלום ת״א, יום ד׳ 21.10 ב-09:00\nהוספת פגישת Teams\nלעדכן?");
    expect(draft.buttons!.map((b) => b.title)).toEqual(["עדכן", "ערוך", "בטל"]);
    expect(patches(fixture.state.calls)).toHaveLength(0);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "עדכן"));
    expect(patches(fixture.state.calls).at(-1)!.body).toEqual({ isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" });
    const joinUrl = fixture.state.events.find((e) => e.id === "AAMkAGe1")!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נוסף קישור Teams לפגישה ״דיון בבית משפט השלום ת״א״.\nקישור לפגישה: ${joinUrl}`);
  });

  it("update_event never asks Teams for a meeting that has it, and only the organizer adds a link", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await msUser(h);
    const drafts: Record<string, unknown>[] = [];
    const ctx: ToolContext = { db: h.db, userId: user.id, now: new Date(), createPending: async (kind, payload) => (drafts.push({ kind, ...payload }), { id: `pa${drafts.length}` }) as PendingActionRow };
    const update = (input: Record<string, unknown>) => tools.find((t) => t.name === "update_event")!.run({ subject: "", date: "", start: "", end: "", location: "", online_meeting: true, ...input }, ctx);

    // the meeting with Barak already is a Teams meeting: a link alone needs no draft, the model gets the link
    expect(await update({ id: "AAMkAGe2" })).toMatchObject({ status: "already_online", join_url: FIXTURE_TEAMS_JOIN_URL });
    expect(drafts).toHaveLength(0);
    // moving it stays a move: no Teams request in the draft, the attendee hears about the change
    expect(await update({ id: "AAMkAGe2", date: "2026-10-22", start: "15:00", end: "16:00" })).toMatchObject({ status: "pending_approval" });
    expect(drafts.at(-1)).not.toHaveProperty("online_meeting");
    expect(drafts.at(-1)).toMatchObject({ current_subject: "פגישה עם רו״ח ברק", current_attendee_count: 1, current_join_url: FIXTURE_TEAMS_JOIN_URL });

    // an attendee's copy: the link would not reach the others
    fixture.state.events[0]!.isOrganizer = false;
    expect(await update({ id: "AAMkAGe1" })).toMatchObject({ status: "error", error: "not_organizer" });
    fixture.state.events[0]!.isOrganizer = true;

    // between the draft and the press the meeting got a link elsewhere: nothing is sent, the link is shown
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "u1", name: "update_event", input: { id: "AAMkAGe1", subject: "", date: "", start: "", end: "", location: "", online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    Object.assign(fixture.state.events[0]!, { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", onlineMeeting: { joinUrl: FIXTURE_TEAMS_JOIN_URL } });
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(`לפגישה כבר יש קישור, ולא נוסף קישור חדש.\nקישור לפגישה: ${FIXTURE_TEAMS_JOIN_URL}`);

    // the user stopped being the organizer before the press: nothing changes
    Object.assign(fixture.state.events[0]!, { isOnlineMeeting: false, onlineMeetingProvider: "unknown", onlineMeeting: null });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "u2", name: "update_event", input: { id: "AAMkAGe1", subject: "", date: "", start: "", end: "", location: "", online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    fixture.state.events[0]!.isOrganizer = false;
    const pressed = idOf(lastDraft(h));
    await processInbound(h.ctx, h.button(`pa:approve:${pressed}`, "עדכן"));
    expect(patches(fixture.state.calls)).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(copy["act.cal.online_organizer_only"]());
    expect((await h.db.getPendingAction(pressed))!.status).toBe("failed");
  });

  it("an agent's draft: the offer keeps the agent's header while the agent may prepare it, else the user is pointed to the main assistant", async () => {
    const h = makeHarness();
    const { user } = await msUser(h, { providers: ["skypeForBusiness"] });
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
    const drafts = h.wa.sent.filter((s) => s.kind === "buttons").length;
    const second = await agentDraft();
    await processInbound(h.ctx, h.button(`pa:approve:${second.id}`, "קבע"));
    expect(h.wa.sent.filter((s) => s.kind === "buttons")).toHaveLength(drafts);
    expect(h.wa.texts.at(-1)).toBe(`${WORK}\nהפגישה לא נקבעה. אפשר לבקש מ-״@${PRODUCT_NAME}״ לקבוע אותה בלי קישור.`);
  });
});
