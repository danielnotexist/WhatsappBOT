import { describe, expect, it } from "vitest";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GoogleClient } from "@/lib/google/client";
import { createGraphFixture, fixtureGraphMessage } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient } from "@/lib/ms/graph";
import { zonedToUtc } from "@/lib/time/zoned";
import { clockOf, externalAttendees, findBackToBack, findConflicts, fromGoogleEvent, fromGraphEvent, pairKey, type CalEvent } from "./calendar";
import { explicitUrgency, fromGraphMessage, isAutomatedMail, waitingBusinessDays } from "./mail";

const il = (d: number, h: number, mi = 0) => zonedToUtc({ year: 2026, month: 10, day: d, hour: h, minute: mi }, "Asia/Jerusalem");
const DAY = [il(21, 0), il(22, 0)] as const;

/** Wednesday 21.10.2026 in both fixture calendars. */
async function fixtureDay(): Promise<CalEvent[]> {
  const graph = new GraphClient({ getAccessToken: async () => "t", fetchImpl: createGraphFixture().fetchImpl });
  const google = new GoogleClient({ getAccessToken: async () => "ya29", fetchImpl: createGoogleFixture().fetchImpl });
  const ms = (await graph.calendarView(DAY[0], DAY[1], "Asia/Jerusalem")).map((e) => fromGraphEvent(e, "Asia/Jerusalem"));
  const g = (await google.listEvents({ timeMin: DAY[0], timeMax: DAY[1], timeZone: "Asia/Jerusalem", maxResults: 50 })).map(fromGoogleEvent);
  return [...ms, ...g];
}

const ev = (id: string, start: Date, end: Date, more: Partial<CalEvent> = {}): CalEvent => ({ provider: "microsoft", id, title: id, startMs: start.getTime(), endMs: end.getTime(), allDay: false, location: "", online: false, attendees: [], free: false, ...more });

describe("calendar checks", () => {
  it("fixtures: the court hearing (Microsoft 09:00–10:30) clashes with the team meeting (Google 09:00–10:00); the all-day birthday does not", async () => {
    const events = await fixtureDay();
    const conflicts = findConflicts(events);
    expect(conflicts).toHaveLength(1);
    expect([conflicts[0]!.a.title, conflicts[0]!.b.title].sort()).toEqual(["דיון בבית משפט השלום ת״א", "פגישת צוות שבועית"]);
    expect(clockOf(conflicts[0]!.a.startMs)).toBe("09:00");
    expect(pairKey("conflict", conflicts[0]!)).toBe("conflict:google:gev1|microsoft:AAMkAGe1");
    expect(pairKey("conflict", { a: conflicts[0]!.b, b: conflicts[0]!.a })).toBe(pairKey("conflict", conflicts[0]!)); // order-free
  });

  it("the same meeting in both calendars is not a clash; a 'free' event never clashes", () => {
    const a = ev("a", il(21, 10), il(21, 11), { title: "ישיבה" });
    const b = ev("b", il(21, 10), il(21, 11), { title: "ישיבה", provider: "google" });
    const free = ev("f", il(21, 10, 30), il(21, 12), { free: true });
    expect(findConflicts([a, b, free])).toEqual([]);
    expect(findConflicts([a, ev("c", il(21, 10, 59), il(21, 12))])).toHaveLength(1);
    expect(findConflicts([a, ev("d", il(21, 11), il(21, 12))])).toEqual([]); // touching is not overlapping
  });

  it("back-to-back in two physical places (not online, not the same place)", () => {
    const court = ev("court", il(21, 9), il(21, 10), { location: "בית משפט השלום, ויצמן 1" });
    const office = ev("office", il(21, 10, 5), il(21, 11), { location: "המשרד, הרצל 5" });
    const online = ev("teams", il(21, 10), il(21, 11), { location: "Microsoft Teams", online: true });
    expect(findBackToBack([court, office]).map((p) => [p.a.id, p.b.id])).toEqual([["court", "office"]]);
    expect(findBackToBack([court, online])).toEqual([]);
    expect(findBackToBack([court, ev("later", il(21, 10, 30), il(21, 11), { location: "המשרד" })])).toEqual([]); // 30 minutes is enough
    expect(findBackToBack([court, ev("same", il(21, 10), il(21, 11), { location: "בית משפט השלום, ויצמן 1" })])).toEqual([]);
  });

  it("external attendees: another domain, or anyone else with a free-mail account; never the user or a room", async () => {
    const events = await fixtureDay();
    const barak = events.find((e) => e.id === "AAMkAGe2")!;
    expect(externalAttendees(barak, ["dana@levi-law.co.il"]).map((a) => a.address)).toEqual(["barak@cpa-barak.co.il"]);
    expect(externalAttendees({ ...barak, attendees: [{ name: "נועה", address: "noa@levi-law.co.il" }] }, ["dana@levi-law.co.il"])).toEqual([]);
    const avraham = events.find((e) => e.id === "gev2")!;
    expect(externalAttendees(avraham, ["dana.levi@gmail.com"]).map((a) => a.address)).toEqual(["avraham@example.co.il"]);
    expect(externalAttendees({ ...avraham, attendees: [{ name: "Room 3", address: "room3@resource.calendar.google.com" }] }, ["dana.levi@gmail.com"])).toEqual([]);
  });
});

