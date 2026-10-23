import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearExecutorsForTests, registerExecutor, type ActionExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { FIXTURE_MEET_URL, createGoogleFixture } from "./__fixtures__/google-fixtures";
import { GoogleClient } from "./client";
import { providerForAction, routeExecutorsByProvider } from "./dispatch";
import { GOOGLE_BASE_SCOPES, normalizeScopes } from "./oauth";
import { googleExecutors, googleTools } from "./tools";

const TZ = "Asia/Jerusalem";
const ROUTER = { text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' };
const MEETING = { title: "שיחה עם כהן", date: "2026-10-22", start: "10:00", end: "10:30", location: "", attendees: ["cohen@example.co.il"] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A Google-only user wired like production: the base and gcal_ tools for the model, executors routed by provider. */
async function googleUser(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  const conn = h.db.seedConnection(user.id, "google", "dana.levi@gmail.com");
  conn.scopes = normalizeScopes([...GOOGLE_BASE_SCOPES]);
  const fixture = createGoogleFixture();
  const google = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fixture.fetchImpl });
  const tools = googleTools({ google: async () => google, timeZone: TZ, scopes: conn.scopes, accountEmail: conn.account_email });
  h.ctx.extraTools = async () => tools;
  const microsoft = Object.fromEntries(["send_mail", "create_event", "update_event", "delete_event", "forward_mail"].map((k) => [k, (async () => ({ ok: false, message: "ms" })) as ActionExecutor]));
  const routed = routeExecutorsByProvider({ microsoft: microsoft as never, google: googleExecutors(async () => ({ google, timeZone: TZ, connection: conn })) }, (a) => providerForAction(h.db, a));
  for (const [kind, fn] of Object.entries(routed)) registerExecutor(kind as keyof typeof routed, fn);
  return { user, fixture, google, tools };
}

const lastDraft = (h: ReturnType<typeof makeHarness>) => h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
const idOf = (draft: { buttons?: { id: string }[] }) => draft.buttons![0]!.id.split(":")[2]!;
const eventWrites = <T extends { method: string; url: string }>(calls: T[], method: "POST" | "PATCH") => calls.filter((c) => c.method === method && new URL(c.url).pathname.includes("/calendars/primary/events"));

