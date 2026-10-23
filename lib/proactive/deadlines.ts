import { DEFAULT_TZ, addDays, compareDates, daysInMonth, localDateOf, weekdayOf, type LocalDate } from "@/lib/time/zoned";

/**
 * Deadlines written in a mail ("נשמח לתשובה עד יום חמישי", "להגיש עד ה-30.10", "by Friday") — deterministic, read
 * relative to the day the mail was sent. The phrase must be tied to a deadline word ("עד", "לא יאוחר מ", "מועד
 * אחרון", "deadline", "by") so that a date in a signature or a meeting time is not taken for one. A deadline word
 * with a date we cannot read is `hasDeadlineCue` — the only case a cheap model call may resolve (lib/proactive/classify.ts).
 */

export interface Deadline {
  date: LocalDate;
  /** the words in the mail, as written (one line, short) — shown only through oneLineUntrusted */
  phrase: string;
}

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/^(ראשון|א)$/, 0],
  [/^(שני|ב)$/, 1],
  [/^(שלישי|ג)$/, 2],
  [/^(רביעי|ד)$/, 3],
  [/^(חמישי|ה)$/, 4],
  [/^(שישי|ו)$/, 5],
];
const EN_WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };

const G = "['׳’`]"; // geresh variants
const LEAD = String.raw`(?:עד\s+ולא\s+יאוחר\s+מ|לא\s+יאוחר\s+מ|עד|מועד\s+אחרון[:\s]*|דדליין[:\s]*|deadline[:\s]*|due(?:\s+(?:by|on))?|by|no\s+later\s+than)`;

const RX = {
  // "עד יום חמישי", "עד יום ה׳", "עד ה׳", "עד חמישי"
  heWeekday: new RegExp(String.raw`(?:^|[^א-ת])${LEAD}\s*(?:ה|ל)?(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|(?:[אבגדהו])${G})(?![א-ת])`, "i"),
  // "עד ה-30.10", "עד 30/10/2026", "deadline: 30.10"
  date: new RegExp(String.raw`(?:^|[^א-ת\w])${LEAD}\s*(?:ה-?|ל-?|ה־)?\s*(?:יום\s+[א-ת]{1,6}${G}?\s*,?\s*)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)`, "i"),
  tomorrow: new RegExp(String.raw`(?:^|[^א-ת])(?:עד|לא\s+יאוחר\s+מ)\s*(?:ה)?מחר(?![א-ת])|\bby\s+tomorrow\b`, "i"),
  today: new RegExp(String.raw`(?:^|[^א-ת])(?:עד\s+(?:סוף\s+)?היום|עוד\s+היום)(?![א-ת])|\bby\s+(?:today|eod|end\s+of\s+(?:the\s+)?day)\b`, "i"),
  endOfWeek: new RegExp(String.raw`(?:^|[^א-ת])עד\s+סוף\s+(?:ה)?שבוע(?![א-ת])|\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week\b`, "i"),
  endOfMonth: new RegExp(String.raw`(?:^|[^א-ת])עד\s+סוף\s+(?:ה)?חודש(?![א-ת])|\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?month\b`, "i"),
  enWeekday: /\b(?:by|until|due(?:\s+on)?|no\s+later\s+than)\s+(?:this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday)\b/i,
};

/** A deadline word, with or without a date we could read. */
const CUE = /(?:^|[^א-ת])ה?(?:לא\s+יאוחר\s+מ|מועד\s+(?:ה)?אחרון|מועד\s+(?:ה)?הגשה|דדליין|תאריך\s+יעד)|\bdeadline\b|\bdue\s+(?:date|by)\b/i;

export function hasDeadlineCue(text: string): boolean {
  return CUE.test(text);
}

/** The first `weekday` strictly after `from` (a mail sent on Thursday saying "עד יום חמישי" means the next one). */
function nextWeekday(from: LocalDate, weekday: number): LocalDate {
  const diff = (weekday - weekdayOf(from) + 7) % 7 || 7;
  return addDays(from, diff);
}

function phraseAt(text: string, index: number, length: number): string {
  return text
    .slice(Math.max(0, index), index + length)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** The deadline the mail names, read relative to the day it was sent (in `tz`), or null. */
export function extractDeadline(text: string, sentAt: Date, tz: string = DEFAULT_TZ): Deadline | null {
  const sent = localDateOf(sentAt, tz);
  const found: { date: LocalDate; index: number; phrase: string }[] = [];
  const add = (m: RegExpExecArray | null, date: (m: RegExpExecArray) => LocalDate | null) => {
    if (!m) return;
    const d = date(m);
    if (d) found.push({ date: d, index: m.index, phrase: phraseAt(text, m.index, m[0].length + 1) });
  };

  add(RX.date.exec(text), (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || day < 1) return null;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : sent.year;
    if (!m[3] && compareDates({ year, month, day: Math.min(day, daysInMonth(year, month)) }, addDays(sent, -1)) < 0) year += 1; // "30.1" written in December
    if (day > daysInMonth(year, month)) return null;
    return { year, month, day };
  });
  add(RX.heWeekday.exec(text), (m) => {
    const word = m[1]!.replace(new RegExp(G, "g"), "");
    const hit = WEEKDAY_WORDS.find(([re]) => re.test(word));
    return hit ? nextWeekday(sent, hit[1]) : null;
  });
  add(RX.enWeekday.exec(text), (m) => nextWeekday(sent, EN_WEEKDAYS[m[1]!.toLowerCase()]!));
  add(RX.tomorrow.exec(text), () => addDays(sent, 1));
  add(RX.today.exec(text), () => sent);
  add(RX.endOfWeek.exec(text), () => (weekdayOf(sent) <= 4 ? addDays(sent, 4 - weekdayOf(sent)) : nextWeekday(sent, 4)));
  add(RX.endOfMonth.exec(text), () => ({ year: sent.year, month: sent.month, day: daysInMonth(sent.year, sent.month) }));

  const first = found.sort((a, b) => a.index - b.index)[0];
  return first ? { date: first.date, phrase: first.phrase } : null;
}