describe("mail signals", () => {
  it("bulk headers from Graph (List-Unsubscribe / Auto-Submitted / Precedence) mark a mailing; a person's mail is not", async () => {
    const fx = createGraphFixture();
    fx.state.messages.push(
      fixtureGraphMessage({ id: "news", from: { name: "עדכונים", address: "hello@shop.example" }, subject: "השבוע אצלנו", receivedDateTime: "2026-10-20T08:00:00Z", internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<mailto:u@shop.example>" }] }),
      fixtureGraphMessage({ id: "auto", from: { name: "מערכת", address: "system@vendor.example" }, subject: "אישור הזמנה", receivedDateTime: "2026-10-20T08:00:00Z", internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-generated" }] }),
      fixtureGraphMessage({ id: "bulk", from: { name: "רשימה", address: "list@club.example" }, subject: "מפגש", receivedDateTime: "2026-10-20T08:00:00Z", internetMessageHeaders: [{ name: "Precedence", value: "bulk" }] }),
    );
    const graph = new GraphClient({ getAccessToken: async () => "t", fetchImpl: fx.fetchImpl });
    const inbox = (await graph.listInbox({ top: 50, withHeaders: true })).map(fromGraphMessage);
    expect(inbox.filter(isAutomatedMail).map((m) => m.id).sort()).toEqual(["auto", "bulk", "news"]);
    expect(new URL(fx.state.calls.at(-1)!.url).searchParams.get("$select")).toContain("internetMessageHeaders");
    // no-reply senders and newsletter subjects, also without headers
    expect(isAutomatedMail({ from: { name: "", address: "no-reply@bank.example" }, subject: "x", bulkHeaders: false })).toBe(true);
    expect(isAutomatedMail({ from: { name: "", address: "ronit@bar-consult.co.il" }, subject: "ניוזלטר אוקטובר", bulkHeaders: false })).toBe(true);
    expect(isAutomatedMail({ from: { name: "", address: "ronit@bar-consult.co.il" }, subject: "פרוטוקול", bulkHeaders: false })).toBe(false);
  });

  it("explicit urgency: 'דחוף', 'בהול', 'ASAP' in the subject or the first lines; not 'דחיפה'", () => {
    const m = (subject: string, text = "") => ({ subject, text, importance: null });
    expect(explicitUrgency(m("דחוף - חתימה על ההסכם"))).toBe(true);
    expect(explicitUrgency(m("שאלה", "זה בהול, אפשר היום?"))).toBe(true);
    expect(explicitUrgency(m("Contract ASAP"))).toBe(true);
    expect(explicitUrgency(m("דחיפה לפרויקט"))).toBe(false);
    expect(explicitUrgency(m("הצעת מחיר"))).toBe(false);
  });

  it("business days waited", () => {
    const now = il(21, 7, 30); // Wednesday
    expect(waitingBusinessDays({ receivedDateTime: il(18, 10).toISOString() }, now)).toBe(2); // Sunday
    expect(waitingBusinessDays({ receivedDateTime: il(20, 10).toISOString() }, now)).toBe(0);
  });
});