describe("Google Meet on Google Calendar", () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  });
  afterEach(() => clearExecutorsForTests());

  it("GoogleClient: conferenceData.createRequest with conferenceDataVersion=1, a fresh requestId, the link from hangoutLink / entry points", async () => {
    const fixture = createGoogleFixture();
    const client = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: fixture.fetchImpl });
    const a = await client.createEvent({ summary: "א", start: "2026-10-22T10:00:00", end: "2026-10-22T10:30:00", timeZone: TZ, onlineMeeting: true });
    const post = fixture.state.calls.at(-1)!;
    expect(new URL(post.url).searchParams.get("conferenceDataVersion")).toBe("1");
    const body = post.body as { conferenceData: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } } };
    expect(body.conferenceData.createRequest.conferenceSolutionKey).toEqual({ type: "hangoutsMeet" });
    expect(body.conferenceData.createRequest.requestId).toMatch(UUID);
    expect(a).toMatchObject({ joinUrl: expect.stringMatching(/^https:\/\/meet\.google\.com\//), conferenceStatus: "success" });

    await client.createEvent({ summary: "ב", start: "2026-10-22T11:00:00", end: "2026-10-22T11:30:00", timeZone: TZ, onlineMeeting: true });
    expect((fixture.state.calls.at(-1)!.body as typeof body).conferenceData.createRequest.requestId).not.toBe(body.conferenceData.createRequest.requestId);

    // a meeting in person: no conference parameter, no conferenceData
    await client.createEvent({ summary: "ג", start: "2026-10-22T12:00:00", end: "2026-10-22T12:30:00", timeZone: TZ });
    expect(new URL(fixture.state.calls.at(-1)!.url).searchParams.has("conferenceDataVersion")).toBe(false);
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("conferenceData");

    const day = await client.listEvents({ timeMin: new Date("2026-10-20T21:00:00Z"), timeMax: new Date("2026-10-21T21:00:00Z"), timeZone: TZ });
    expect(day.map((e) => [e.summary, e.joinUrl])).toEqual([["יום הולדת לנועה", null], ["פגישת צוות שבועית", null], ["שיחה עם משפחת אברהם", FIXTURE_MEET_URL]]);

    // no hangoutLink: the video entry point; a link off the known meeting services is dropped
    const gev1 = fixture.state.events.find((e) => e.id === "gev1")!;
    gev1.conferenceData = { entryPoints: [{ entryPointType: "phone", uri: "tel:+1-555" }, { entryPointType: "video", uri: "https://acme.zoom.us/j/42" }] };
    expect((await client.getEvent("gev1")).joinUrl).toBe("https://acme.zoom.us/j/42");
    gev1.conferenceData = { entryPoints: [{ entryPointType: "video", uri: "https://phish.example/meet" }] };
    expect((await client.getEvent("gev1")).joinUrl).toBeNull();
  });

  it("gcal_create_event with online_meeting: the draft says פגישת Google Meet, the approved event gets a Meet and the reply carries its link", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "gcal_create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי שיחת וידאו עם כהן מחר ב-10"));
    const draft = lastDraft(h);
    expect(draft.body).toBe("*פגישה חדשה*\nשיחה עם כהן\nיום ה׳ 22.10, 10:00–10:30\nפגישת Google Meet\nמשתתפים: cohen@example.co.il\n\nלקבוע?");
    expect(eventWrites(fixture.state.calls, "POST")).toHaveLength(0);

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    const [post] = eventWrites(fixture.state.calls, "POST");
    expect(Object.fromEntries(new URL(post!.url).searchParams)).toEqual({ sendUpdates: "all", conferenceDataVersion: "1" });
    expect(post!.body).toMatchObject({ summary: "שיחה עם כהן", conferenceData: { createRequest: { requestId: expect.stringMatching(UUID), conferenceSolutionKey: { type: "hangoutsMeet" } } } });
    const link = fixture.state.events.at(-1)!.hangoutLink!;
    expect(h.wa.texts.at(-1)).toBe(`נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${link}\nההזמנות יצאו למשתתפים.`);
  });

  it("the base create_event of a Google-only user is labelled Google Meet; a pending conference is read once more for its link", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    fixture.state.conferenceMode = "pending";
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת זום עם כהן מחר ב-10"));
    expect(lastDraft(h).body).toContain("\nפגישת Google Meet\n");
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    const created = fixture.state.events.at(-1)!;
    const reads = fixture.state.calls.filter((c) => c.method === "GET" && new URL(c.url).pathname.endsWith(`/events/${created.id}`));
    expect(reads).toHaveLength(1);
    expect(h.wa.texts.at(-1)).toBe(`נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${created.hangoutLink}\nההזמנות יצאו למשתתפים.`);
  });

  it("Google refuses the Meet: nothing is created; the same meeting without a link is offered as a new draft", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    fixture.state.conferenceMode = "refuse";
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "gcal_create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי מיט עם כהן מחר ב-10"));
    const before = fixture.state.events.length;
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    expect(fixture.state.events).toHaveLength(before);
    const offer = lastDraft(h);
    expect(offer.body).toBe("לא הצלחתי ליצור פגישת Google Meet בחשבון הזה.\n\n*פגישה חדשה*\nשיחה עם כהן\nיום ה׳ 22.10, 10:00–10:30\nמשתתפים: cohen@example.co.il\n\nלקבוע בלי קישור?");
    expect(offer.buttons!.map((b) => b.title)).toEqual(["קבע בלי קישור", "ערוך", "בטל"]);

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(offer)}`, "קבע בלי קישור"));
    const post = eventWrites(fixture.state.calls, "POST").at(-1)!;
    expect(new URL(post.url).searchParams.has("conferenceDataVersion")).toBe(false);
    expect(post.body).not.toHaveProperty("conferenceData");
    expect(h.wa.texts.at(-1)).toBe("נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
  });

  it("gcal_list_events hands the model the join link; gcal_update_event adds a Meet, and never replaces one the meeting has", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await googleUser(h);
    const ctx = { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("read only"); } };
    const listed = (await tools.find((t) => t.name === "gcal_list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21", query: "" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events.map((e) => e.join_url)).toEqual([undefined, undefined, FIXTURE_MEET_URL]);

    const update = (id: string) => ({ toolCalls: [{ id: "u1", name: "gcal_update_event", input: { id, subject: "", date: "", start: "", end: "", location: "", online_meeting: true } }], stopReason: "tool_use" as const });
    h.ai.enqueue(ROUTER, update("gev1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות"));
    expect(lastDraft(h).body).toBe("*שינוי פגישה*\nהוספת פגישת Google Meet\nלעדכן?");
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    const patch = eventWrites(fixture.state.calls, "PATCH").at(-1)!;
    expect(new URL(patch.url).searchParams.get("conferenceDataVersion")).toBe("1");
    expect(patch.body).toMatchObject({ conferenceData: { createRequest: { conferenceSolutionKey: { type: "hangoutsMeet" } } } });
    const link = fixture.state.events.find((e) => e.id === "gev1")!.hangoutLink!;
    expect(h.wa.texts.at(-1)).toBe(`נוסף קישור Google Meet לפגישה "פגישת צוות שבועית".\nקישור לפגישה: ${link}`);

    // the meeting with the Abrahams already has a Meet: no PATCH (a new request would replace the guests' link)
    const patches = eventWrites(fixture.state.calls, "PATCH").length;
    h.ai.enqueue(ROUTER, update("gev2"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לשיחה עם משפחת אברהם"));
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(eventWrites(fixture.state.calls, "PATCH")).toHaveLength(patches);
    expect(h.wa.texts.at(-1)).toBe(`קישור לפגישה: ${FIXTURE_MEET_URL}`);
  });
});
