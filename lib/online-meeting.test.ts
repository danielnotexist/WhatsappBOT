import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/brand";
import { copy } from "@/lib/copy/bot";
import { MSA_CONSUMER_TENANT, isPersonalMicrosoftAccount, safeJoinUrl } from "./online-meeting";

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

describe("isPersonalMicrosoftAccount", () => {
  it("knows a personal account by the consumer tenant or an outlook / hotmail / live address, and nothing else", () => {
    expect(isPersonalMicrosoftAccount({ tenant_id: MSA_CONSUMER_TENANT, account_email: "dana@levi-law.co.il" })).toBe(true);
    for (const email of ["dana.levi@outlook.com", "Dana@Hotmail.co.il", "dana@live.com", "dana@msn.com"]) expect(isPersonalMicrosoftAccount({ tenant_id: null, account_email: email }), email).toBe(true);
    // a work account without Teams is not "personal": its reason is unknown
    expect(isPersonalMicrosoftAccount({ tenant_id: "3f1a-work-tenant", account_email: "dana@levi-law.co.il" })).toBe(false);
    expect(isPersonalMicrosoftAccount({ tenant_id: null, account_email: "dana@outlook-consulting.co.il" })).toBe(false);
    expect(isPersonalMicrosoftAccount(null)).toBe(false);
  });
});

describe("online meeting copy", () => {
  it("names the service of each calendar, short and without an em dash", () => {
    expect(copy["act.cal.online_label"]("microsoft")).toBe("פגישת Teams");
    expect(copy["act.cal.online_label"]("google")).toBe("פגישת Google Meet");
    expect(copy["act.cal.online_label"]("google", true)).toBe("פגישת Google Meet (הקישור יישלח בהזמנה)");
    expect(copy["act.cal.add_online"]("microsoft")).toBe("הוספת פגישת Teams");
    expect(copy["act.cal.add_online"]("google")).toBe("הוספת פגישת Google Meet");
    expect(copy["act.cal.join_link"]("https://meet.google.com/abc")).toBe("קישור לפגישה: https://meet.google.com/abc");
    // the work / school explanation only where it is known to be the reason
    expect(copy["act.cal.online_unavailable"]("microsoft")).toBe("בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams.");
    expect(copy["act.cal.online_unavailable"]("microsoft", true)).toBe("בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams (היא זמינה רק בחשבון עבודה או בית ספר).");
    expect(copy["act.cal.online_not_done"]("google", { isUpdate: false, askMain: true })).toBe(`לא הצלחתי ליצור פגישת Google Meet בחשבון הזה.\nהפגישה לא נקבעה. אפשר לבקש מ-״@${PRODUCT_NAME}״ לקבוע אותה בלי קישור.`);
    expect(copy["act.cal.online_added"]("פגישת צוות", "google")).toBe("נוסף קישור Google Meet לפגישה ״פגישת צוות״.");
    const texts = [
      ...["microsoft", "google"].flatMap((p) => [
        copy["act.cal.online_label"](p, true),
        copy["act.cal.add_online"](p),
        copy["act.cal.online_unavailable"](p, true),
        ...[false, true].flatMap((isUpdate) => [false, true].map((askMain) => copy["act.cal.online_not_done"](p, { isUpdate, askMain, somethingLeft: true, personal: true }))),
        copy["act.cal.online_not_done"](p, { isUpdate: true }),
        copy["act.cal.online_missing"](p, true),
        copy["act.cal.online_missing"](p),
        copy["act.cal.online_added"]("פגישה", p),
      ]),
      copy["act.cal.join_link_later"](),
      copy["act.cal.online_exists"](null),
      copy["act.cal.online_exists"]("https://meet.google.com/abc"),
      copy["act.cal.online_organizer_only"](),
      copy["act.cal.update_target"]("פגישה", "יום ה׳ 22.10", "10:00"),
      copy["act.cal.attendees_notified"](true),
      copy["act.cal.updated"]("פגישה"),
      copy["act.cal.create_confirm"]({ title: "פגישה", date: "יום ה׳ 22.10", start: "10:00", end: "11:00", attendees: "a@b.co", online: copy["act.cal.online_label"]("microsoft", true) }),
    ];
    for (const t of texts) {
      expect(t).not.toContain("—");
      expect(t.length).toBeLessThan(160);
      // every line opens with a Hebrew word (WhatsApp shows a line that opens in Latin right-to-left reversed)
      for (const line of t.split("\n").filter(Boolean)) expect(line, line).toMatch(/^[*א-ת]/);
      // titles in the assistant's own words are quoted with gershayim, not straight quotes
      expect(t).not.toContain('"');
    }
    expect(copy["act.cal.create_confirm"]({ title: "t", date: "d", start: "10:00", end: "11:00", attendees: "a@b.co", online: "פגישת Teams" })).toContain("\nמשתתפים: a@b.co\nפגישת Teams\n");
    expect(copy["act.cal.create_confirm"]({ title: "t", date: "d", start: "10:00", end: "11:00", withoutLink: true }).endsWith("לקבוע בלי קישור?")).toBe(true);
  });
});
