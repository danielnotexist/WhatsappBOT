import { describe, expect, it } from "vitest";
import { clockOf, dayChipLabel, dayKeyOf, groupByDay } from "./days";

/** The admin's days are Israel days: IDT (UTC+3) until 25.10.2026 02:00, IST (UTC+2) after it. */
describe("days in Israel time", () => {
  it("an instant late in the UTC evening is already the next day in Israel", () => {
    expect(dayKeyOf("2026-10-23T20:59:00.000Z")).toBe("2026-10-23"); // 23:59 IDT
    expect(dayKeyOf("2026-10-23T21:01:00.000Z")).toBe("2026-10-24"); // 00:01 IDT
    // after the clocks go back: midnight is 22:00 UTC
    expect(dayKeyOf("2026-10-26T21:30:00.000Z")).toBe("2026-10-26"); // 23:30 IST
    expect(dayKeyOf("2026-10-26T22:30:00.000Z")).toBe("2026-10-27"); // 00:30 IST
    expect(clockOf("2026-10-23T21:01:00.000Z")).toBe("00:01");
  });

  it("chips: היום, אתמול, then the weekday and the date (with the year only when it differs)", () => {
    // 00:30 on Saturday 24.10 in Israel, still Friday in UTC
    const now = new Date("2026-10-23T21:30:00.000Z");
    expect(dayChipLabel("2026-10-24", now)).toBe("היום");
    expect(dayChipLabel("2026-10-23", now)).toBe("אתמול");
    expect(dayChipLabel("2026-10-21", now)).toBe("יום ד׳, 21.10");
    expect(dayChipLabel("2025-12-31", now)).toBe("יום ד׳, 31.12.25");
    expect(dayChipLabel("not-a-day", now)).toBe("not-a-day");
  });

  it("groups consecutive items by their Israel day, keeping the order", () => {
    const now = new Date("2026-10-24T09:00:00.000Z");
    const items = [
      { id: "a", at: "2026-10-24T08:00:00.000Z" },
      { id: "b", at: "2026-10-23T21:10:00.000Z" }, // 00:10 IDT on 24.10 — today, though UTC says 23.10
      { id: "c", at: "2026-10-23T20:50:00.000Z" }, // 23:50 IDT on 23.10
      { id: "d", at: "2026-10-20T10:00:00.000Z" },
    ];
    const groups = groupByDay(items, (i) => i.at, now);
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ["2026-10-24", "היום", ["a", "b"]],
      ["2026-10-23", "אתמול", ["c"]],
      ["2026-10-20", "יום ג׳, 20.10", ["d"]],
    ]);
    expect(groupByDay([], (i: { at: string }) => i.at, now)).toEqual([]);
  });
});
