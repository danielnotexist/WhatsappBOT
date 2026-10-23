import { describe, expect, it } from "vitest";
import { businessDaysBetween, hebrewDateOf, inRestTime, isBusinessDay, isRestDay, isYomTov } from "./rest-days";
import { zonedToUtc } from "./zoned";

const d = (year: number, month: number, day: number) => ({ year, month, day });
const il = (y: number, mo: number, day: number, h: number, mi = 0) => zonedToUtc({ year: y, month: mo, day, hour: h, minute: mi }, "Asia/Jerusalem");

describe("rest days: Shabbat and the holidays (Hebrew calendar from ICU)", () => {
  it("reads the Hebrew date", () => {
    expect(hebrewDateOf(d(2026, 9, 12))).toEqual({ month: "Tishri", day: 1 });
    expect(hebrewDateOf(d(2027, 4, 22))).toEqual({ month: "Nisan", day: 15 });
  });

  it("knows the days of rest of 5787: Rosh Hashana, Yom Kippur, Sukkot, Simchat Torah, Pesach, Shavuot", () => {
    for (const day of [d(2026, 9, 12), d(2026, 9, 13), d(2026, 9, 21), d(2026, 9, 26), d(2026, 10, 3), d(2027, 4, 22), d(2027, 4, 28), d(2027, 6, 11)]) expect(isYomTov(day), JSON.stringify(day)).toBe(true);
    // Chol HaMoed, Hanukkah and an ordinary Wednesday are working days
    for (const day of [d(2026, 9, 28), d(2026, 12, 7), d(2026, 10, 21)]) expect(isYomTov(day), JSON.stringify(day)).toBe(false);
  });

  it("Saturday and a holiday are rest days; Sunday–Thursday that is not a holiday is a business day", () => {
    expect(isRestDay(d(2026, 10, 24))).toBe(true); // Saturday
    expect(isRestDay(d(2026, 10, 23))).toBe(false); // Friday: not a rest day, but not a business day either
    expect(isBusinessDay(d(2026, 10, 23))).toBe(false);
    expect(isBusinessDay(d(2026, 10, 22))).toBe(true);
    expect(isBusinessDay(d(2026, 9, 21))).toBe(false); // Yom Kippur, a Monday
  });

  it("inRestTime: Friday from 14:00, Saturday all day, the eve of a holiday from 14:00", () => {
    expect(inRestTime(il(2026, 10, 23, 13, 59))).toBe(false);
    expect(inRestTime(il(2026, 10, 23, 14, 0))).toBe(true);
    expect(inRestTime(il(2026, 10, 24, 11, 0))).toBe(true);
    expect(inRestTime(il(2026, 10, 25, 9, 0))).toBe(false); // Sunday
    expect(inRestTime(il(2026, 9, 20, 15, 0))).toBe(true); // Sunday, Yom Kippur eve
    expect(inRestTime(il(2026, 9, 20, 10, 0))).toBe(false);
  });

  it("business days between two dates (both excluded)", () => {
    expect(businessDaysBetween(d(2026, 10, 18), d(2026, 10, 21))).toBe(2); // Sun → Wed: Mon, Tue
    expect(businessDaysBetween(d(2026, 10, 21), d(2026, 10, 25))).toBe(1); // Wed → Sun: Thu only
    expect(businessDaysBetween(d(2026, 10, 20), d(2026, 10, 21))).toBe(0);
    expect(businessDaysBetween(d(2026, 9, 18), d(2026, 9, 24))).toBe(3); // Fri → Thu across Yom Kippur (Mon): Sun, Tue, Wed
  });
});
