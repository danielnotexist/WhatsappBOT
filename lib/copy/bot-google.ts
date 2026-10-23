/**
 * Google-specific strings (Milestone 6), keyed by the ids in docs/copy/bot-copy-google.md (source of truth; a test
 * checks every id is documented). Shared strings (err.connection_expired, act.cal.*, onb.connect_link …) stay in
 * lib/copy/bot.ts and are reused with the provider label "Google".
 */
import { BRAND } from "@/lib/brand";
import { GOOGLE_SCOPES } from "@/lib/google/oauth";

export const GOOGLE_LABEL = "Google";

/** Hebrew capability phrases per phase-1 scope: what works, and the infinitive for "cannot …". */
export const GOOGLE_CAPABILITY: Record<string, { can: string; cannot: string }> = {
  [GOOGLE_SCOPES.calendarEvents]: { can: "יומן Google — הצגה, קביעה, הזזה וביטול של פגישות", cannot: "לנהל את היומן" },
  [GOOGLE_SCOPES.gmailSend]: { can: "שליחת מיילים מ-Gmail, אחרי אישור בכפתור", cannot: "לשלוח מיילים מ-Gmail" },
  [GOOGLE_SCOPES.driveFile]: { can: "קבצים ב-Drive שנוצרו או נפתחו דרכי", cannot: "לגשת לקבצים ב-Drive" },
  [GOOGLE_SCOPES.gmailReadonly]: { can: "קריאה, חיפוש וסיכום של מיילים ב-Gmail", cannot: "לקרוא מיילים ב-Gmail" },
  [GOOGLE_SCOPES.tasks]: { can: "הצגה והוספה של משימות ב-Google Tasks", cannot: "לנהל משימות ב-Google Tasks" },
  [GOOGLE_SCOPES.driveReadonly]: { can: "חיפוש וקריאה של כל הקבצים ב-Drive, כולל Docs, Sheets ו-Slides", cannot: "לחפש ולקרוא את כל הקבצים ב-Drive" },
};

/** Scopes that map to a user-visible capability (OIDC scopes excluded). */
export const GOOGLE_CAPABILITY_SCOPES = Object.keys(GOOGLE_CAPABILITY);

