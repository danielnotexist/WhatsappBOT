import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy/bot";
import { safeJoinUrl } from "./online-meeting";

describe("safeJoinUrl", () => {
  it("keeps Teams, Meet and other known meeting links exactly as given", () => {
    const teams = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ODky%40thread.v2/0?context=%7b%22Tid%22%3a%22t%22%7d";
    expect(safeJoinUrl(teams)).toBe(teams);
    expect(safeJoinUrl(" https://meet.google.com/abc-defg-hij ")).toBe("https://meet.google.com/abc-defg-hij");
    expect(safeJoinUrl("https://teams.live.com/meet/9876")).toBe("https://teams.live.com/meet/9876");
    expect(safeJoinUrl("https://us02web.zoom.us/j/123?pwd=x")).toBe("https://us02web.zoom.us/j/123?pwd=x");
  });

  it("drops anything that is not one https link on a meeting service", () => {
    for (const bad of [
      null,
      42,
      "",
      "http://meet.google.com/abc",
      "https://evil.example/meet.google.com",
      "https://meet.google.com.evil.example/x",
      "https://user:pw@meet.google.com/x",
      "https://meet.google.com:8443/x",
      "https://meet.google.com/x\nקישור נוסף: https://evil.example",
      "https://meet.google.com/x https://evil.example",
      "https://meet.google.com/​x",
      "javascript:alert(1)",
      `https://meet.google.com/${"a".repeat(1100)}`,
    ]) {
      expect(safeJoinUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe("online meeting copy", () => {
  it("names the service of each calendar, short and without an em dash", () => {
    expect(copy["act.cal.online_label"]("microsoft")).toBe("פגישת Teams");
    expect(copy["act.cal.online_label"]("google")).toBe("פגישת Google Meet");
    expect(copy["act.cal.join_link"]("https://meet.google.com/abc")).toBe("קישור לפגישה: https://meet.google.com/abc");
    const texts = [
      ...["microsoft", "google"].flatMap((p) => [copy["act.cal.online_label"](p), copy["act.cal.online_unavailable"](p), copy["act.cal.online_not_done"](p, false), copy["act.cal.online_not_done"](p, true), copy["act.cal.online_missing"](p), copy["act.cal.online_added"]("פגישה", p)]),
      copy["act.cal.join_link_later"](),
      copy["act.cal.create_confirm"]({ title: "פגישה", date: "יום ה׳ 22.10", start: "10:00", end: "11:00", online: "פגישת Teams" }),
    ];
    for (const t of texts) {
      expect(t).not.toContain("—");
      expect(t.length).toBeLessThan(160);
      // every line opens with a Hebrew word (WhatsApp shows a line that opens in Latin right-to-left reversed)
      for (const line of t.split("\n").filter(Boolean)) expect(line, line).toMatch(/^[*א-ת]/);
    }
    expect(copy["act.cal.create_confirm"]({ title: "t", date: "d", start: "10:00", end: "11:00", online: "פגישת Teams" })).toContain("\nפגישת Teams\n");
    expect(copy["act.cal.create_confirm"]({ title: "t", date: "d", start: "10:00", end: "11:00", withoutLink: true }).endsWith("לקבוע בלי קישור?")).toBe(true);
  });
});
