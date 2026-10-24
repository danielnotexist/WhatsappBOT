import { DAY_LETTERS, addDays, compareDates, dateKey, localDateOf, parseDateKey, weekdayOf } from "@/lib/time/zoned";
import { ADMIN_TZ } from "./view";

/**
 * Days on the admin's timelines: an instant belongs to its calendar day in Israel time (not UTC — 23:30 UTC in summer
 * is already tomorrow in Tel Aviv). The chip says "היום", "אתמול", or the weekday and the date. Client-safe, pure.
 */

export function dayKeyOf(iso: string, tz: string = ADMIN_TZ): string {
  return dateKey(localDateOf(new Date(iso), tz));
}

/** "היום" / "אתמול" / "יום ג׳, 21.10" (the year too when it is not this year's). */
export function dayChipLabel(key: string, now: Date = new Date(), tz: string = ADMIN_TZ): string {
  const d = parseDateKey(key);
  if (!d) return key;
  const today = localDateOf(now, tz);
  if (compareDates(d, today) === 0) return "היום";
  if (compareDates(d, addDays(today, -1)) === 0) return "אתמול";
  return `יום ${DAY_LETTERS[weekdayOf(d)]}, ${d.day}.${d.month}${d.year !== today.year ? `.${String(d.year).slice(2)}` : ""}`;
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Consecutive items of the same Israel day, in the order given (newest-first stays newest-first). */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string, now: Date = new Date(), tz: string = ADMIN_TZ): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKeyOf(at(item), tz);
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayChipLabel(key, now, tz), items: [item] });
  }
  return groups;
}

/** "14:05" in Israel time. */
export function clockOf(iso: string, tz: string = ADMIN_TZ): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
