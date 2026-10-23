import { describe, expect, it } from "vitest";
import { GoogleClient } from "@/lib/google/client";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GOOGLE_BASE_SCOPES } from "@/lib/google/oauth";
import { MS_SCOPES } from "@/lib/ms/oauth";
import { GOOGLE_PRO_SCOPES, KOHEN_VTT, MEET_URL, MS_PRO_SCOPES, TEAMS_URL, ZOOM_URL, il, meetEvent, teamsEvent, teamsFixture } from "./__fixtures__/meetings-harness";
import { meetTranscript, teamsTranscript } from "./find";
import { meetingFromGoogle, meetingFromGraph, platformOf, type MeetingRef } from "./meeting";

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

async function kohen() {
  const t = teamsFixture();
  t.fx.state.events.push(teamsEvent("AAMkKOHEN", "סטטוס פרויקט כהן", "2026-10-21T09:00", "2026-10-21T09:45"));
  const m = meetingFromGraph(await t.graph.getEvent("AAMkKOHEN"), "Asia/Jerusalem", ["dana@levi-law.co.il"]);
  return { t, m };
}

describe("meetings from the calendars", () => {
  it("the platform of a join link", () => {
    expect(platformOf(TEAMS_URL)).toBe("teams");
    expect(platformOf(MEET_URL)).toBe("meet");
    expect(platformOf(ZOOM_URL)).toBe("zoom");
    expect(platformOf("https://example.webex.com/meet/x")).toBe("other");
    expect(platformOf(null)).toBe("other");
  });

  it("a Teams event: times in the zone, everyone but the user (organiser included, no duplicates, lower case)", async () => {
    const { m } = await kohen();
    expect(m).toMatchObject({ provider: "microsoft", eventId: "AAMkKOHEN", title: "סטטוס פרויקט כהן", platform: "teams", joinUrl: TEAMS_URL, isOrganizer: true, startMs: il(21, 9).getTime(), endMs: il(21, 9, 45).getTime() });
    expect(m.attendees).toEqual([
      { name: "יוסי כהן", email: "yossi@kohen.co.il" },
      { name: "רונית לוי", email: "ronit@levi-law.co.il" },
    ]);
  });
});

