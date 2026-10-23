import { DEFAULT_TZ, addDays, weekdayOf, zonedParts, type LocalDate } from "./zoned";

/**
 * Shabbat and the Israeli holidays (yom tov) — when the assistant sends nothing of her own (proactive alerts,
 * lib/proactive/alerts.ts) and what does not count as a business day ("waiting ≥ 2 business days").
 *
 * The holidays come from the runtime's Hebrew calendar (ICU, `Intl.DateTimeFormat` with `ca-hebrew`), not from a table
 * of dates: the days of rest in Israel are Tishri 1–2 (Rosh Hashana), 10 (Yom Kippur), 15 (Sukkot), 22 (Shemini
 * Atzeret / Simchat Torah), Nisan 15 and 21 (Pesach) and Sivan 6 (Shavuot). Business days are Sunday–Thursday.
 * The eve (Friday, or the day before a holiday) is quiet from REST_EVE_HOUR — earlier than any candle lighting, so no
 * table of sunset times is needed.
 */
export const REST_EVE_HOUR = 14;

const YOM_TOV: Record<string, readonly number[]> = { Tishri: [1, 2, 10, 15, 22], Nisan: [15, 21], Sivan: [6] };

const hebrewFmt = new Intl.DateTimeFormat("en-u-ca-hebrew", { timeZone: "UTC", month: "long", day: "numeric" });

/** The Hebrew calendar month name (ICU spelling: "Tishri", "Nisan", "Adar II"…) and day of a civil date. */
export function hebrewDateOf(d: LocalDate): { month: string; day: number } {
  const parts = hebrewFmt.formatToParts(new Date(Date.UTC(d.year, d.month - 1, d.day, 12)));
  return { month: parts.find((p) => p.type === "month")?.value ?? "", day: Number(parts.find((p) => p.type === "day")?.value ?? 0) };
}

/** A holiday on which work stops in Israel (not Chol HaMoed, not Purim / Hanukkah / Yom HaAtzmaut). */
export function isYomTov(d: LocalDate): boolean {
  const h = hebrewDateOf(d);
  return YOM_TOV[h.month]?.includes(h.day) ?? false;
}

/** Saturday or a holiday. */
export function isRestDay(d: LocalDate): boolean {
  return weekdayOf(d) === 6 || isYomTov(d);
}

/** Sunday–Thursday and not a holiday. */
export function isBusinessDay(d: LocalDate): boolean {
  const w = weekdayOf(d);
  return w >= 0 && w <= 4 && !isYomTov(d);
}

/**
 * Shabbat or a holiday at this instant, including the eve from REST_EVE_HOUR (Friday afternoon, the afternoon before a
 * holiday). Used as "never send now".
 */
export function inRestTime(now: Date, tz: string = DEFAULT_TZ): boolean {
  const p = zonedParts(now, tz);
  const today: LocalDate = { year: p.year, month: p.month, day: p.day };
  if (isRestDay(today)) return true;
  return p.hour >= REST_EVE_HOUR && (weekdayOf(today) === 5 || isRestDay(addDays(today, 1)));
}

/** Business days strictly between two local dates (both excluded): received Sunday, today Wednesday → 2. */
export function businessDaysBetween(from: LocalDate, to: LocalDate): number {
  let n = 0;
  for (let d = addDays(from, 1), i = 0; i < 400; d = addDays(d, 1), i++) {
    if (d.year === to.year && d.month === to.month && d.day === to.day) break;
    if (Date.UTC(d.year, d.month - 1, d.day) > Date.UTC(to.year, to.month - 1, to.day)) break;
    if (isBusinessDay(d)) n++;
  }
  return n;
}
