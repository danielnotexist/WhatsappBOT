/**
 * Meeting summaries (pro) — docs/copy/bot-copy-meetings.md; a test checks every id is documented.
 * Neutral phrasing (infinitives, plural, "אפשר"), the assistant in the feminine, no "שלח/י" forms. Titles, names and
 * the summary's lines came from a calendar or a transcript and were already made one sanitized line each.
 */

export interface SummaryView {
  title: string;
  /** "יום ה׳ 22.10, 10:00" */
  when: string;
  platform: string;
  summary: string;
  decisions: string[];
  /** rendered action lines (mcopy["mt.action_line"]) */
  actions: string[];
  questions: string[];
  partial?: boolean;
}

const bullets = (lines: string[]) => lines.map((l) => `• ${l}`).join("\n");
const section = (title: string, lines: string[]) => (lines.length ? `\n\n*${title}*\n${bullets(lines)}` : "");

export const mcopy = {
  // ---- the summary in the chat ----
  "mt.summary": (v: SummaryView) =>
    `*סיכום הפגישה: ${v.title}*\n${v.when} · ${v.platform}\n\n${v.summary}${section("החלטות", v.decisions)}${section("משימות", v.actions)}${section("שאלות פתוחות", v.questions)}${v.partial ? "\n\n(הפגישה ארוכה במיוחד, והסיכום מכסה את רובה.)" : ""}`,
  "mt.action_line": (task: string, owner: string | null, due: string | null) => `${task}${owner || due ? ` (${[owner, due ? `עד ${due}` : ""].filter(Boolean).join(", ")})` : ""}`,
  "mt.actions.body": () => "מה לעשות עם הסיכום? שום דבר לא יוצא בלי אישור.",

  // ---- the summary mail (a draft to approve, in the user's name) ----
  "mt.mail.subject": (title: string) => `סיכום פגישה: ${title}`,
  "mt.mail.body": (v: { title: string; date: string; summary: string; decisions: string[]; actions: string[]; questions: string[]; signature: string }) =>
    [
      "שלום לכולם,",
      "",
      `תודה על הפגישה (${v.title}, ${v.date}). הנה סיכום קצר:`,
      "",
      v.summary,
      ...(v.decisions.length ? ["", "החלטות:", ...v.decisions.map((d) => `• ${d}`)] : []),
      ...(v.actions.length ? ["", "משימות:", ...v.actions.map((a) => `• ${a}`)] : []),
      ...(v.questions.length ? ["", "שאלות פתוחות:", ...v.questions.map((q) => `• ${q}`)] : []),
      "",
      "אם משהו חסר או לא מדויק, אשמח לתיקון.",
      "",
      "בברכה,",
      v.signature,
    ].join("\n"),
  "mt.mail.no_attendees": () => "בפגישה הזו אין משתתפים נוספים עם כתובת מייל, ולכן אין למי לשלוח את הסיכום.",

  // ---- the tasks document ----
  "mt.doc.title": (title: string, date: string) => `משימות מהפגישה - ${title} (${date})`,
  "mt.doc.body": (v: { title: string; date: string; actions: string[]; decisions: string[]; questions: string[] }) =>
    [
      `משימות מהפגישה: ${v.title}`,
      v.date,
      "",
      "משימות",
      ...v.actions.map((a) => `☐ ${a}`),
      ...(v.decisions.length ? ["", "החלטות", ...v.decisions.map((d) => `• ${d}`)] : []),
      ...(v.questions.length ? ["", "שאלות פתוחות", ...v.questions.map((q) => `• ${q}`)] : []),
    ].join("\n"),
  "mt.doc.saved": (name: string, link: string | null) => `שמרתי את מסמך המשימות ב-Google Drive: ״${name}״.${link ? `\n${link}` : ""}`,
  "mt.doc.in_chat": (title: string, actions: string[]) => `בחשבון הזה אין לי אפשרות לשמור מסמך חדש, אז הנה רשימת המשימות מהפגישה ״${title}״, מוכנה להעתקה:\n\n${actions.map((a) => `☐ ${a}`).join("\n")}`,
  "mt.doc.already": (link: string | null) => `מסמך המשימות של הפגישה הזו כבר נשמר.${link ? `\n${link}` : ""}`,

  // ---- the task list ----
  "mt.tasks.added": (count: number, service: string, titles: string[]) => `${count === 1 ? "הוספתי משימה אחת" : `הוספתי ${count} משימות`} ל-${service}:\n${bullets(titles)}`,
  "mt.tasks.partial": (added: number, total: number, service: string) => `הוספתי ${added} מתוך ${total} משימות ל-${service}. את השאר לא הצלחתי להוסיף, ואפשר לבקש שוב בעוד כמה דקות.`,
  "mt.tasks.already": () => "המשימות מהפגישה הזו כבר נוספו לרשימה.",
  "mt.tasks.unavailable": () => "כדי להוסיף משימות צריך את Google Tasks או את Microsoft To Do בחשבון המחובר. בינתיים אפשר לבחור ״מסמך משימות״.",
  "mt.empty": () => "בפגישה הזו לא עלו משימות מוגדרות.",

  // ---- asking for a summary in the chat ("סיכום של הפגישה האחרונה", "תסכמי את הפגישה עם כהן") ----
  "mt.queued": (title: string, when: string) => `מכינה את הסיכום של ״${title}״ (${when}). זה לוקח דקה או שתיים, והוא יגיע כאן.`,
  "mt.not_found": (query: string) =>
    query ? `לא מצאתי פגישה מקוונת שהסתיימה בשבועיים האחרונים ומתאימה ל״${query}״. אפשר לכתוב את שם הפגישה או את שם אחד המשתתפים.` : "לא מצאתי פגישה מקוונת שהסתיימה בשבועיים האחרונים.",
  "mt.not_ended": (title: string) => `הפגישה ״${title}״ עוד לא הסתיימה. כשהיא תסתיים והתמליל יהיה מוכן, אשלח את הסיכום כאן.`,
  "mt.zoom_soon": () => "סיכום של פגישות Zoom עוד לא זמין (בקרוב). כרגע אפשר לסכם פגישות Teams ו-Google Meet.",
  "mt.other_platform": () => "אפשר לסכם רק פגישות Teams ו-Google Meet. לפגישה הזו אין קישור של אחת מהן.",

  // ---- why there is no summary (on request only — the automatic ones stay quiet) ----
  "mt.no_transcript": (title: string, platform: string) =>
    `לא נמצא תמליל של ״${title}״. הסיכום נבנה מהתמליל ש-${platform} שומרת, ולכן צריך להפעיל תמלול בפגישה עצמה (ב-Teams: ״התחלת תמלול״; ב-Meet: ״תמליל״, בחשבונות Google Workspace שכוללים אותו).`,
  "mt.not_ready": (title: string) => `התמליל של ״${title}״ עוד לא מוכן. אנסה שוב בעוד כמה דקות, והסיכום יגיע כאן.`,
  "mt.no_access": (title: string) => `אין לי גישה לתמליל של ״${title}״. בדרך כלל רק מי שארגן את הפגישה יכול לקרוא את התמליל שלה.`,
  "mt.consent.teams": (link: string) => `כדי לסכם פגישות Teams צריך הרשאה נוספת: קריאת תמלילי פגישות. חיבור מחדש לוקח חצי דקה:\n${link}`,
  "mt.consent.teams_admin": (link: string) =>
    `כדי לסכם פגישות Teams צריך הרשאה לקריאת תמלילי פגישות, ובארגון שלך רק מנהל ה-IT יכול לאשר אותה. אפשר להעביר לו את הקישור הזה (אישור חד-פעמי לכל הארגון):\n${link}\nאחרי האישור צריך לחבר את החשבון מחדש — ״חבר שוב״.`,
  "mt.consent.meet": () => "כדי לסכם פגישות Google Meet צריך הרשאה לקרוא את התמליל ש-Meet שומרת ב-Drive.",
  "mt.failed": () => "לא הצלחתי להכין את הסיכום הפעם. אפשר לבקש שוב בעוד כמה דקות.",

  // ---- the user's control ----
  "mt.off": () => "בסדר, בלי סיכומי פגישות אוטומטיים. אפשר עדיין לבקש סיכום של פגישה מסוימת, ולהחזיר אותם — ״להחזיר סיכומי פגישות״.",
  "mt.on": () => "סיכומי הפגישות חזרו: אחרי כל פגישת Teams או Google Meet עם תמליל, הסיכום יגיע כאן.",
  "mt.already_off": () => "סיכומי הפגישות האוטומטיים כבר כבויים. להחזיר אותם — ״להחזיר סיכומי פגישות״.",
  "mt.already_on": () => "סיכומי הפגישות פעילים. לכבות אותם — ״בלי סיכומי פגישות״.",
  "mt.pro_only": () => "סיכומי פגישות Teams ו-Google Meet כלולים במסלול פרו. לשדרוג אפשר לכתוב ״שדרוג״.",
  "mt.gone": () => "הסיכום הזה כבר לא זמין (סיכומים נשמרים 30 יום). אפשר לבקש סיכום חדש של הפגישה.",
} as const;

export type McopyId = keyof typeof mcopy;

/** Button titles (WhatsApp: ≤ 20 characters). */
export const meetingButtons = {
  mail: "מייל למשתתפים",
  doc: "מסמך משימות",
  tasks: "להוסיף למשימות",
  show: "לראות את הסיכום",
  off: "בלי סיכומי פגישות",
} as const;
