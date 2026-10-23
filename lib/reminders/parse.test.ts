import { describe, expect, it } from "vitest";
import { formatWhenAbs, zonedParts, zonedToUtc } from "@/lib/time/zoned";
import { describeRecurrence, nextOccurrence } from "./recurrence";
import { hebrewNumber, parseHebrewWhen } from "./parse";

const TZ = "Asia/Jerusalem";

/** "2026-10-21 10:15" (Israel wall clock) → instant */
function il(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)!;
  return zonedToUtc({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! }, TZ);
}

function local(d: Date): string {
  const p = zonedParts(d, TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Wednesday 21.10.2026, 10:15 — four days before the 2026 switch to winter time (Sun 25.10, 02:00 → 01:00). */
const WED = "2026-10-21 10:15";

type OnceCase = [input: string, now: string, expectedLocal: string, extra?: { utc?: string; past?: boolean; rest?: string; hasTime?: boolean }];

const ONCE: OnceCase[] = [
  // ---- the examples from the brief ----
  ["מחר ב-9", WED, "2026-10-22 09:00"],
  ["עוד שעתיים", WED, "2026-10-21 12:15"],
  ["ביום ראשון הבא ב-8:30", WED, "2026-10-25 08:30", { utc: "2026-10-25T06:30:00.000Z" }], // first day of winter time (+02:00)
  ["בעוד רבע שעה", WED, "2026-10-21 10:30"],
  ["ב-14:00", WED, "2026-10-21 14:00"],
  // ---- relative ----
  ["עוד חצי שעה", WED, "2026-10-21 10:45"],
  ["בעוד 10 דקות", WED, "2026-10-21 10:25"],
  ["עוד שעה וחצי", WED, "2026-10-21 11:45"],
  ["בעוד 3 שעות", WED, "2026-10-21 13:15"],
  ["בעוד שלוש שעות", WED, "2026-10-21 13:15"],
  ["עוד דקה", WED, "2026-10-21 10:16"],
  ["עוד עשרים וחמש דקות", WED, "2026-10-21 10:40"],
  ["בעוד שלושת רבעי שעה", WED, "2026-10-21 11:00"],
  ["בעוד כשעה", WED, "2026-10-21 11:15"],
  ["בעוד יומיים", WED, "2026-10-23 10:15"],
  ["בעוד שבוע", WED, "2026-10-28 10:15", { utc: "2026-10-28T08:15:00.000Z" }], // wall clock kept across the DST switch
  ["בעוד יומיים ב-10", WED, "2026-10-23 10:00"],
  ["בעוד חודש", WED, "2026-11-21 10:15"],
  // ---- time only ----
  ["ב-14:00", "2026-10-21 15:00", "2026-10-22 14:00"],
  ["ב-9", WED, "2026-10-21 21:00"], // 09:00 passed → this evening
  ["בשמונה", WED, "2026-10-21 20:00"],
  ["בשמונה", "2026-10-21 21:00", "2026-10-22 08:00"],
  ["ב-5", WED, "2026-10-21 17:00"],
  ["ב 5 אחה״צ", WED, "2026-10-21 17:00"],
  ["בשעה 14:30", WED, "2026-10-21 14:30"],
  ["בשעה 09:00", WED, "2026-10-22 09:00"], // zero-padded = exact
  ["ב-11 בלילה", WED, "2026-10-21 23:00"],
  ["ברבע לתשע", WED, "2026-10-21 20:45"],
  ["בתשע ורבע בבוקר", WED, "2026-10-22 09:15"],
  ["בשמונה וחצי בבוקר", WED, "2026-10-22 08:30"],
  ["ב-10.30", WED, "2026-10-21 10:30"],
  ["הערב", WED, "2026-10-21 20:00"],
  ["הערב ב-8", WED, "2026-10-21 20:00"],
  ["בערב", WED, "2026-10-21 20:00"],
  ["בבוקר", WED, "2026-10-22 09:00"],
  // ---- named days ----
  ["היום ב-9", WED, "2026-10-21 21:00"],
  ["מחר בבוקר", WED, "2026-10-22 09:00"],
  ["מחר בערב", WED, "2026-10-22 20:00"],
  ["מחר ב-12 בצהריים", WED, "2026-10-22 12:00"],
  ["מחר ברבע לתשע", WED, "2026-10-22 08:45"],
  ["מחרתיים ב-7 בערב", WED, "2026-10-23 19:00"],
  ["מחר", WED, "2026-10-22 09:00", { hasTime: false }],
  ["ביום ה' ב-16:30", WED, "2026-10-22 16:30"],
  ["ביום ו׳ ב-9", WED, "2026-10-23 09:00"],
  ["ביום שישי ב-10", WED, "2026-10-23 10:00"],
  ["בשבת בערב", WED, "2026-10-24 20:00"],
  ["ביום רביעי ב-11", WED, "2026-10-21 11:00"], // today's weekday, still ahead
  ["ביום רביעי ב-9", WED, "2026-10-28 09:00"], // today's weekday, passed → next week
  ["ביום רביעי הבא ב-11", WED, "2026-10-28 11:00"],
  ["בחמישי ב-10", WED, "2026-10-22 10:00"],
  ["בשבוע הבא", WED, "2026-10-25 09:00"],
  ["בשבוע הבא ביום שלישי ב-10", WED, "2026-10-27 10:00"],
  // ---- dates ----
  ["ב-22.10 ב-15:00", WED, "2026-10-22 15:00"],
  ["ב-5 בנובמבר", WED, "2026-11-05 09:00"],
  ["ב-1.1 בשעה 10", WED, "2027-01-01 10:00"], // passed this year → next year
  ["ב-3/12/2026 ב-8 בבוקר", WED, "2026-12-03 08:00"],
  ["2026-10-30T14:00", WED, "2026-10-30 14:00"],
  // ---- around midnight ----
  ["בעוד שעתיים", "2026-10-21 23:30", "2026-10-22 01:30"],
  ["בעוד רבע שעה", "2026-10-21 23:50", "2026-10-22 00:05"],
  ["מחר ב-9", "2026-10-22 00:30", "2026-10-22 09:00"], // after midnight "מחר" = the coming morning
  ["מחר בשעה תשע", "2026-10-23 03:43", "2026-10-23 09:00"], // Daniel's voice note at 03:43
  ["מחר ב-9", "2026-10-22 04:59", "2026-10-22 09:00"],
  ["מחר ב-9", "2026-10-22 05:00", "2026-10-23 09:00"],
  ["בחצות", "2026-10-21 21:00", "2026-10-22 00:00"],
  ["ב-2 בלילה", "2026-10-21 22:00", "2026-10-22 02:00"],
  ["היום ב-8", "2026-10-21 21:00", "2026-10-21 20:00", { past: true }],
  // ---- Friday / Saturday ----
  ["בשבת", "2026-10-24 10:00", "2026-10-31 09:00"], // Saturday 10:00, default 9:00 passed → next Saturday
  ["ביום שישי", "2026-10-22 23:30", "2026-10-23 09:00"],
  ["ביום ראשון", "2026-10-24 23:00", "2026-10-25 09:00"],
  ["מחר ב-9", "2026-10-24 23:59", "2026-10-25 09:00", { utc: "2026-10-25T07:00:00.000Z" }],
  // ---- DST 2026 ----
  ["עוד שעה", "2026-10-25 01:30", "2026-10-25 01:30", { utc: "2026-10-24T23:30:00.000Z" }], // 01:30 IDT + 1h = 01:30 IST
  ["ב-01:30", "2026-10-25 00:30", "2026-10-25 01:30", { utc: "2026-10-24T22:30:00.000Z" }], // repeated hour → first occurrence
  ["ב-1:30", "2026-10-25 00:30", "2026-10-25 13:30"], // a bare 1–5 is the afternoon
  ["מחר ב-9", "2026-03-26 12:00", "2026-03-27 09:00", { utc: "2026-03-27T06:00:00.000Z" }], // first summer-time day (+03:00)
  ["ב-2:30 בלילה", "2026-03-27 00:30", "2026-03-27 03:30", { utc: "2026-03-27T00:30:00.000Z" }], // 02:30 does not exist
  ["בעוד שעתיים", "2026-03-27 01:30", "2026-03-27 04:30", { utc: "2026-03-27T01:30:00.000Z" }],
  // ---- DST 2027 ----
  ["ביום ראשון ב-8", "2027-10-29 12:00", "2027-10-31 08:00", { utc: "2027-10-31T06:00:00.000Z" }],
  ["מחר ב-8", "2027-03-25 12:00", "2027-03-26 08:00", { utc: "2027-03-26T05:00:00.000Z" }],
  ["בעוד יום", "2027-03-25 12:00", "2027-03-26 12:00", { utc: "2027-03-26T09:00:00.000Z" }],
  // ---- reminder text extraction ----
  ["תזכיר לי מחר ב-9 להתקשר לבנק", WED, "2026-10-22 09:00", { rest: "להתקשר לבנק" }],
  ["תזכיר לי להכין ארוחת ערב מחר", WED, "2026-10-22 09:00", { rest: "להכין ארוחת ערב" }],
  ["תזכירי לי בעוד רבע שעה: לצאת לפגישה", WED, "2026-10-21 10:30", { rest: "לצאת לפגישה" }],
];

describe("parseHebrewWhen — one-off", () => {
  it.each(ONCE)("%s  (now %s) → %s", (input, now, expected, extra = {}) => {
    const r = parseHebrewWhen(input, { now: il(now), timeZone: TZ });
    expect(r, input).not.toBeNull();
    expect(r!.kind).toBe("once");
    if (r!.kind !== "once") return;
    expect(local(r!.at)).toBe(expected);
    if (extra.utc) expect(r!.at.toISOString()).toBe(extra.utc);
    expect(r!.inPast).toBe(extra.past ?? false);
    if (extra.rest !== undefined) expect(r!.rest).toBe(extra.rest);
    if (extra.hasTime !== undefined) expect(r!.hasTime).toBe(extra.hasTime);
  });
});

type RecurringCase = [input: string, now: string, rule: Record<string, unknown>, firstLocal: string];

const RECURRING: RecurringCase[] = [
  ["כל יום בשמונה", WED, { freq: "daily", hour: 8, minute: 0 }, "2026-10-22 08:00"],
  ["כל יום ב-8:30", "2026-10-21 07:00", { freq: "daily", hour: 8, minute: 30 }, "2026-10-21 08:30"],
  ["כל בוקר", WED, { freq: "daily", hour: 9, minute: 0 }, "2026-10-22 09:00"],
  ["כל ערב ב-9", WED, { freq: "daily", hour: 21, minute: 0 }, "2026-10-21 21:00"],
  ["כל יום ראשון ב-9", WED, { freq: "weekly", hour: 9, minute: 0, weekdays: [0] }, "2026-10-25 09:00"],
  ["כל יום שני וחמישי ב-10", WED, { freq: "weekly", hour: 10, minute: 0, weekdays: [1, 4] }, "2026-10-22 10:00"],
  ["כל שבת בערב", WED, { freq: "weekly", hour: 20, minute: 0, weekdays: [6] }, "2026-10-24 20:00"],
  ["כל יום חול ב-7:30", WED, { freq: "weekly", hour: 7, minute: 30, weekdays: [0, 1, 2, 3, 4] }, "2026-10-22 07:30"],
  ["בימים א׳–ה׳ ב-8", WED, { freq: "weekly", hour: 8, minute: 0, weekdays: [0, 1, 2, 3, 4] }, "2026-10-22 08:00"],
  ["כל שבוע ביום שלישי ב-11", WED, { freq: "weekly", hour: 11, minute: 0, weekdays: [2] }, "2026-10-27 11:00"],
  ["כל חודש ב-1 ב-9", WED, { freq: "monthly", hour: 9, minute: 0, monthDay: 1 }, "2026-11-01 09:00"],
  ["כל 31 לחודש בשעה 10", WED, { freq: "monthly", hour: 10, minute: 0, monthDay: 31 }, "2026-10-31 10:00"],
];

describe("parseHebrewWhen — recurring", () => {
  it.each(RECURRING)("%s → %o first %s", (input, now, rule, first) => {
    const r = parseHebrewWhen(input, { now: il(now), timeZone: TZ });
    expect(r?.kind, input).toBe("recurring");
    if (r?.kind !== "recurring") return;
    expect(r.rule).toEqual(rule);
    expect(local(r.first)).toBe(first);
  });

  it("keeps 08:00 on the wall clock across the 2026 winter switch", () => {
    const rule = { freq: "daily" as const, hour: 8, minute: 0 };
    const sat = nextOccurrence(rule, il("2026-10-23 10:00"), TZ);
    const sun = nextOccurrence(rule, sat, TZ);
    const mon = nextOccurrence(rule, sun, TZ);
    expect([sat, sun, mon].map((d) => d.toISOString())).toEqual(["2026-10-24T05:00:00.000Z", "2026-10-25T06:00:00.000Z", "2026-10-26T06:00:00.000Z"]);
    expect(sun.getTime() - sat.getTime()).toBe(25 * 3_600_000);
  });

  it("keeps 07:30 across the 2027 summer switch and skips Friday/Saturday on workdays", () => {
    const rule = { freq: "weekly" as const, hour: 7, minute: 30, weekdays: [0, 1, 2, 3, 4] };
    const thu = nextOccurrence(rule, il("2027-03-24 08:00"), TZ);
    const sun = nextOccurrence(rule, thu, TZ);
    expect(local(thu)).toBe("2027-03-25 07:30");
    expect(thu.toISOString()).toBe("2027-03-25T05:30:00.000Z");
    expect(local(sun)).toBe("2027-03-28 07:30");
    expect(sun.toISOString()).toBe("2027-03-28T04:30:00.000Z");
  });

  it("clamps a monthly day to short months", () => {
    const rule = { freq: "monthly" as const, hour: 10, minute: 0, monthDay: 31 };
    const oct = nextOccurrence(rule, il("2026-10-21 10:00"), TZ);
    const nov = nextOccurrence(rule, oct, TZ);
    expect(local(nov)).toBe("2026-11-30 10:00");
  });

  it("describes rules in Hebrew", () => {
    expect(describeRecurrence({ freq: "daily", hour: 8, minute: 0 })).toBe("כל יום, 8:00");
    expect(describeRecurrence({ freq: "weekly", hour: 7, minute: 30, weekdays: [0, 1, 2, 3, 4] })).toBe("בימים א׳–ה׳, 7:30");
    expect(describeRecurrence({ freq: "weekly", hour: 9, minute: 0, weekdays: [0] })).toBe("כל יום א׳, 9:00");
    expect(describeRecurrence({ freq: "weekly", hour: 10, minute: 0, weekdays: [4, 1] })).toBe("בימים ב׳ ו-ה׳, 10:00");
    expect(describeRecurrence({ freq: "monthly", hour: 9, minute: 5, monthDay: 1 })).toBe("כל חודש ב-1, 9:05");
  });
});

describe("parseHebrewWhen — no time / not a time", () => {
  it.each([
    "תזכיר לי להתקשר לבנק",
    "היום", // a day without any time → ask
    "לשלם 3 תשלומים", // a quantity, not "at 3"
    "",
  ])("%s → null", (input) => {
    expect(parseHebrewWhen(input, { now: il(WED), timeZone: TZ })).toBeNull();
  });

  it("'מחר' in the small hours: the coming morning, with the next date kept as the other reading", () => {
    const r = parseHebrewWhen("תזכירי אותי מחר בשעה תשע על לאכול", { now: il("2026-10-23 03:43"), timeZone: TZ });
    expect(r?.kind).toBe("once");
    if (r?.kind !== "once") return;
    expect(local(r.at)).toBe("2026-10-23 09:00");
    expect(local(r.nextDay!)).toBe("2026-10-24 09:00");
    expect(r.rest).toBe("לאכול");
    // during the day, or when the coming morning already passed (an exact time before now), there is one reading only
    expect(parseHebrewWhen("מחר ב-9", { now: il("2026-10-23 10:00"), timeZone: TZ })).not.toHaveProperty("nextDay");
    const early = parseHebrewWhen("מחר ב-02:00", { now: il("2026-10-23 03:43"), timeZone: TZ });
    expect(early?.kind === "once" && local(early.at)).toBe("2026-10-24 02:00");
    expect(early).not.toHaveProperty("nextDay");
  });

  it("does not take a quantity for an hour", () => {
    const r = parseHebrewWhen("מחר להעביר ב-3 תשלומים", { now: il(WED), timeZone: TZ });
    expect(r?.kind === "once" && local(r.at)).toBe("2026-10-22 09:00");
  });
});

describe("helpers", () => {
  it("reads Hebrew numbers", () => {
    expect(["שלוש", "חמש עשרה", "עשרים וחמש", "שתים עשרה", "12", "חצי"].map(hebrewNumber)).toEqual([3, 15, 25, 12, 12, 30]);
  });

  it("echoes an absolute time", () => {
    const now = il(WED);
    expect(formatWhenAbs(il("2026-10-21 18:00"), now, TZ)).toBe("היום, 18:00");
    expect(formatWhenAbs(il("2026-10-22 09:00"), now, TZ)).toBe("מחר, 9:00");
    expect(formatWhenAbs(il("2026-10-29 16:30"), now, TZ)).toBe("יום ה׳ 29.10, 16:30");
    expect(formatWhenAbs(il("2027-01-01 10:00"), now, TZ)).toBe("יום ו׳ 1.1.2027, 10:00");
    expect(formatWhenAbs(il("2026-10-22 00:05"), now, TZ)).toBe("מחר, 00:05");
    expect(formatWhenAbs(il("2026-10-22 09:00"), now, TZ, { dated: true })).toBe("מחר, יום ה׳ 22.10, 9:00");
  });

  it("in the small hours 'היום' / 'מחר' always carry the date (they are ambiguous after midnight)", () => {
    const night = il("2026-10-23 03:43");
    expect(formatWhenAbs(il("2026-10-23 09:00"), night, TZ)).toBe("היום, יום ו׳ 23.10, 9:00");
    expect(formatWhenAbs(il("2026-10-24 09:00"), night, TZ)).toBe("מחר, יום ש׳ 24.10, 9:00");
    expect(formatWhenAbs(il("2026-10-27 09:00"), night, TZ)).toBe("יום ג׳ 27.10, 9:00");
    expect(formatWhenAbs(il("2026-10-23 09:00"), il("2026-10-23 05:00"), TZ)).toBe("היום, 9:00");
  });
});
