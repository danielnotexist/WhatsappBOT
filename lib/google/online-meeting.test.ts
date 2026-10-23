import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "@/lib/ai/tools";
import { clearExecutorsForTests, registerExecutor, type ActionExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { copy } from "@/lib/copy/bot";
import type { PendingActionRow } from "@/lib/db/types";
import { FIXTURE_MEET_URL, createGoogleFixture } from "./__fixtures__/google-fixtures";
import { GoogleApiError, GoogleClient } from "./client";
import { providerForAction, routeExecutorsByProvider } from "./dispatch";
import { GOOGLE_BASE_SCOPES, normalizeScopes } from "./oauth";
import { googleExecutors, googleTools } from "./tools";

const TZ = "Asia/Jerusalem";
const ROUTER = { text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' };
const MEETING = { title: "שיחה עם כהן", date: "2026-10-22", start: "10:00", end: "10:30", location: "", attendees: ["cohen@example.co.il"] };
const DRAFT = "*פגישה חדשה*\nשיחה עם כהן\nיום ה׳ 22.10, 10:00–10:30\nמשתתפים: cohen@example.co.il";
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
const updateCall = (id: string, over: Record<string, unknown> = {}) => ({ toolCalls: [{ id: "u1", name: "gcal_update_event", input: { id, subject: "", date: "", start: "", end: "", location: "", online_meeting: true, ...over } }], stopReason: "tool_use" as const });

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
    expect(a).toMatchObject({ joinUrl: expect.stringMatching(/^https:\/\/meet\.google\.com\//), conferenceStatus: "success", hasConference: true });

    await client.createEvent({ summary: "ב", start: "2026-10-22T11:00:00", end: "2026-10-22T11:30:00", timeZone: TZ, onlineMeeting: true });
    expect((fixture.state.calls.at(-1)!.body as typeof body).conferenceData.createRequest.requestId).not.toBe(body.conferenceData.createRequest.requestId);

    // a meeting in person: no conference parameter, no conferenceData; a client-chosen id goes in the body
    const c = await client.createEvent({ id: "0123456789abcdef0123456789abcdef", summary: "ג", start: "2026-10-22T12:00:00", end: "2026-10-22T12:30:00", timeZone: TZ });
    expect(new URL(fixture.state.calls.at(-1)!.url).searchParams.has("conferenceDataVersion")).toBe(false);
    expect(fixture.state.calls.at(-1)!.body).not.toHaveProperty("conferenceData");
    expect(c).toMatchObject({ id: "0123456789abcdef0123456789abcdef", joinUrl: null, hasConference: false });

    const day = await client.listEvents({ timeMin: new Date("2026-10-20T21:00:00Z"), timeMax: new Date("2026-10-21T21:00:00Z"), timeZone: TZ });
    expect(day.map((e) => [e.summary, e.joinUrl])).toEqual([["יום הולדת לנועה", null], ["פגישת צוות שבועית", null], ["שיחה עם משפחת אברהם", FIXTURE_MEET_URL]]);

    // no hangoutLink: the video entry point; a link off the known meeting services is dropped, the conference still counts
    const gev1 = fixture.state.events.find((e) => e.id === "gev1")!;
    gev1.conferenceData = { entryPoints: [{ entryPointType: "phone", uri: "tel:+1-555" }, { entryPointType: "video", uri: "https://acme.zoom.us/j/42" }] };
    expect((await client.getEvent("gev1")).joinUrl).toBe("https://acme.zoom.us/j/42");
    gev1.conferenceData = { entryPoints: [{ entryPointType: "video", uri: "https://phish.example/meet" }] };
    expect(await client.getEvent("gev1")).toMatchObject({ joinUrl: null, hasConference: true });

    // a refused conference: the API's own message is kept apart from the request path
    fixture.state.conferenceMode = "refuse";
    const err = await client.createEvent({ summary: "ד", start: "2026-10-22T13:00:00", end: "2026-10-22T13:30:00", timeZone: TZ, onlineMeeting: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err).toMatchObject({ status: 400, reason: "invalid", apiMessage: "Invalid conference type value." });
  });

  it("gcal_create_event with online_meeting: the draft says פגישת Google Meet, the approved event gets a Meet and the reply carries its link", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "gcal_create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי שיחת וידאו עם כהן מחר ב-10"));
    const draft = lastDraft(h);
    expect(draft.body).toBe(`${DRAFT}\nפגישת Google Meet (הקישור יישלח בהזמנה)\n\nלקבוע?`);
    expect(eventWrites(fixture.state.calls, "POST")).toHaveLength(0);

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    const [post] = eventWrites(fixture.state.calls, "POST");
    expect(Object.fromEntries(new URL(post!.url).searchParams)).toEqual({ sendUpdates: "all", conferenceDataVersion: "1" });
    expect(post!.body).toMatchObject({ id: expect.stringMatching(/^[0-9a-f]{32}$/), summary: "שיחה עם כהן", conferenceData: { createRequest: { requestId: expect.stringMatching(UUID), conferenceSolutionKey: { type: "hangoutsMeet" } } } });
    const link = fixture.state.events.at(-1)!.hangoutLink!;
    expect(h.wa.texts.at(-1)).toBe(`נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${link}\nההזמנות יצאו למשתתפים.`);
  });

  it("the base create_event of a Google-only user is labelled Google Meet; a pending conference is read once more for its link", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    fixture.state.conferenceMode = "pending";
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "create_event", input: { ...MEETING, attendees: [], online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי פגישת זום עם כהן מחר ב-10"));
    expect(lastDraft(h).body).toBe("*פגישה חדשה*\nשיחה עם כהן\nיום ה׳ 22.10, 10:00–10:30\nפגישת Google Meet\n\nלקבוע?");
    expect((await h.db.getPendingAction(idOf(lastDraft(h))))!.payload).toMatchObject({ online_meeting: true, provider: "google" });
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "קבע"));
    const created = fixture.state.events.at(-1)!;
    const reads = fixture.state.calls.filter((c) => c.method === "GET" && new URL(c.url).pathname.endsWith(`/events/${created.id}`));
    expect(reads).toHaveLength(1);
    expect(h.wa.texts.at(-1)).toBe(`נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nקישור לפגישה: ${created.hangoutLink}`);
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
    expect(offer.body).toBe(`לא הצלחתי ליצור פגישת Google Meet בחשבון הזה.\n\n${DRAFT}\n\nלקבוע בלי קישור?`);
    expect(offer.buttons!.map((b) => b.title)).toEqual(["קבע בלי קישור", "ערוך", "בטל"]);

    await processInbound(h.ctx, h.button(`pa:approve:${idOf(offer)}`, "קבע בלי קישור"));
    const post = eventWrites(fixture.state.calls, "POST").at(-1)!;
    expect(new URL(post.url).searchParams.has("conferenceDataVersion")).toBe(false);
    expect(post.body).not.toHaveProperty("conferenceData");
    expect(h.wa.texts.at(-1)).toBe("נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nההזמנות יצאו למשתתפים.");
  });

  it("Google refuses the Meet but created the event anyway: the reply says so, and no second meeting is offered", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    fixture.state.conferenceMode = "refuse_created";
    h.ai.enqueue(ROUTER, { toolCalls: [{ id: "e1", name: "gcal_create_event", input: { ...MEETING, online_meeting: true } }], stopReason: "tool_use" }, { text: "" });
    await processInbound(h.ctx, h.inbound("תקבעי מיט עם כהן מחר ב-10"));
    const draft = lastDraft(h);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(draft)}`, "קבע"));
    expect(fixture.state.events.filter((e) => e.summary === "שיחה עם כהן")).toHaveLength(1);
    expect(lastDraft(h)).toBe(draft);
    expect(h.wa.texts.at(-1)).toBe("נקבע: שיחה עם כהן, יום ה׳ 22.10 ב-10:00.\nקישור Google Meet לא נוצר לפגישה הזו.\nההזמנות יצאו בלי קישור. אפשר לבקש להוסיף אותו.");
    expect((await h.db.getPendingAction(idOf(draft)))!.status).toBe("executed");
  });

  it("gcal_list_events hands the model the join link; gcal_update_event names the meeting and adds a Meet after approval", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await googleUser(h);
    const ctx = { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("read only"); } };
    const listed = (await tools.find((t) => t.name === "gcal_list_events")!.run({ from_date: "2026-10-21", to_date: "2026-10-21", query: "" }, ctx)) as { events: Record<string, unknown>[] };
    expect(listed.events.map((e) => e.join_url)).toEqual([undefined, undefined, FIXTURE_MEET_URL]);
    expect(listed.events.every((e) => e.organizer_is_me === true)).toBe(true);

    h.ai.enqueue(ROUTER, updateCall("gev1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות"));
    expect(lastDraft(h).body).toBe("*שינוי פגישה*\nפגישה: פגישת צוות שבועית, יום ד׳ 21.10 ב-09:00\nהוספת פגישת Google Meet\nלעדכן?");
    expect(eventWrites(fixture.state.calls, "PATCH")).toHaveLength(0);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    const patch = eventWrites(fixture.state.calls, "PATCH").at(-1)!;
    expect(new URL(patch.url).searchParams.get("conferenceDataVersion")).toBe("1");
    expect(patch.body).toMatchObject({ conferenceData: { createRequest: { requestId: expect.stringMatching(UUID), conferenceSolutionKey: { type: "hangoutsMeet" } } } });
    const link = fixture.state.events.find((e) => e.id === "gev1")!.hangoutLink!;
    expect(h.wa.texts.at(-1)).toBe(`נוסף קישור Google Meet לפגישה ״פגישת צוות שבועית״.\nקישור לפגישה: ${link}`);
  });

  it("gcal_update_event never replaces a conference the meeting has, and only the organizer adds one", async () => {
    const h = makeHarness();
    const { fixture, tools, user } = await googleUser(h);
    const drafts: Record<string, unknown>[] = [];
    const ctx: ToolContext = { db: h.db, userId: user.id, now: new Date(), createPending: async (kind, payload) => (drafts.push({ kind, ...payload }), { id: `pa${drafts.length}` }) as PendingActionRow };
    const update = (id: string, over: Record<string, unknown> = {}) => tools.find((t) => t.name === "gcal_update_event")!.run(updateCall(id, over).toolCalls[0]!.input, ctx);

    // the Abrahams already have a Meet: no draft for a link alone; a move stays a move, without a create request
    expect(await update("gev2")).toMatchObject({ status: "already_online", join_url: FIXTURE_MEET_URL });
    expect(drafts).toHaveLength(0);
    expect(await update("gev2", { date: "2026-10-22", start: "15:00", end: "15:30" })).toMatchObject({ status: "pending_approval" });
    expect(drafts.at(-1)).not.toHaveProperty("online_meeting");
    expect(drafts.at(-1)).toMatchObject({ current_subject: "שיחה עם משפחת אברהם", current_attendee_count: 1, current_join_url: FIXTURE_MEET_URL });

    // a conference whose link is not shown (an add-on, a link off the list) is still a conference
    const gev1 = fixture.state.events.find((e) => e.id === "gev1")!;
    gev1.conferenceData = { conferenceId: "addon-42", entryPoints: [{ entryPointType: "video", uri: "https://meet.example-addon.com/42" }] };
    expect(await update("gev1")).toEqual(expect.objectContaining({ status: "already_online" }));
    expect(await update("gev1")).not.toHaveProperty("join_url");
    delete gev1.conferenceData;

    // an attendee's copy: a link would not reach the others
    gev1.organizer = { email: "boss@example.co.il" };
    expect(await update("gev1")).toMatchObject({ status: "error", error: "not_organizer" });
    gev1.organizer = { email: "dana.levi@gmail.com", self: true };

    // between the draft and the press the meeting got a Meet elsewhere: no PATCH (and no update e-mail), the link is shown
    h.ai.enqueue(ROUTER, updateCall("gev1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות"));
    Object.assign(gev1, { hangoutLink: FIXTURE_MEET_URL, conferenceData: { conferenceId: "abc-defg-hij", entryPoints: [{ entryPointType: "video", uri: FIXTURE_MEET_URL }] } });
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(eventWrites(fixture.state.calls, "PATCH")).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(`לפגישה כבר יש קישור, ולא נוסף קישור חדש.\nקישור לפגישה: ${FIXTURE_MEET_URL}`);

    // the user stopped being the organizer before the press: nothing changes
    delete gev1.hangoutLink;
    delete gev1.conferenceData;
    h.ai.enqueue(ROUTER, updateCall("gev1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות"));
    gev1.organizer = { email: "boss@example.co.il" };
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(eventWrites(fixture.state.calls, "PATCH")).toHaveLength(0);
    expect(h.wa.texts.at(-1)).toBe(copy["act.cal.online_organizer_only"]());
  });

  it("a change with a Meet that Google refuses: nothing changes; the same change without a link is offered", async () => {
    const h = makeHarness();
    const { fixture } = await googleUser(h);
    fixture.state.conferenceMode = "refuse";
    h.ai.enqueue(ROUTER, updateCall("gev1", { location: "חדר ישיבות" }), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות ותעדכני שהיא בחדר ישיבות"));
    expect(lastDraft(h).body).toBe("*שינוי פגישה*\nפגישה: פגישת צוות שבועית, יום ד׳ 21.10 ב-09:00\nמקום: חדר ישיבות\nהוספת פגישת Google Meet\nלעדכן?");
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(fixture.state.events.find((e) => e.id === "gev1")!.location).toBeUndefined();
    const offer = lastDraft(h);
    expect(offer.body).toBe("לא הצלחתי ליצור פגישת Google Meet בחשבון הזה.\n\n*שינוי פגישה*\nפגישה: פגישת צוות שבועית, יום ד׳ 21.10 ב-09:00\nמקום: חדר ישיבות\nלעדכן בלי קישור?");
    expect(offer.buttons!.map((b) => b.title)).toEqual(["עדכן בלי קישור", "ערוך", "בטל"]);
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(offer)}`, "עדכן בלי קישור"));
    const patch = eventWrites(fixture.state.calls, "PATCH").at(-1)!;
    expect(patch.body).not.toHaveProperty("conferenceData");
    expect(h.wa.texts.at(-1)).toBe("עודכן: פגישת צוות שבועית.");

    // a change that only asked for the link has nothing left to offer
    h.ai.enqueue(ROUTER, updateCall("gev1"), { text: "" });
    await processInbound(h.ctx, h.inbound("תוסיפי מיט לפגישת הצוות"));
    const drafts = h.wa.sent.filter((s) => s.kind === "buttons").length;
    await processInbound(h.ctx, h.button(`pa:approve:${idOf(lastDraft(h))}`, "עדכן"));
    expect(h.wa.sent.filter((s) => s.kind === "buttons")).toHaveLength(drafts);
    expect(h.wa.texts.at(-1)).toBe("לא הצלחתי ליצור פגישת Google Meet בחשבון הזה.\nהפגישה לא עודכנה.");
  });
});
