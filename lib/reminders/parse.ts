/**
 * Free-form Hebrew time expressions → an absolute instant (or a recurring rule) in the user's time zone.
 *
 *   "מחר ב-9" · "עוד שעתיים" · "ביום ראשון הבא ב-8:30" · "כל יום בשמונה" · "בעוד רבע שעה" · "ב-14:00"
 *   "ברבע לתשע" · "ב-5 אחה״צ" · "הערב" · "ב-22.10" · "ב-5 בנובמבר" · "בימים א׳–ה׳ ב-7:30" · "כל חודש ב-1"
 *
 * Deterministic on purpose: the model passes the user's phrase verbatim and this code does the calendar
 * arithmetic (models are unreliable with DST and weekday math). Conventions, all echoed back to the user
 * as an absolute time ("מחר, 9:00") so a wrong guess is visible immediately:
 *   - minutes / hours ("עוד שעתיים") are elapsed time; days / weeks / months keep the wall-clock time.
 *   - a bare hour 1–5 means the afternoon (ב-5 → 17:00); 6–11 means the morning, or the evening when the
 *     morning has already passed today (ב-9 at 10:15 → 21:00); 12 is noon; "09:00" / 13–23 are exact.
 *   - a day without a time → 9:00 (בבוקר 9:00, בצהריים 12:00, אחה״צ 16:00, בערב 20:00, בלילה 22:00).
 *   - "ביום ראשון" = the nearest Sunday (today if the time is still ahead); "ביום ראשון הבא" skips today.
 *   - "מחר" between 00:00 and 04:59 means the coming morning (the same calendar date); the next date is returned as
 *     `nextDay`, and the reply names the date and offers it in one tap.
 *   - nonexistent DST times move forward (27.3.2026 02:30 → 03:30); repeated ones take the first occurrence.
 */
import type { RecurrenceRule } from "@/lib/db/types";
import { DEFAULT_TZ, SMALL_HOURS_END, addDays, addMonths, compareDates, daysInMonth, localDateOf, weekdayOf, zonedParts, zonedToUtc, type LocalDate } from "@/lib/time/zoned";
import { WORKDAYS, nextOccurrence } from "./recurrence";

export interface ParseOptions {
  now: Date;
  timeZone?: string;
}

export type ParsedWhen =
  | {
      kind: "once";
      at: Date;
      /** the instant is not after `now` (e.g. "היום ב-8" said at 21:00) — ask again instead of scheduling */
      inPast: boolean;
      /** false when only a day was given and 9:00 was assumed */
      hasTime: boolean;
      /** the time phrases found, as written */
      matched: string;
      /** the input without the time phrases and the "תזכיר לי" opener — the reminder text */
      rest: string;
      /** "מחר" said in the small hours was read as the coming morning: the same time on the next date, the other reading */
      nextDay?: Date;
    }
  | { kind: "recurring"; rule: RecurrenceRule; first: Date; matched: string; rest: string };

type Part = "morning" | "noon" | "afternoon" | "evening" | "night";

interface TimeSpec {
  hour: number;
  minute: number;
  /** zero-padded ("09:00") or 0 / 13–23 → no AM/PM guessing */
  exact: boolean;
  part: Part | null;
}

type DaySpec =
  | { t: "today" }
  | { t: "tomorrow" }
  | { t: "offset"; days: number }
  | { t: "months"; months: number }
  | { t: "weekday"; wd: number; next: boolean }
  | { t: "nextWeek" }
  | { t: "date"; day: number; month: number; year: number | null };

// ---------------------------------------------------------------------------------------------
// vocabulary
// ---------------------------------------------------------------------------------------------