describe("Teams: the transcript through Graph online meetings", () => {
  it("join link → the meeting → this occurrence's transcript → VTT → compact text", async () => {
    const { t, m } = await kohen();
    t.state.meetings.push({
      id: "MSo1",
      joinUrl: TEAMS_URL,
      transcripts: [
        // a recurring meeting keeps last week's transcript under the same meeting: never mixed in
        { id: "old", createdDateTime: "2026-10-14T06:01:00Z", vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v X>שבוע שעבר</v>" },
        { id: "tr1", createdDateTime: "2026-10-21T06:00:30Z", vtt: KOHEN_VTT },
      ],
    });
    const out = await teamsTranscript(t.graph, m, { scopes: MS_PRO_SCOPES, now: il(21, 9, 55) });
    expect(out.status).toBe("found");
    expect(out.status === "found" && out.text).toContain("יוסי כהן: מסכים. מגישים את הטיוטה עד 28.10.");
    expect(out.status === "found" && out.text).not.toContain("שבוע שעבר");
    expect(t.state.calls[0]!.startsWith("/me/onlineMeetings?")).toBe(true);
    expect(new URLSearchParams(t.state.calls[0]!.split("?")[1]).get("$filter")).toBe(`JoinWebUrl eq '${TEAMS_URL}'`);
    expect(t.state.calls.at(-1)).toBe("/me/onlineMeetings/MSo1/transcripts/tr1/content?$format=text/vtt");
  });

  it("no transcript yet: not_ready for 2 hours after the end, then none (transcription was not on)", async () => {
    const { t, m } = await kohen();
    t.state.meetings.push({ id: "MSo1", joinUrl: TEAMS_URL, transcripts: [] });
    expect(await teamsTranscript(t.graph, m, { scopes: MS_PRO_SCOPES, now: il(21, 9, 55) })).toEqual({ status: "not_ready" });
    expect(await teamsTranscript(t.graph, m, { scopes: MS_PRO_SCOPES, now: il(21, 12) })).toEqual({ status: "none" });
  });

  it("without the transcript pair in the grant: consent, and Graph is not called", async () => {
    const { t, m } = await kohen();
    expect(await teamsTranscript(t.graph, m, { scopes: [...MS_SCOPES], now: il(21, 9, 55) })).toEqual({ status: "consent", provider: "microsoft" });
    expect(await teamsTranscript(t.graph, m, { scopes: [], now: il(21, 9, 55) })).toEqual({ status: "consent", provider: "microsoft" });
    expect(t.state.calls).toEqual([]);
  });

  it("403 (tenant policy, not the organiser) or no meeting behind the link: no_access", async () => {
    const { t, m } = await kohen();
    expect(await teamsTranscript(t.graph, m, { scopes: MS_PRO_SCOPES, now: il(21, 9, 55) })).toEqual({ status: "no_access" });
    t.state.meetings.push({ id: "MSo1", joinUrl: TEAMS_URL, transcripts: [] });
    t.state.denied = true;
    expect(await teamsTranscript(t.graph, m, { scopes: MS_PRO_SCOPES, now: il(21, 9, 55) })).toEqual({ status: "no_access" });
  });

  it("a Zoom link is not read here", async () => {
    const { t, m } = await kohen();
    expect(await teamsTranscript(t.graph, { ...m, platform: "zoom", joinUrl: ZOOM_URL }, { scopes: MS_PRO_SCOPES, now: il(21, 10) })).toEqual({ status: "unsupported" });
  });
});

describe("Google Meet: the transcript Doc in Drive", () => {
  const TRANSCRIPT = "שיחה עם אברהם - תמליל\n00:00:00\nדנה לוי: שלום יוסי.\nיוסי אברהם: שלום, ההצעה מוכנה.\n";

  async function meet(more: Record<string, unknown> = {}) {
    const gfx = createGoogleFixture();
    gfx.state.events.push(meetEvent("gmeet1", "שיחה עם אברהם", "2026-10-21T13:00", "2026-10-21T13:30", more));
    const google = new GoogleClient({ getAccessToken: async () => "ya29", fetchImpl: gfx.fetchImpl });
    const m: MeetingRef = meetingFromGoogle(await google.getEvent("gmeet1", "Asia/Jerusalem"), ["dana.levi@gmail.com"]);
    return { gfx, google, m };
  }

  it("the event's attachment (Meet attaches the transcript to the organiser's event) → export as text", async () => {
    const { gfx, google, m } = await meet({ attachments: [{ fileId: "gtr1", title: "שיחה עם אברהם (2026-10-21 13:00 GMT+3) - תמליל", mimeType: "application/vnd.google-apps.document", fileUrl: "https://docs.google.com/document/d/gtr1/edit" }] });
    expect(m).toMatchObject({ platform: "meet", conferenceId: "kfz-abcd-xyz", attendees: [{ name: "יוסי אברהם", email: "avraham@example.co.il" }] });
    gfx.state.files.push({ kind: "drive#file", id: "gtr1", name: "שיחה עם אברהם (2026-10-21 13:00 GMT+3) - תמליל", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-21T10:40:00.000Z", webViewLink: "https://docs.google.com/document/d/gtr1/edit", content: utf8(TRANSCRIPT) });
    const out = await meetTranscript(google, m, { scopes: GOOGLE_PRO_SCOPES, now: il(21, 13, 40) });
    expect(out).toEqual({ status: "found", source: "meet_doc", text: "שיחה עם אברהם - תמליל\nדנה לוי: שלום יוסי.\nיוסי אברהם: שלום, ההצעה מוכנה." });
  });

  it("no attachment: a Drive search for the transcript Doc named after the meeting, changed after it began", async () => {
    const { gfx, google, m } = await meet();
    gfx.state.files.push(
      { kind: "drive#file", id: "gother", name: "פגישת צוות (2026-10-21 09:00 GMT+3) - Transcript", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-21T10:41:00.000Z", webViewLink: "x", content: utf8("x: אחר") },
      { kind: "drive#file", id: "gtr2", name: "שיחה עם אברהם (2026-10-21 13:00 GMT+3) - Transcript", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-21T10:40:00.000Z", webViewLink: "x", content: utf8(TRANSCRIPT) },
    );
    const out = await meetTranscript(google, m, { scopes: GOOGLE_PRO_SCOPES, now: il(21, 13, 40) });
    expect(out.status === "found" && out.text).toContain("יוסי אברהם: שלום, ההצעה מוכנה.");
    const search = gfx.state.calls.find((c) => c.url.includes("/drive/v3/files?"))!;
    const q = new URL(search.url).searchParams.get("q")!;
    expect(q).toContain("mimeType = 'application/vnd.google-apps.document'");
    expect(q).toContain("modifiedTime > '2026-10-21T09:50:00.000Z'");
  });

  it("nothing yet: not_ready, later none; without drive.readonly: consent (no Drive call)", async () => {
    const { gfx, google, m } = await meet();
    expect(await meetTranscript(google, m, { scopes: GOOGLE_PRO_SCOPES, now: il(21, 13, 40) })).toEqual({ status: "not_ready" });
    expect(await meetTranscript(google, m, { scopes: GOOGLE_PRO_SCOPES, now: il(21, 16) })).toEqual({ status: "none" });
    const before = gfx.state.calls.length;
    expect(await meetTranscript(google, m, { scopes: [...GOOGLE_BASE_SCOPES], now: il(21, 13, 40) })).toEqual({ status: "consent", provider: "google" });
    expect(gfx.state.calls.length).toBe(before);
  });

  it("the token lacks the scope after all (unticked): consent", async () => {
    const { gfx, google, m } = await meet();
    gfx.state.denied.add("drive");
    expect(await meetTranscript(google, m, { scopes: GOOGLE_PRO_SCOPES, now: il(21, 13, 40) })).toEqual({ status: "consent", provider: "google" });
  });
});
