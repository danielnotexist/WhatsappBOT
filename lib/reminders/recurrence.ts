import type { RecurrenceRule } from "@/lib/db/types";
import { DAY_LETTERS, DEFAULT_TZ, addDays, clockHe, daysInMonth, localDateOf, weekdayOf, zonedToUtc, type LocalDate } from "@/lib/time/zoned";

export type { RecurrenceRule };

export const WORKDAYS = [0, 1, 2, 3, 4] as const;

function matches(rule: RecurrenceRule, d: LocalDate): boolean {
  if (rule.freq === "daily") return true;
  if (rule.freq === "weekly") return (rule.weekdays?.length ? rule.weekdays : [weekdayOf(d)]).includes(weekdayOf(d));
  const want = Math.min(rule.monthDay ?? 1, daysInMonth(d.year, d.month));
  return d.day === want;
}

/**
 * The first occurrence strictly after `after`, computed on the wall clock of `tz` — so "כל יום ב-8"
 * stays 08:00 across the DST switch (05:00Z in summer, 06:00Z in winter).
 */
export function nextOccurrence(rule: RecurrenceRule, after: Date, tz: string = DEFAULT_TZ): Date {
  const start = localDateOf(after, tz);
  for (let i = 0; i < 400; i++) {
    const d = addDays(start, i);
    if (!matches(rule, d)) continue;
    const at = zonedToUtc({ ...d, hour: rule.hour, minute: rule.minute }, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error(`recurrence never matches: ${JSON.stringify(rule)}`);
}

const joinHe = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ו-${items.at(-1)}`);

/** "כל יום, 8:00" / "בימים א׳–ה׳, 7:30" / "כל יום א׳, 9:00" / "בימים ב׳ ו-ה׳, 10:00" / "כל חודש ב-1, 9:00". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const clock = clockHe(rule.hour, rule.minute);
  if (rule.freq === "daily") return `כל יום, ${clock}`;
  if (rule.freq === "monthly") return `כל חודש ב-${rule.monthDay ?? 1}, ${clock}`;
  const days = [...new Set(rule.weekdays ?? [])].sort((a, b) => a - b);
  if (days.length === 7) return `כל יום, ${clock}`;
  if (days.length === 5 && WORKDAYS.every((d) => days.includes(d))) return `בימים א׳–ה׳, ${clock}`;
  if (days.length === 1) return `כל יום ${DAY_LETTERS[days[0]!]}, ${clock}`;
  return `בימים ${joinHe(days.map((d) => DAY_LETTERS[d]!))}, ${clock}`;
}

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  const r = value as RecurrenceRule | null;
  return Boolean(r && typeof r === "object" && ["daily", "weekly", "monthly"].includes(r.freq) && Number.isInteger(r.hour) && Number.isInteger(r.minute));
}