const UNIT_WORDS: Record<string, number> = {
  אחת: 1, אחד: 1,
  שתיים: 2, שתים: 2, שניים: 2, שנים: 2, שתי: 2, שני: 2,
  שלוש: 3, שלושה: 3, שלושת: 3,
  ארבע: 4, ארבעה: 4, ארבעת: 4,
  חמש: 5, חמישה: 5, חמשת: 5,
  שש: 6, שישה: 6, ששת: 6,
  שבע: 7, שבעה: 7, שבעת: 7,
  שמונה: 8, שמונת: 8,
  תשע: 9, תשעה: 9, תשעת: 9,
  עשר: 10, עשרה: 10, עשרת: 10,
};
const TENS: Record<string, number> = { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60 };
/** hour words ("בשמונה") — no "שני"/"שתי" (those are Monday / construct forms) */
const HOUR_WORDS = ["אחת עשרה", "שתים עשרה", "שתיים עשרה", "אחת", "שתיים", "שתים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר"];
const WEEKDAY_NAMES: Record<string, number> = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
const WEEKDAY_LETTERS: Record<string, number> = { א: 0, ב: 1, ג: 2, ד: 3, ה: 4, ו: 5, ש: 6 };
const MONTHS: Record<string, number> = { ינואר: 1, פברואר: 2, מרץ: 3, מרס: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12 };
const PART_DEFAULT: Record<Part, number> = { morning: 9 * 60, noon: 12 * 60, afternoon: 16 * 60, evening: 20 * 60, night: 22 * 60 };
const DEFAULT_MINUTES = 9 * 60;

const byLength = (words: string[]) => [...words].sort((a, b) => b.length - a.length);
const alt = (words: string[]) => byLength(words).map((w) => w.replace(/ /g, String.raw`\s+`)).join("|");

/** start / end of a word (JS \b is ASCII-only) */
const L = String.raw`(?<![\p{L}\p{N}])`;
const R = String.raw`(?![\p{L}\p{N}])`;
const NW = String.raw`(?![\p{L}])`;

const UNIT_ALT = alt(Object.keys(UNIT_WORDS));
const TENS_ALT = alt(Object.keys(TENS));
const NUM = String.raw`(?:\d{1,3}|(?:${TENS_ALT})${NW}(?:\s+ו-?(?:${UNIT_ALT})${NW})?|(?:${UNIT_ALT})${NW}(?:\s+עשרה?${NW})?)`;
const HOURW = String.raw`(?:${alt(HOUR_WORDS)})${NW}`;
const DAY_NAME_ALT = alt(Object.keys(WEEKDAY_NAMES));
/** a weekday: name, letter with geresh (ה׳), or a bare letter followed by a word / the end ("יום ה בבוקר", not "יום ב 8") */
const DAY_TOKEN = String.raw`(?:(?:${DAY_NAME_ALT})${NW}|[אבגדהוש]'|[אבגדהוש](?=\s+[^\d\s]|\s*$))`;
const DAY_TOKEN_RX = new RegExp(String.raw`(?<![\p{L}])(?:ו)?(?:ב)?(?:יום\s+)?(${DAY_TOKEN})`, "gu");
const MONTH_ALT = alt(Object.keys(MONTHS));
/** part of day right after a time ("ב-8 בערב", "ב-8 ערב") */
const PARTS = String.raw`(?:לפנות\s+בוקר|אחרי?\s+הצהריים|אחר\s+הצהרים|אחה"צ|אחהצ|(?:ב|ל)?(?:בוקר|צהריים|צהרים|ערב|לילה))${NW}`;
/** a part of day on its own needs its preposition ("בערב"), so "ארוחת ערב" is not a time */
const PARTS_ALONE = String.raw`(?:לפנות\s+בוקר|אחרי?\s+הצהריים|אחר\s+הצהרים|אחה"צ|אחהצ|ב(?:בוקר|צהריים|צהרים|ערב|לילה))${NW}`;
const MINUTE_SUFFIX = String.raw`(?:\s+ו-?\s?(חצי|רבע|${NUM})(?:\s+דק(?:ות|ה|')?)?${NW})?`;
const NOT_A_QUANTITY = String.raw`(?!\s*(?:דק|שע|ימים|יום|שבוע|חודש|ש"ח|₪|%|אחוז|תשלומ|פעמים|מיילים|קבצים))`;

