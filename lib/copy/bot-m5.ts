/**
 * Milestone 5 strings (reminders, morning summary, voice notes) — kept apart from lib/copy/bot.ts.
 * Ids come from docs/copy/bot-copy.md §4.4 / §4.5 / §5, plus the few new ones in docs/copy/bot-copy-m5.md;
 * a test checks every id here is documented in one of the two. Neutral phrasing, no "שלח/י" forms.
 */
import type { ReplyButton } from "@/lib/wa/types";

export interface ReminderLine {
  whenAbs: string;
  text: string;
}

export interface MorningSummaryParts {
  dayLabel: string;
  meetings: string[];
  emails: string[];
  reminders: string[];
  /** pro: "דברים שכדאי לא לפספס" (docs/copy/bot-copy-proactive.md) — first, right under the greeting */
  dontMiss?: string[];
  closer: string;
}

const bullets = (lines: ReminderLine[]) => lines.map((l) => `• ${l.whenAbs} — ${l.text}`).join("\n");

export const copyM5 = {
  // ---- 4.4 reminders ----
  "act.reminder.set": (whenAbs: string, text: string) => `אזכיר: ${text}\n${whenAbs}`,
  "act.reminder.set_small_hours": (whenAbs: string, text: string, nextDayLabel: string) =>
    `אזכיר: ${text}\n${whenAbs}\n\nאחרי חצות "מחר" הוא בדרך כלל הבוקר הקרוב. אם הכוונה ל${nextDayLabel} — אפשר להעביר בלחיצה.`,
  "act.reminder.moved": (whenAbs: string) => `הועבר. אזכיר ${whenAbs}.`,
  "act.reminder.set_recurring": (ruleLabel: string, firstAbs: string, text: string) => `אזכיר: ${text}\n${ruleLabel}\nהפעם הראשונה: ${firstAbs}`,
  "act.reminder.set_ambiguous_time": (text: string) => `מתי להזכיר על "${text}"? למשל "מחר ב-9" או "יום ה׳ אחרי הצהריים".`,
  "act.reminder.past_time": (whenAbs: string) => `${whenAbs} כבר עבר. מתי להזכיר במקום?`,
  "act.reminder.fired": (text: string) => `⏰ תזכורת: ${text}`,
  "act.reminder.snoozed": (whenAbs: string) => `דחיתי. אזכיר שוב ${whenAbs}.`,
  "act.reminder.done": () => "סומן כטופל.",
  "act.reminder.list": (lines: ReminderLine[]) => `*תזכורות פתוחות*\n${bullets(lines)}\n\nלמחוק או להזיז אחת מהן — פשוט לכתוב.`,
  "act.reminder.none": () => "אין תזכורות פתוחות כרגע.",
  "act.reminder.cancelled": (text: string) => `התזכורת "${text}" בוטלה.`,
  "act.reminder.which": (lines: ReminderLine[]) => `יש כמה תזכורות שמתאימות:\n${bullets(lines)}\n\nאיזו מהן לבטל?`,
  "act.reminder.not_found": () => `לא מצאתי תזכורת פתוחה כזו. כדי לראות את כולן — "אילו תזכורות יש לי?"`,
  "act.reminder.limit": () => "יש כבר הרבה תזכורות פתוחות. כדאי לבטל כמה מהן לפני שמוסיפים חדשות.",

  // ---- 4.5 morning summary ----
  "act.morning.summary": (p: MorningSummaryParts) =>
    [
      `*בוקר טוב. ${p.dayLabel}*`,
      p.dontMiss?.length ? `*דברים שכדאי לא לפספס*\n${p.dontMiss.join("\n")}` : "",
      p.meetings.length ? `*פגישות היום*\n${p.meetings.join("\n")}` : "",
      p.emails.length ? `*מיילים שמחכים לתשובה*\n${p.emails.join("\n")}` : "",
      p.reminders.length ? `*תזכורות*\n${p.reminders.join("\n")}` : "",
      p.closer,
    ]
      .filter(Boolean)
      .join("\n\n"),
  "act.morning.empty": (dayLabel: string) => `*בוקר טוב. ${dayLabel}*\nהיומן ריק, אין מיילים שמחכים לתשובה ואין תזכורות. יום שקט.`,
  "act.morning.time_changed": (time: string) => `עודכן. סיכום בוקר ב-${time}.`,
  "act.morning.stopped": () => `סיכום הבוקר הופסק. להפעיל שוב — "סיכום בוקר ב-7:30".`,

  // ---- 5. errors ----
  "err.transcription_failed": () => "לא הצלחתי להבין את ההקלטה — אולי רעש רקע או שהיא קצרה מדי. אפשר להקליט שוב, או לכתוב במילים.",
} as const;

export type CopyM5Id = keyof typeof copyM5;

/** `{closer}` of act.morning.summary — chosen by the situation, never at random (bot-copy.md §4.5). */
export const morningClosers = {
  emails: "רוצה שאנסח תשובה למישהו מהם?",
  busy: "יום צפוף. אם צריך להזיז משהו — אני כאן.",
  free: "היום פנוי ביומן. אם יש משהו לקדם — אפשר להתחיל מכאן.",
  default: "שיהיה יום טוב.",
} as const;

/** Reminder buttons — in-window reply buttons and the `reminder` template's quick replies carry the same ids. */
export const reminderButtons = {
  fired: (reminderId: string) =>
    [
      { id: `rem:done:${reminderId}`, title: "טופל" },
      { id: `rem:hour:${reminderId}`, title: "דחה לשעה" },
      { id: `rem:tmrw:${reminderId}`, title: "דחה למחר" },
    ] satisfies ReplyButton[],
  /**
   * with act.reminder.set_small_hours: the other reading of "מחר" — "ליום ש׳ 24.10". Several reminders set for that
   * morning in one message share one button ("הכול ליום ש׳ 24.10"): two buttons with the same title would be rejected.
   */
  nextDay: (reminderIds: readonly string[], dayLabel: string) =>
    [{ id: `rem:next:${reminderIds.join(",")}`, title: reminderIds.length > 1 ? `הכול ל${dayLabel}` : `ל${dayLabel}` }] satisfies ReplyButton[],
};
