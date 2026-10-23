import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearExecutorsForTests, registerExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { copy } from "@/lib/copy/bot";
import { FIXTURE_TEAMS_JOIN_URL, createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient } from "./graph";
import { graphExecutors, graphTools } from "./tools";

const TZ = "Asia/Jerusalem";
const ROUTER = { text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' };
const MEETING = { title: "פגישה עם ברק", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: ["barak@cpa-barak.co.il"] };

/** A Microsoft 365 user wired like production: Graph tools for the model, Graph executors behind the buttons. */
async function msUser(h: ReturnType<typeof makeHarness>, opts: { providers?: string[]; fetchImpl?: (f: typeof fetch) => typeof fetch } = {}) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  h.db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
  const fixture = createGraphFixture();
  if (opts.providers) fixture.state.onlineMeetingProviders = opts.providers;
  const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: opts.fetchImpl ? opts.fetchImpl(fixture.fetchImpl) : fixture.fetchImpl });
  const tools = graphTools({ graph: async () => graph, timeZone: TZ });
  h.ctx.extraTools = async () => tools;
  const ex = graphExecutors(async () => ({ graph, timeZone: TZ }));
  registerExecutor("create_event", ex.create_event);
  registerExecutor("update_event", ex.update_event);
  return { user, fixture, graph, tools };
}