const re = (source: string) => new RegExp(source, "gu");

const RX = {
  iso: re(String.raw`${L}(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s]+(\d{1,2}):(\d{2}))?(?!\d)`),
  workdays: re(String.raw`${L}(?:ו)?(?:ב)?(?:(?:כל|מדי)\s+יום\s+(?:חול|עבודה)|(?:כל\s+)?ימי\s+(?:ה)?(?:חול|עבודה|שבוע)|ימים\s+א'?\s*-\s*ה'?|א'\s*-\s*ה')${R}`),
  weekdaysList: re(String.raw`${L}(?:ו)?(?:ב)?(?:כל|מדי)\s+(?:יום\s+)?(${DAY_TOKEN}(?:\s*(?:,|ו)\s*(?:ב)?(?:יום\s+)?${DAY_TOKEN})*)`),
  daily: re(String.raw`${L}(?:ו)?(?:ב)?(?:כל|מדי)\s+(?:ה)?(יום|בוקר|ערב|לילה|צהריים|צהרים)${R}`),
  weekly: re(String.raw`${L}(?:ו)?(?:ב)?(?:כל|מדי)\s+שבוע${R}`),
  monthly: re(String.raw`${L}(?:ו)?(?:ב)?(?:(?:כל|מדי)\s+חודש(?:\s+ב-?\s?(\d{1,2})(?!\d)(?:\s+(?:ל|ב)?חודש${R})?)?|-?\s?(\d{1,2})\s+(?:ל|ב)כל\s+חודש${R}|כל\s+(\d{1,2})\s+(?:ל|ב)חודש${R})`),
  relative: re(String.raw`${L}(?:ו)?(?:ב)?(?:עוד|תוך)\s+(?:כ-?\s?)?(?:(חצי|רבע|שלושת\s+רבעי|שלושה\s+רבעי)\s+(?:ה)?שעה${R}|(${NUM})?\s*-?\s*(דקות|דקה|דק'|דק|שעות|שעתיים|שעה|ימים|יומיים|יום|שבועות|שבועיים|שבוע|חודשים|חודשיים|חודש)${NW}(?:\s+(?:ו|וה)-?\s?(חצי|רבע)${NW})?)`),
  numericDate: re(String.raw`${L}(?:ו)?(?:ב|ה|ל)?\s?-?\s?(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d:])`),
  monthDate: re(String.raw`${L}(?:ו)?(?:ב|ה|ל)?\s?-?\s?(\d{1,2})\s+(?:ב|ל)?(${MONTH_ALT})${NW}(?:\s+(\d{4}))?`),
  nextWeek: re(String.raw`${L}(?:ו)?(?:ב|ל)?שבוע\s+(?:ה)?(?:בא|הבא)${R}`),
  weekdayYom: re(String.raw`${L}(?:ו)?(?:ב|ל)?יום\s+(${DAY_TOKEN})(?:\s+(הבא|הקרוב|הזה))?`),
  shabbat: re(String.raw`${L}(?:ו)?(?:ב|ל)?שבת(?:\s+(הבאה|הקרובה|הזאת))?${R}`),
  weekdayBare: re(String.raw`${L}(?:ו)?ב(ראשון|שני|שלישי|רביעי|חמישי|שישי)(?:\s+(הבא|הקרוב))?${R}`),
  weekdayNext: re(String.raw`${L}(ראשון|שני|שלישי|רביעי|חמישי|שישי)\s+(הבא|הקרוב)${R}`),
  dayWord: re(String.raw`${L}(?:ו|ש)?(?:ל|ב)?(היום|מחרתיים|מחר)${R}`),
  todayPart: re(String.raw`${L}(?:ו)?(הבוקר|הצהריים|הערב|הלילה)${R}`),
  quarterTo: re(String.raw`${L}(?:ו)?ב(רבע|עשרה|עשרים|חמישה|חמש|\d{1,2})\s+ל-?\s?(${HOURW}|\d{1,2}(?!\d))(?:\s+(${PARTS}))?`),
  colon: re(String.raw`${L}(?:ו)?(?:בשעה|ב|ל|עד)?\s*-?\s*(\d{1,2}):(\d{2})(?!\d)(?:\s+(${PARTS}))?`),
  dotTime: re(String.raw`${L}(?:ו)?(?:בשעה|ב)\s*-?\s*(\d{1,2})\.(\d{2})(?!\d)(?:\s+(${PARTS}))?`),
  hourAt: re(String.raw`${L}(?:ו)?(?:ב|ל)?שעה\s+(\d{1,2}(?![\d:])|${HOURW})${MINUTE_SUFFIX}(?:\s+(${PARTS}))?`),
  bareDigit: re(String.raw`${L}(?:ו)?(?:ב|ל|עד)\s*-?\s*(\d{1,2})(?![\d:]|\.\d)${NOT_A_QUANTITY}${MINUTE_SUFFIX}(?:\s+(${PARTS}))?`),
  hourWord: re(String.raw`${L}(?:ו)?ב(${HOURW})${MINUTE_SUFFIX}(?:\s+(${PARTS}))?`),
  midnight: re(String.raw`${L}(?:ו)?(?:ב|ל|עד)?חצות(?:\s+(?:ה)?לילה)?${R}`),
  partAlone: re(String.raw`${L}(?:ו)?(${PARTS_ALONE})`),
};

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const CHAR_MAP: Record<string, string> = {
  "׳": "'", "’": "'", "‘": "'", "`": "'", "´": "'",
  "״": '"', "“": '"', "”": '"', "„": '"',
  "־": "-", "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
};

