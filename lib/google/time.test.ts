import { describe, expect, it } from "vitest";
import { addMinutesLocal, freeSlots, localToInstant, minutesBetweenLocal, tzOffsetMinutes, wallClock } from "./time";

describe("time-zone helpers", () => {
  it("maps Israeli wall-clock times to instants across DST (ends 25.10.2026)", () => {
    expect(tzOffsetMinutes(new Date("2026-10-21T12:00:00Z"), "Asia/Jerusalem")).toBe(180);
    expect(tzOffsetMinutes(new Date("2026-11-01T12:00:00Z"), "Asia/Jerusalem")).toBe(120);
    expect(localToInstant("2026-10-21", "00:00", "Asia/Jerusalem").toISOString()).toBe("2026-10-20T21:00:00.000Z");
    expect(localToInstant("2026-11-01", "09:30", "Asia/Jerusalem").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    expect(localToInstant("2026-10-21", "09:00", "UTC").toISOString()).toBe("2026-10-21T09:00:00.000Z");
  });

  it("does wall-clock arithmetic", () => {
    expect(addMinutesLocal("2026-10-21", "23:30", 60)).toEqual({ date: "2026-10-22", time: "00:30" });
    expect(minutesBetweenLocal({ date: "2026-10-21", time: "09:00" }, { date: "2026-10-21", time: "10:30" })).toBe(90);
    expect(wallClock("2026-10-21T13:00:00+03:00")).toEqual({ date: "2026-10-21", time: "13:00" });
  });

  it("finds free slots between busy blocks, clipping overnight events", () => {
    const busy = [
      { start: { date: "2026-10-21", time: "09:00" }, end: { date: "2026-10-21", time: "10:00" } },
      { start: { date: "2026-10-21", time: "13:00" }, end: { date: "2026-10-21", time: "13:30" } },
      { start: { date: "2026-10-21", time: "13:15" }, end: { date: "2026-10-21", time: "14:00" } },
      { start: { date: "2026-10-20", time: "22:00" }, end: { date: "2026-10-21", time: "08:30" } },
    ];
    expect(freeSlots("2026-10-21", busy)).toEqual([
      { start: "10:00", end: "13:00" },
      { start: "14:00", end: "18:00" },
    ]);
    expect(freeSlots("2026-10-21", busy, { dayStart: "08:00", dayEnd: "20:00", minMinutes: 240 })).toEqual([{ start: "14:00", end: "20:00" }]);
    expect(freeSlots("2026-10-21", [])).toEqual([{ start: "09:00", end: "18:00" }]);
  });
});