const lastDraft = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
const idOf = (draft: { buttons?: { id: string }[] }) => draft.buttons![0]!.id.split(":")[2]!;
const eventPosts = <T extends { method: string; url: string }>(calls: T[]) => calls.filter((c) => c.method === "POST" && new URL(c.url).pathname.endsWith("/me/events"));

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
    expect(created).toMatchObject({ isOnlineMeeting: true, joinUrl: expect.stringMatching(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//) });

    await client.createEvent({ subject: "פרונטלית", start: "2026-10-22T12:00:00", end: "2026-10-22T13:00:00", timeZone: TZ });
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("isOnlineMeeting");

    const day = await client.calendarView(new Date("2026-10-20T21:00:00Z"), new Date("2026-10-21T21:00:00Z"), TZ);
    expect(new URL(fixture.state.calls.at(-1)!.url).searchParams.get("$select")).toContain("onlineMeeting");
    expect(day.map((e) => e.joinUrl)).toEqual([null, FIXTURE_TEAMS_JOIN_URL, expect.any(String), null]);

    // a link off the known meeting services never reaches the model or a message
    fixture.state.events[0]!.onlineMeeting = { joinUrl: "https://evil.example/teams" };
    expect((await client.getEvent(fixture.state.events[0]!.id, TZ)).joinUrl).toBeNull();

    expect(await client.onlineMeetingProviders()).toEqual(["teamsForBusiness", "skypeForBusiness"]);
    fixture.state.onlineMeetingProviders = ["skypeForConsumer"];
    expect(await client.onlineMeetingProviders()).toEqual(["skypeForConsumer"]);
  });

  it("create_event with online_meeting: the draft says פגישת Teams, the approved event is a Teams meeting and the reply carries its link", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h);
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));

    const draft = lastDraft(h);
    expect(draft.body).toBe("*פגישה חדשה*\nפגישה עם ברק\nיום ה׳ 22.10, 10:00–11:00\nפגישת Teams\nמשתתפים: barak@cpa-barak.co.il\n\nלקבוע?");
    expect(draft.buttons!.map((b) => b.title)).toEqual(["קבע", "ערוך", "בטל"]);
    expect(eventPosts(fixture.state.calls)).toHaveLength(0); // nothing before the press

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).toMatchObject({ subject: "פגישה עם ברק", isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", attendees: [{ emailAddress: { address: "barak@cpa-barak.co.il" } }] });
    const joinUrl = fixture.state.events.at(-1)!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${joinUrl}\nההזמנות יצאו למשתתפים.`);
    // the provider check ran before the event was created
    const calendarCheck = fixture.state.calls.findIndex((c) => new URL(c.url).pathname.endsWith("/me/calendar"));
    expect(calendarCheck).toBeGreaterThanOrEqual(0);
    expect(calendarCheck).toBeLessThan(fixture.state.calls.indexOf(post!));
  });

  it("a personal Microsoft account (no Teams): nothing is created; the same meeting without a link is a new draft, created only after its approval", async () => {
    const h = makeHarness();
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"] });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    const first = lastDraft(h);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(first)}`, "קבע"));

    expect(eventPosts(fixture.state.calls)).toHaveLength(0);
    expect((await h.db.getPendingAction(idOf(first)))!.status).toBe("failed");
    const offer = lastDraft(h);
    expect(offer).not.toBe(first);
    expect(offer.body).toBe(
      "בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams (היא זמינה רק בחשבון עבודה או בית ספר).\n\n*פגישה חדשה*\nפגישה עם ברק\nיום ה׳ 22.10, 10:00–11:00\nמשתתפים: barak@cpa-barak.co.il\n\nלקבוע בלי קישור?",
    );
    expect(offer.buttons!.map((b) => b.title)).toEqual(["קבע בלי קישור", "ערוך", "בטל"]);
    const next = (await h.db.getPendingAction(idOf(offer)))!;
    expect(next).toMatchObject({ kind: "create_event", status: "pending", payload: { title: "פגישה עם ברק", provider: "microsoft", online_fallback: "microsoft" } });
    expect(next.payload).not.toHaveProperty("online_meeting");

    await processInbound(h.ctx, h.button(`pa:approve:${next.id}`, "קבע בלי קישור"));
    const [post] = eventPosts(fixture.state.calls);
    expect(post!.body).not.toHaveProperty("isOnlineMeeting");
    expect(h.wa.texts.at(-1)).toBe("נקבע: פגישה עם ברק, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
  });

  it("Graph refuses the Teams meeting (provider check unavailable): the same offer; without room for a new draft, a plain message", async () => {
    const h = makeHarness();
    // GET /me/calendar fails → unknown → the create is tried and Graph answers 400 about the online meeting provider
    const calendarDown = (f: typeof fetch) => (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).pathname.endsWith("/me/calendar") ? Response.json({ error: { code: "ServiceUnavailable", message: "down" } }, { status: 503 }) : f(input, init))) as typeof fetch;
    const { fixture } = await msUser(h, { providers: ["skypeForConsumer"], fetchImpl: calendarDown });
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת טימס עם ברק מחר ב-10"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    expect(eventPosts(fixture.state.calls)).toHaveLength(1); // tried once, refused
    expect(fixture.state.events.some((e) => e.subject === "פגישה עם ברק")).toBe(false);
    expect(lastDraft(h).buttons![0]!.title).toBe("קבע בלי קישור");

    // an agent at its daily cap (or any failure to store the offer) → the explanation alone, nothing created
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e2", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("ושוב, פגישת טימס עם ברק"));
    const spy = vi.spyOn(h.db, "createPendingAction").mockRejectedValueOnce(new Error("cap"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    spy.mockRestore();
    expect(h.wa.texts.at(-1)).toBe(copy["act.cal.online_not_done"]("microsoft", false));
    expect(h.wa.texts.at(-1)).toBe("בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams (היא זמינה רק בחשבון עבודה או בית ספר).\nהפגישה לא נקבעה. אפשר לבקש לקבוע אותה בלי קישור.");
  });

  it("list_events hands the model the join link; update_event adds Teams to an existing meeting", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await msUser(h);
    const ctx = { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("read only"); } };
    const listed = (await tools.find((t) => t.name === "list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events[0]).not.toHaveProperty("join_url");
    expect(listed.events[1]).toMatchObject({ subject: "פגישה עם רו״ח ברק", join_url: FIXTURE_TEAMS_JOIN_URL });

    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "u1", name: "update_event", input: { id: "AAMkAGe1", subject: "", date: "", start: "", end: "", location: "", online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי קישור טימס לדיון"));
    const draft = lastDraft(h);
    expect(draft.body).toBe("*שינוי פגישה*\nהוספת פגישת Teams\nלעדכן?");
    expect(draft.buttons!.map((b) => b.title)).toEqual(["עדכן", "ערוך", "בטל"]);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "עדכן"));
    expect(fixture.state.calls.filter((c) => c.method === "PATCH").at(-1)!.body).toEqual({ isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" });
    const joinUrl = fixture.state.events.find((e) => e.id === "AAMkAGe1")!.onlineMeeting!.joinUrl;
    expect(h.wa.texts.at(-1)).toBe(`נוסף קישור Teams לפגישה "דיון בבית משפט השלום ת״א".\nקישור לפגישה: ${joinUrl}`);
  });
});