/** 1:1 character mapping (keeps offsets aligned with the input): quotes, dashes, spaces, bidi marks, case. */
export function normalizeForParse(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const mapped = CHAR_MAP[c];
    if (mapped) out += mapped;
    else if (/[\s‎‏‪-‮⁦-⁩]/.test(c)) out += " ";
    else {
      const l = c.toLowerCase();
      out += l.length === 1 ? l : c;
    }
  }
  return out;
}

export function hebrewNumber(word: string): number | null {
  const s = word.trim().replace(/\s+/g, " ").replace(/-/g, "");
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "חצי") return 30;
  if (s === "רבע") return 15;
  const compound = s.match(/^(\S+) ו(\S+)$/);
  if (compound && TENS[compound[1]!] !== undefined && UNIT_WORDS[compound[2]!] !== undefined) return TENS[compound[1]!]! + UNIT_WORDS[compound[2]!]!;
  const teen = s.match(/^(\S+) עשרה?$/);
  if (teen && UNIT_WORDS[teen[1]!] !== undefined && UNIT_WORDS[teen[1]!]! < 10) return 10 + UNIT_WORDS[teen[1]!]!;
  return TENS[s] ?? UNIT_WORDS[s] ?? null;
}

function partOf(raw: string | undefined): Part | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").replace(/^[בל](?=(בוקר|צהריים|צהרים|ערב|לילה))/, "");
  if (s === "בוקר" || s.startsWith("לפנות")) return "morning";
  if (s === "צהריים" || s === "צהרים") return "noon";
  if (s.startsWith("אחר") || s.startsWith("אחה")) return "afternoon";
  if (s === "ערב") return "evening";
  if (s === "לילה") return "night";
  return null;
}

function applyPart(hour: number, part: Part): number {
  if (hour >= 13) return hour;
  switch (part) {
    case "morning":
      return hour;
    case "noon":
      return hour <= 5 ? hour + 12 : hour;
    case "afternoon":
    case "evening":
      return hour < 12 ? hour + 12 : hour;
    case "night":
      return hour === 12 ? 24 : hour >= 6 ? hour + 12 : hour;
  }
}

