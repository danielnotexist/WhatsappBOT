/**
 * Wall-clock helpers for the user's IANA time zone (Asia/Jerusalem by default), so "21.10 from 00:00" means
 * midnight in Israel regardless of the server's zone (Vercel runs in UTC). DST-safe via Intl.
 */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Offset of `tz` from UTC at `instant`, in minutes (Israel summer → 180). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The instant of a wall-clock date + time in `tz`. */
export function localToInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMinutes(new Date(guess), tz) * 60_000;
  t = guess - tzOffsetMinutes(new Date(t), tz) * 60_000; // second pass across a DST edge
  return new Date(t);
}

/** "YYYY-MM-DD" + "HH:MM" + minutes → the shifted wall-clock pair (naive calendar arithmetic). */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) };
}

export function minutesBetweenLocal(a: { date: string; time: string }, b: { date: string; time: string }): number {
  const ms = (x: { date: string; time: string }) => Date.parse(`${x.date}T${x.time}:00Z`);
  return Math.round((ms(b) - ms(a)) / 60_000);
}

/** Wall-clock parts of an RFC 3339 date-time that Google returned in the requested zone ("2026-10-21T09:00:00+03:00"). */
export function wallClock(rfc3339: string): { date: string; time: string } {
  return { date: rfc3339.slice(0, 10), time: rfc3339.slice(11, 16) };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Free gaps of at least `minMinutes` between `dayStart` and `dayEnd` on `date`, given busy intervals as
 * wall-clock pairs (already in the user's zone). Intervals that cross midnight are clipped to the day.
 */
export function freeSlots(date: string, busy: { start: { date: string; time: string }; end: { date: string; time: string } }[], opts: { dayStart?: string; dayEnd?: string; minMinutes?: number } = {}): { start: string; end: string }[] {
  const from = toMin(opts.dayStart ?? "09:00");
  const to = toMin(opts.dayEnd ?? "18:00");
  const min = Math.max(opts.minMinutes ?? 30, 5);
  const clipped = busy
    .map((b) => ({ s: b.start.date < date ? 0 : b.start.date > date ? 1440 : toMin(b.start.time), e: b.end.date > date ? 1440 : b.end.date < date ? 0 : toMin(b.end.time) }))
    .filter((b) => b.e > from && b.s < to && b.e > b.s)
    .sort((a, b) => a.s - b.s);
  const slots: { start: string; end: string }[] = [];
  let cursor = from;
  for (const b of clipped) {
    if (b.s - cursor >= min) slots.push({ start: toHhmm(cursor), end: toHhmm(Math.min(b.s, to)) });
    cursor = Math.max(cursor, b.e);
  }
  if (to - cursor >= min) slots.push({ start: toHhmm(cursor), end: toHhmm(to) });
  return slots;
}