const joinHe = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ו${items.at(-1)}`);

/** The one-line heads-up before Google's "unverified app" screen (owner's wording, 21.10.2026). */
const UNVERIFIED_HEADS_UP = "גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.";

export const gcopy = {
  // ---- WhatsApp ----
  "g.connect_done": (accountEmail: string, granted: string[], opts: { gmailReadDeclined?: boolean } = {}) => {
    const can = granted.map((s) => GOOGLE_CAPABILITY[s]?.can).filter(Boolean) as string[];
    const readsInbox = granted.includes(GOOGLE_SCOPES.gmailReadonly);
    const inboxNote = readsInbox ? "" : opts.gmailReadDeclined ? "\nאת תיבת ה-Gmail אני לא קוראת, כי ההרשאה לכך לא סומנה. אפשר לבקש ממני בהמשך לקרוא מיילים, ואשלח קישור לאישור." : "\nאת תיבת ה-Gmail עצמה אני לא קוראת בשלב זה.";
    return `החיבור ל-Google הושלם (${accountEmail}).${can.length ? `\nמעכשיו אפשר לבקש ממני:\n${can.map((c) => `• ${c}`).join("\n")}` : ""}${inboxNote}`;
  },
  "g.unverified_heads_up": () => UNVERIFIED_HEADS_UP,
  "g.gmail_read.consent": (link: string, headsUp: boolean) => `כדי שאוכל לקרוא את תיבת ה-Gmail צריך אישור נוסף אחד מ-Google:\n${link}\n${headsUp ? `${UNVERIFIED_HEADS_UP}\n` : ""}הקישור עובד ל-30 הדקות הקרובות.`,
  "g.gmail_read.consent_no_link": () => 'כדי שאוכל לקרוא את תיבת ה-Gmail צריך אישור נוסף מ-Google. אפשר לכתוב "לחבר את גוגל" ואשלח קישור.',
  "g.err.gmail_read_cap_reached": () => "קריאת מיילים ב-Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.",
  // ---- Drive read (drive.readonly, restricted: the same user cap as Gmail read) ----
  "g.drive_read.consent": (link: string, headsUp: boolean) => `כדי שאוכל לחפש ולקרוא את כל הקבצים ב-Drive (כולל Docs, Sheets ו-Slides) צריך אישור נוסף אחד מ-Google:\n${link}\n${headsUp ? `${UNVERIFIED_HEADS_UP}\n` : ""}הקישור עובד ל-30 הדקות הקרובות.`,
  "g.drive_read.consent_no_link": () => 'כדי שאוכל לקרוא את כל הקבצים ב-Drive צריך אישור נוסף מ-Google. אפשר לכתוב "לחבר את גוגל" ואשלח קישור.',
  "g.err.drive_read_cap_reached": () => "קריאה של כל הקבצים ב-Drive פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. קבצים שנוצרו דרכי, היומן ו-Gmail ממשיכים לעבוד.",
  "g.err.drive_read_unavailable": () => "קריאה של כל הקבצים ב-Drive אינה זמינה כרגע. קבצים שנוצרו דרכי, היומן ו-Gmail ממשיכים לעבוד.",
  // ---- Google Tasks (tasks, sensitive; connections made before 23.10.2026 add it incrementally) ----
  "g.tasks.consent": (link: string, headsUp: boolean) => `כדי שאוכל לעבוד עם Google Tasks צריך אישור נוסף אחד מ-Google:\n${link}\n${headsUp ? `${UNVERIFIED_HEADS_UP}\n` : ""}הקישור עובד ל-30 הדקות הקרובות.`,
  "g.tasks.consent_no_link": () => 'כדי שאוכל לעבוד עם Google Tasks צריך אישור נוסף מ-Google. אפשר לכתוב "לחבר את גוגל" ואשלח קישור.',
  "g.tasks.created": (title: string, list: string, due: string | null) => `נוספה משימה ל-${list}: ${title}${due ? `, עד ${due}` : ""}.`,
  "g.connect_partial": (missing: string[], link: string) => {
    const cannot = missing.map((s) => GOOGLE_CAPABILITY[s]?.cannot).filter(Boolean) as string[];
    return `חלק מההרשאות לא סומנו במסך של Google, ולכן לא אוכל ${joinHe(cannot)}.\nאם זה היה בטעות — אפשר לאשר שוב כאן:\n${link}\nהקישור עובד ל-30 הדקות הקרובות.`;
  },
  "g.mail.sent": (toName: string, accountEmail: string) => `נשלח אל ${toName} מתיבת ה-Gmail (${accountEmail}).`,
  "g.err.missing_scope": (scope: string, link: string) => `אין לי הרשאה ${GOOGLE_CAPABILITY[scope]?.cannot ?? "לפעולה הזו"} בחשבון Google — כנראה שהאפשרות לא סומנה במסך האישור. אפשר להוסיף אותה כאן:\n${link}\nהקישור עובד ל-30 הדקות הקרובות.`,
  "g.err.gmail_read_unavailable": () => "קריאה וסיכום של מיילים ב-Gmail אינם זמינים כרגע. שליחת מיילים מ-Gmail, היומן וקבצי Drive עובדים.",
  "g.err.attachment_too_large": () => "הקובץ גדול מדי לצירוף למייל (עד 18MB). אפשר לשלוח במקום קישור לקובץ ב-Drive.",
  "g.cal.moved_all_day": (title: string, newDate: string) => `הוזז. ${title} עכשיו ב-${newDate} (כל היום).`,
  "g.err.event_gone": () => "הפגישה הזו כבר לא נמצאת ביומן — ייתכן שנמחקה או הוזזה. אפשר לבקש ממני להציג את היומן מחדש.",

  // ---- web (query-string notices on /account and /start/*) ----
  "g.web.connected": (accountEmail: string) => `החיבור ל-Google הושלם (${accountEmail}).`,
  "g.web.connected_partial": (accountEmail: string, missing: string[]) => `החיבור ל-Google הושלם (${accountEmail}), אבל לא ניתנה הרשאה ${joinHe(missing.map((s) => GOOGLE_CAPABILITY[s]?.cannot).filter(Boolean) as string[])}. אפשר לחבר שוב ולסמן את כל האפשרויות.`,
  "g.web.denied": () => "החיבור ל-Google בוטל במסך האישור. אפשר לנסות שוב בכל רגע.",
  "g.web.admin_blocked": () => "מנהל חשבון ה-Google Workspace של הארגון חוסם חיבור של אפליקציות חיצוניות. כדי לאפשר, מנהל המערכת מאשר את האפליקציה ב-Admin console (Security → API controls → App access control).",
  "g.web.state_unknown": () => "החיבור לא הושלם: הבקשה לא זוהתה (אולי הקישור פג). אפשר להתחיל שוב.",
  "g.web.failed": (code: string) => `החיבור ל-Google לא הושלם (${code}). אפשר לנסות שוב.`,
  "g.web.no_email": () => "החיבור ל-Google לא הושלם: Google לא החזירה כתובת מייל לחשבון. אפשר לנסות שוב ולאשר את שיתוף כתובת המייל.",
  "g.web.link_expired": () => "הקישור לא בתוקף (הוא עובד 30 דקות). אפשר לבקש קישור חדש בשיחה.",
  "g.web.feature_disabled": () => "קריאת Gmail אינה זמינה כרגע. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.",
  "g.web.gmail_read_cap_reached": () => "קריאת Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.",
  "g.web.drive_read_disabled": () => `קריאה של כל הקבצים ב-Drive אינה זמינה כרגע. היומן, Gmail וקבצים שנוצרו דרך ${BRAND.name} ממשיכים לעבוד.`,
  "g.web.drive_read_cap_reached": () => `קריאה של כל הקבצים ב-Drive פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Gmail וקבצים שנוצרו דרך ${BRAND.name} ממשיכים לעבוד.`,
} as const;

export type GoogleCopyId = keyof typeof gcopy;