/** Minutes after local midnight, in order of preference (≥ 1440 = the next day). */
function candidates(t: TimeSpec): number[] {
  const m = t.minute;
  if (t.part) return [applyPart(t.hour, t.part) * 60 + m];
  if (t.exact || t.hour === 0 || t.hour >= 13) return [t.hour * 60 + m];
  if (t.hour === 12) return [12 * 60 + m];
  if (t.hour <= 5) return [(t.hour + 12) * 60 + m];
  return [t.hour * 60 + m, (t.hour + 12) * 60 + m];
}

class Scanner {
  masked: string;
  spans: [number, number][] = [];
  constructor(readonly text: string) {
    this.masked = text;
  }

  take(rx: RegExp, accept?: (m: RegExpExecArray) => boolean): RegExpExecArray | null {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(this.masked))) {
      if (!m[0].trim()) {
        rx.lastIndex = m.index + 1;
        continue;
      }
      if (accept && !accept(m)) {
        rx.lastIndex = m.index + 1;
        continue;
      }
      // trim surrounding whitespace from the span
      const lead = m[0].length - m[0].trimStart().length;
      const start = m.index + lead;
      const end = m.index + m[0].trimEnd().length;
      this.masked = this.masked.slice(0, start) + " ".repeat(end - start) + this.masked.slice(end);
      this.spans.push([start, end]);
      return m;
    }
    return null;
  }
}

/** "תזכיר לי ש…", "תזכירי אותי על…" (a voice note's wording) — dropped from the reminder text */
const REMINDER_OPENER = /^\s*(?:אנא\s+|בבקשה\s+)?(?:תזכיר(?:י|ו)?|להזכיר|הזכר|תזכורת|תזכרו)(?:\s+(?:לי|לנו|אותי|אותנו))?(?:\s+(?:ש|ל|על)(?=\s))?[\s:,-]*/u;

function restOf(input: string, spans: [number, number][]): string {
  let out = "";
  let pos = 0;
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    out += input.slice(pos, s) + " ";
    pos = e;
  }
  out += input.slice(pos);
  return out
    .replace(/\s+/g, " ")
    .replace(REMINDER_OPENER, "")
    .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, "")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// time / day extraction
// ---------------------------------------------------------------------------------------------

function minuteSuffix(raw: string | undefined): number {
  if (!raw) return 0;
  const n = hebrewNumber(raw);
  return n !== null && n < 60 ? n : 0;
}

function takeTime(sc: Scanner): TimeSpec | "midnight" | null {
  let m = sc.take(RX.quarterTo, (x) => {
    const h = hebrewNumber(x[2]!);
    const before = hebrewNumber(x[1]!);
    return h !== null && h >= 1 && h <= 24 && before !== null && before > 0 && before < 60;
  });
  if (m) {
    const h = hebrewNumber(m[2]!)!;
    const before = hebrewNumber(m[1]!)!;
    return { hour: h - 1, minute: 60 - before, exact: false, part: partOf(m[3]) };
  }
  m = sc.take(RX.colon, (x) => (Number(x[1]) <= 23 && Number(x[2]) <= 59) || (x[1] === "24" && x[2] === "00"));
  if (m) {
    if (m[1] === "24") return "midnight";
    return { hour: Number(m[1]), minute: Number(m[2]), exact: m[1]!.length === 2 && m[1]!.startsWith("0"), part: partOf(m[3]) };
  }
  m = sc.take(RX.dotTime, (x) => Number(x[1]) <= 23 && Number(x[2]) <= 59);
  if (m) return { hour: Number(m[1]), minute: Number(m[2]), exact: m[1]!.length === 2 && m[1]!.startsWith("0"), part: partOf(m[3]) };
  m = sc.take(RX.hourAt, (x) => {
    const h = hebrewNumber(x[1]!);
    return h !== null && h <= 23;
  });
  if (m) return { hour: hebrewNumber(m[1]!)!, minute: minuteSuffix(m[2]), exact: /^0\d/.test(m[1]!), part: partOf(m[3]) };
  m = sc.take(RX.bareDigit, (x) => Number(x[1]) <= 24);
  if (m) return { hour: Number(m[1]) % 24, minute: minuteSuffix(m[2]), exact: /^0\d/.test(m[1]!), part: partOf(m[3]) };
  m = sc.take(RX.hourWord, (x) => (hebrewNumber(x[1]!) ?? 99) <= 12);
  if (m) return { hour: hebrewNumber(m[1]!)!, minute: minuteSuffix(m[2]), exact: false, part: partOf(m[3]) };
  if (sc.take(RX.midnight)) return "midnight";
  return null;
}

