/**
 * Wall-clock ↔ instant conversion for an IANA time zone (default Asia/Jerusalem) using only Intl —
 * no date library. DST rules (Israel: Friday before the last Sunday of March 02:00 → 03:00, last Sunday
 * of October 02:00 → 01:00) come from the runtime's ICU tz data.
 *
 * Gaps (spring forward, e.g. 27.3.2026 02:30 does not exist) resolve forward (→ 03:30);
 * overlaps (fall back, e.g. 25.10.2026 01:30 happens twice) resolve to the first occurrence.
 */
export const DEFAULT_TZ = "Asia/Jerusalem";

export interface LocalDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export interface LocalDateTime extends LocalDate {
  hour: number;
  minute: number;
}

export interface LocalParts extends LocalDateTime {
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  return f;
}

/** Local calendar fields of an instant in `tz`. */
export function zonedParts(date: Date, tz: string = DEFAULT_TZ): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? 0,
  };
}

/** UTC offset of `tz` at an instant, in ms (Israel: +2h winter, +3h summer). */
export function tzOffsetMs(date: Date, tz: string = DEFAULT_TZ): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const sameWallClock = (d: Date, l: LocalDateTime, tz: string) => {
  const p = zonedParts(d, tz);
  return p.year === l.year && p.month === l.month && p.day === l.day && p.hour === l.hour && p.minute === l.minute;
};

/** The instant at which the wall clock in `tz` shows `local` (see the gap/overlap rules above). */
export function zonedToUtc(local: LocalDateTime, tz: string = DEFAULT_TZ): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const before = tzOffsetMs(new Date(guess - 86_400_000), tz);
  const after = tzOffsetMs(new Date(guess + 86_400_000), tz);
  const candidates = [...new Set([guess - before, guess - after])].map((t) => new Date(t)).filter((d) => sameWallClock(d, local, tz));
  if (candidates.length) return new Date(Math.min(...candidates.map((d) => d.getTime())));
  // gap: the wall-clock time is skipped → use the offset in force before the jump (lands just after it)
  return new Date(guess - before);
}

export function localDateOf(date: Date, tz: string = DEFAULT_TZ): LocalDate {
  const p = zonedParts(date, tz);
  return { year: p.year, month: p.month, day: p.day };
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Same day of month `n` months later, clamped to the month's last day (31.1 + 1 month → 28/29.2). */
export function addMonths(d: LocalDate, n: number): LocalDate {
  const first = new Date(Date.UTC(d.year, d.month - 1 + n, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + 1;
  return { year: y, month: m, day: Math.min(d.day, daysInMonth(y, m)) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOf(d: LocalDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" — the per-day idempotency key (morning summary) and SQL `date` literal. */
export function dateKey(d: LocalDate): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

export function parseDateKey(key: string): LocalDate | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** "HH:MM" (24h) → minutes; accepts Postgres `time` strings ("07:30:00"). */
export function parseClock(value: string): { hour: number; minute: number } | null {
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

// ---------- Hebrew formatting (docs/copy/bot-copy.md: "מחר, 9:00" / "יום ה׳ 23.10, 16:30") ----------

export const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

/** "9:00", "16:30", "00:05" — 24h, no leading zero except at midnight. */
export function clockHe(hour: number, minute: number): string {
  return `${hour === 0 ? "00" : hour}:${pad(minute)}`;
}

/** "יום ג׳ 22.10" (adds ".2027" when the year differs from `refYear`). */
export function dayLabelHe(d: LocalDate, refYear?: number): string {
  return `יום ${DAY_LETTERS[weekdayOf(d)]} ${d.day}.${d.month}${refYear !== undefined && refYear !== d.year ? `.${d.year}` : ""}`;
}

/**
 * 00:00–04:59 local: "the small hours". People who have not slept yet mean the coming morning by "מחר" (the reminder
 * parser reads it so, and the system prompt says so), and "היום" / "מחר" alone are ambiguous — echoes add the date.
 */
export const SMALL_HOURS_END = 5;

export function inSmallHours(now: Date, tz: string = DEFAULT_TZ): boolean {
  return zonedParts(now, tz).hour < SMALL_HOURS_END;
}

/**
 * Absolute echo for a reminder time: "היום, 18:00" / "מחר, 9:00" / "יום ה׳ 23.10, 16:30". In the small hours "היום"
 * and "מחר" carry the date as well ("היום, יום ו׳ 23.10, 9:00"), or `dated: true` asks for it at any hour.
 */
export function formatWhenAbs(at: Date, now: Date, tz: string = DEFAULT_TZ, opts: { dated?: boolean } = {}): string {
  const p = zonedParts(at, tz);
  const today = localDateOf(now, tz);
  const day: LocalDate = { year: p.year, month: p.month, day: p.day };
  const clock = clockHe(p.hour, p.minute);
  const dated = opts.dated || inSmallHours(now, tz);
  const label = dayLabelHe(day, today.year);
  if (compareDates(day, today) === 0) return dated ? `היום, ${label}, ${clock}` : `היום, ${clock}`;
  if (compareDates(day, addDays(today, 1)) === 0) return dated ? `מחר, ${label}, ${clock}` : `מחר, ${clock}`;
  return `${label}, ${clock}`;
}

/** "יום ב׳ 20.10, 18:40" — when something was asked (the `reminder` template's {{2}}). */
export function formatStampHe(at: Date, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(at, tz);
  return `${dayLabelHe(p)}, ${clockHe(p.hour, p.minute)}`;
}
