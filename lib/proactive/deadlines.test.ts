import { describe, expect, it } from "vitest";
import { FIXTURE_MESSAGES } from "@/lib/ms/__fixtures__/graph-fixtures";
import { fixtureGmailMessages } from "@/lib/google/__fixtures__/google-fixtures";
import { zonedToUtc } from "@/lib/time/zoned";
import { extractDeadline, hasDeadlineCue } from "./deadlines";

// Tuesday 20.10.2026, 09:00 Israel
const TUE = zonedToUtc({ year: 2026, month: 10, day: 20, hour: 9, minute: 0 }, "Asia/Jerusalem");
const at = (text: string, sent: Date = TUE) => extractDeadline(text, sent)?.date ?? null;

describe("deadlines in mail", () => {
  it("reads the fixtures: 'נשמח לתשובה עד יום חמישי' (Graph body, Gmail snippet) → Thursday 22.10", () => {
    const graph = FIXTURE_MESSAGES[0]!;
    expect(extractDeadline(graph.body.content, new Date(graph.receivedDateTime))).toMatchObject({ date: { year: 2026, month: 10, day: 22 } });
    const gm1 = fixtureGmailMessages().find((m) => m.id === "gm1")!;
    expect(at(gm1.snippet, new Date(Number(gm1.internalDate)))).toEqual({ year: 2026, month: 10, day: 22 });
  });

  it("weekday words and letters: 'עד יום ה׳', 'עד ה'', 'עד חמישי', 'by Friday'", () => {
    expect(at("אפשר לשלוח עד יום ה׳?")).toEqual({ year: 2026, month: 10, day: 22 });
    expect(at("נא להחזיר עד ה' בבוקר")).toEqual({ year: 2026, month: 10, day: 22 });
    expect(at("נשמח לקבל עד ראשון")).toEqual({ year: 2026, month: 10, day: 25 });
    expect(at("Please send it by Friday")).toEqual({ year: 2026, month: 10, day: 23 });
    // the same weekday as the mail: the next one
    expect(at("עד יום שלישי")).toEqual({ year: 2026, month: 10, day: 27 });
  });

  it("dates: 'עד ה-30.10', 'עד 2/11/2026', 'deadline: 28.10', a date past New Year", () => {
    expect(at("יש להגיש את המסמכים עד ה-30.10")).toEqual({ year: 2026, month: 10, day: 30 });
    expect(at("עד 2/11/2026 לכל המאוחר")).toEqual({ year: 2026, month: 11, day: 2 });
    expect(at("Deadline: 28.10")).toEqual({ year: 2026, month: 10, day: 28 });
    const december = zonedToUtc({ year: 2026, month: 12, day: 28, hour: 9, minute: 0 }, "Asia/Jerusalem");
    expect(at("עד ה-5.1", december)).toEqual({ year: 2027, month: 1, day: 5 });
    expect(at("לא יאוחר מ-31.2")).toBeNull(); // no such day
  });

  it("relative: 'עד מחר', 'עד סוף השבוע' (Thursday), 'עד סוף החודש', 'עוד היום'", () => {
    expect(at("צריך את זה עד מחר")).toEqual({ year: 2026, month: 10, day: 21 });
    expect(at("עד סוף השבוע בבקשה")).toEqual({ year: 2026, month: 10, day: 22 });
    expect(at("נא לשלם עד סוף החודש")).toEqual({ year: 2026, month: 10, day: 31 });
    expect(at("חשוב שיגיע עוד היום")).toEqual({ year: 2026, month: 10, day: 20 });
  });

  it("no deadline word → nothing: a meeting time, a date in a signature, 'בעד'", () => {
    expect(at("נפגשים ביום חמישי ב-10:00")).toBeNull();
    expect(at("בברכה, דנה · 20.10.2026")).toBeNull();
    expect(at("אני בעד ההצעה")).toBeNull();
    expect(at("נשלח בשעה 14:00")).toBeNull();
  });

  it("a deadline word with a date the rules cannot read is a cue (the cheap model may resolve it)", () => {
    expect(hasDeadlineCue("המועד האחרון להגשה: סוף אוקטובר")).toBe(true);
    expect(hasDeadlineCue("Deadline is end of next sprint")).toBe(true);
    expect(hasDeadlineCue("תודה על הפגישה")).toBe(false);
  });
});