function weekdayFromToken(token: string): number | null {
  const t = token.replace(/'/g, "").trim();
  if (t in WEEKDAY_NAMES) return WEEKDAY_NAMES[t]!;
  if (t.length === 1 && t in WEEKDAY_LETTERS) return WEEKDAY_LETTERS[t]!;
  return null;
}

function takeWeekday(sc: Scanner): { wd: number; next: boolean } | null {
  let m = sc.take(RX.weekdayYom, (x) => weekdayFromToken(x[1]!) !== null);
  if (m) return { wd: weekdayFromToken(m[1]!)!, next: m[2] === "הבא" };
  m = sc.take(RX.shabbat);
  if (m) return { wd: 6, next: m[1] === "הבאה" };
  m = sc.take(RX.weekdayBare) ?? sc.take(RX.weekdayNext);
  if (m) return { wd: WEEKDAY_NAMES[m[1]!]!, next: m[2] === "הבא" };
  return null;
}

function validDate(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2028, month); // 2028: leap year (29.2 allowed)
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

export function parseHebrewWhen(input: string, opts: ParseOptions): ParsedWhen | null {
  const tz = opts.timeZone ?? DEFAULT_TZ;
  const now = opts.now;
  const sc = new Scanner(normalizeForParse(input));
  const today = localDateOf(now, tz);
  const nowLocal = zonedParts(now, tz);
  const finish = <T extends object>(r: T) => ({ ...r, matched: sc.spans.map(([s, e]) => input.slice(s, e)).join(" "), rest: restOf(input, sc.spans) });
  const instant = (d: LocalDate, minutes: number) => {
    const day = addDays(d, Math.floor(minutes / 1440));
    const m = minutes % 1440;
    return zonedToUtc({ ...day, hour: Math.floor(m / 60), minute: m % 60 }, tz);
  };
  const firstFuture = (d: LocalDate, mins: number[]) => mins.map((m) => instant(d, m)).find((t) => t.getTime() > now.getTime()) ?? null;

  // 1. ISO (what a model might pass): 2026-10-22 or 2026-10-22T09:00 — exact, no guessing
  const iso = sc.take(RX.iso, (x) => validDate(Number(x[3]), Number(x[2])));
  if (iso) {
    const d = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    const hasTime = iso[4] !== undefined;
    const at = instant(d, hasTime ? Number(iso[4]) * 60 + Number(iso[5]) : DEFAULT_MINUTES);
    return finish({ kind: "once" as const, at, inPast: at.getTime() <= now.getTime(), hasTime });
  }

  // 2. recurring
  const recurring = takeRecurring(sc, today);
  if (recurring) {
    if (recurring.freq === "weekly" && !recurring.weekdays) recurring.weekdays = [takeWeekday(sc)?.wd ?? weekdayOf(today)];
    const time = takeTime(sc);
    const part = recurring.part ?? partOf(sc.take(RX.partAlone)?.[1]);
    let minutes = DEFAULT_MINUTES;
    if (time === "midnight") minutes = 0;
    else if (time) minutes = candidates({ ...time, part: time.part ?? part })[0]!;
    else if (part) minutes = PART_DEFAULT[part];
    minutes %= 1440;
    const rule: RecurrenceRule = { freq: recurring.freq, hour: Math.floor(minutes / 60), minute: minutes % 60 };
    if (recurring.freq === "weekly") rule.weekdays = recurring.weekdays;
    if (recurring.freq === "monthly") rule.monthDay = recurring.monthDay ?? today.day;
    return finish({ kind: "recurring" as const, rule, first: nextOccurrence(rule, now, tz) });
  }

  // 3. relative: minutes / hours are elapsed time; days / weeks / months are calendar offsets
  let day: DaySpec | null = null;
  const rel = sc.take(RX.relative);
  if (rel) {
    const unit = rel[3] ?? "";
    let qty = rel[1] ? ({ חצי: 0.5, רבע: 0.25 } as Record<string, number>)[rel[1].split(/\s+/)[0]!] ?? 0.75 : rel[2] ? (hebrewNumber(rel[2]) ?? 1) : 1;
    if (/יים$/.test(unit)) qty = 2; // שעתיים / יומיים / שבועיים / חודשיים
    if (rel[4]) qty += rel[4] === "חצי" ? 0.5 : 0.25;
    const minutesPer = rel[1] ? 60 : unit.startsWith("דק") ? 1 : unit.startsWith("שע") ? 60 : 0;
    if (minutesPer || !Number.isInteger(qty)) {
      const perUnit = minutesPer || (unit.startsWith("יו") || unit.startsWith("ימ") ? 1440 : unit.startsWith("שבו") ? 10080 : 43200);
      const at = new Date(now.getTime() + Math.round(qty * perUnit) * 60_000);
      return finish({ kind: "once" as const, at, inPast: false, hasTime: true });
    }
    if (unit.startsWith("יו") || unit.startsWith("ימ")) day = { t: "offset", days: qty };
    else if (unit.startsWith("שבו")) day = { t: "offset", days: qty * 7 };
    else day = { t: "months", months: qty };
  }

  // 4. calendar day
  if (!day) {
    const nd = sc.take(RX.numericDate, (x) => validDate(Number(x[1]), Number(x[2])));
    const md = nd ? null : sc.take(RX.monthDate, (x) => validDate(Number(x[1]), MONTHS[x[2]!] ?? 0));
    if (nd) day = { t: "date", day: Number(nd[1]), month: Number(nd[2]), year: nd[3] ? (nd[3].length === 2 ? 2000 + Number(nd[3]) : Number(nd[3])) : null };
    else if (md) day = { t: "date", day: Number(md[1]), month: MONTHS[md[2]!]!, year: md[3] ? Number(md[3]) : null };
    if (day) takeWeekday(sc); // "ביום ה׳ 22.10" — the explicit date wins; drop the weekday from the text
  }
  let weekday: { wd: number; next: boolean } | null = null;
  if (!day && sc.take(RX.nextWeek)) day = { t: "nextWeek" };
  if (!day || day.t === "nextWeek") {
    weekday = takeWeekday(sc);
    if (weekday && !day) day = { t: "weekday", ...weekday };
  }
  let todayPart: Part | null = null;
  if (!day) {
    const w = sc.take(RX.dayWord);
    if (w) day = w[1] === "היום" ? { t: "today" } : w[1] === "מחר" ? { t: "tomorrow" } : { t: "offset", days: 2 };
    else {
      const tp = sc.take(RX.todayPart);
      if (tp) {
        day = { t: "today" };
        todayPart = partOf(tp[1]!.slice(1));
      }
    }
  }

  // 5. time of day
  const time = takeTime(sc);
  const part = todayPart ?? (time && time !== "midnight" && time.part ? null : partOf(sc.take(RX.partAlone)?.[1]));
  let mins: number[] | null = null;
  if (time === "midnight") mins = [1440];
  else if (time) mins = candidates({ ...time, part: time.part ?? part });
  else if (part) mins = [PART_DEFAULT[part]];
  const hasTime = mins !== null;

  if (!day && !mins) return null;
  const once = (at: Date, timeGiven = hasTime) => finish({ kind: "once" as const, at, inPast: at.getTime() <= now.getTime(), hasTime: timeGiven });

  if (!day) {
    // time only: the next occurrence (today if still ahead, else tomorrow)
    return once(firstFuture(today, mins!) ?? instant(addDays(today, 1), mins![0]!));
  }

  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;
  switch (day.t) {
    case "today":
      if (!mins) return null; // "היום" alone — ask for a time
      return once(firstFuture(today, mins) ?? instant(today, mins.at(-1)!));
    case "tomorrow": {
      const m = mins?.[0] ?? DEFAULT_MINUTES;
      // in the small hours "מחר" usually means the coming morning (the same calendar date); the next date is kept as
      // `nextDay`, so the reply can name the date and offer it in one tap
      if (nowLocal.hour < SMALL_HOURS_END) {
        const sameDate = instant(today, m);
        if (sameDate.getTime() > now.getTime()) return finish({ kind: "once" as const, at: sameDate, inPast: false, hasTime, nextDay: instant(addDays(today, 1), m) });
      }
      return once(instant(addDays(today, 1), m));
    }
    case "offset":
      return once(instant(addDays(today, day.days), mins?.[0] ?? nowMinutes), true);
    case "months":
      return once(instant(addMonths(today, day.months), mins?.[0] ?? nowMinutes), true);
    case "weekday": {
      let diff = (day.wd - nowLocal.weekday + 7) % 7;
      if (diff === 0) {
        // naming today's weekday: today only if the (morning-preferred) time is still ahead
        if (!day.next) {
          const t = firstFuture(today, [mins?.[0] ?? DEFAULT_MINUTES]);
          if (t) return once(t);
        }
        diff = 7;
      }
      return once(instant(addDays(today, diff), mins?.[0] ?? DEFAULT_MINUTES));
    }
    case "nextWeek": {
      const toSunday = (7 - nowLocal.weekday) % 7 || 7;
      return once(instant(addDays(today, toSunday + (weekday?.wd ?? 0)), mins?.[0] ?? DEFAULT_MINUTES));
    }
    case "date": {
      let d: LocalDate = { year: day.year ?? today.year, month: day.month, day: day.day };
      if (d.day > daysInMonth(d.year, d.month)) return null; // 29.2 in a non-leap year
      if (day.year === null && compareDates(d, today) < 0) d = { ...d, year: d.year + 1 };
      if (compareDates(d, today) === 0) return once(firstFuture(today, mins ?? [DEFAULT_MINUTES]) ?? instant(today, (mins ?? [DEFAULT_MINUTES]).at(-1)!));
      return once(instant(d, mins?.[0] ?? DEFAULT_MINUTES));
    }
  }
}

function takeRecurring(sc: Scanner, today: LocalDate): { freq: RecurrenceRule["freq"]; weekdays?: number[]; monthDay?: number; part?: Part | null } | null {
  if (sc.take(RX.workdays)) return { freq: "weekly", weekdays: [...WORKDAYS] };
  const list = sc.take(RX.weekdaysList);
  if (list) {
    const days = [...list[1]!.matchAll(DAY_TOKEN_RX)].map((t) => weekdayFromToken(t[1]!)).filter((d): d is number => d !== null);
    return { freq: "weekly", weekdays: [...new Set(days)].sort((a, b) => a - b) };
  }
  const daily = sc.take(RX.daily);
  if (daily) return { freq: "daily", part: daily[1] === "יום" ? null : partOf(daily[1]) };
  if (sc.take(RX.weekly)) return { freq: "weekly" };
  const monthly = sc.take(RX.monthly, (x) => {
    const d = Number(x[1] ?? x[2] ?? x[3] ?? today.day);
    return d >= 1 && d <= 31;
  });
  if (monthly) {
    const d = monthly[1] ?? monthly[2] ?? monthly[3];
    return { freq: "monthly", monthDay: d ? Number(d) : undefined };
  }
  return null;
}
