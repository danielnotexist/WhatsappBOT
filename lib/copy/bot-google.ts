/**
 * Google-specific strings (Milestone 6), keyed by the ids in docs/copy/bot-copy-google.md (source of truth; a test
 * checks every id is documented). Shared strings (err.connection_expired, act.cal.*, onb.connect_link …) stay in
 * lib/copy/bot.ts and are reused with the provider label "Google".
 */
import { GOOGLE_SCOPES } from "@/lib/google/oauth";

export const GOOGLE_LABEL = "Google";

/** Hebrew capability phrases per phase-1 scope: what works, and the infinitive for "cannot …". */
export const GOOGLE_CAPABILITY: Record<string, { can: string; cannot: string }> = {
  [GOOGLE_SCOPES.calendarEvents]: { can: "יומן Google — הצגה, קביעה, הזזה וביטול של פגישות", cannot: "לנהל את היומן" },
  [GOOGLE_SCOPES.gmailSend]: { can: "שליחת מיילים מ-Gmail, אחרי אישור בכפתור", cannot: "לשלוח מיילים מ-Gmail" },
  [GOOGLE_SCOPES.driveFile]: { can: "קבצים ב-Drive שנוצרו או נפתחו דרכי", cannot: "לגשת לקבצים ב-Drive" },
  [GOOGLE_SCOPES.gmailReadonly]: { can: "קריאה, חיפוש וסיכום של מיילים ב-Gmail", cannot: "לקרוא מיילים ב-Gmail" },
};

/** Scopes that map to a user-visible capability (OIDC scopes excluded). */
export const GOOGLE_CAPABILITY_SCOPES = Object.keys(GOOGLE_CAPABILITY);

const joinHe = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ו${items.at(-1)}`);

export const gcopy = {
  // ---- WhatsApp ----
  "g.connect_done": (accountEmail: string, granted: string[]) => {
    const can = granted.map((s) => GOOGLE_CAPABILITY[s]?.can).filter(Boolean) as string[];
    const readsInbox = granted.includes(GOOGLE_SCOPES.gmailReadonly);
    return `החיבור ל-Google הושלם (${accountEmail}).${can.length ? `\nמעכשיו אפשר לבקש ממני:\n${can.map((c) => `• ${c}`).join("\n")}` : ""}${readsInbox ? "" : "\nאת תיבת ה-Gmail עצמה אני לא קורא בשלב זה."}`;
  },
  "g.connect_partial": (missing: string[], link: string) => {
    const cannot = missing.map((s) => GOOGLE_CAPABILITY[s]?.cannot).filter(Boolean) as string[];
    return `חלק מההרשאות לא סומנו במסך של Google, ולכן לא אוכל ${joinHe(cannot)}.\nאם זה היה בטעות — אפשר לאשר שוב כאן:\n${link}\nהקישור עובד ל-30 הדקות הקרובות.`;
  },
  "g.mail.sent": (toName: string, accountEmail: string) => `נשלח אל ${toName} מתיבת ה-Gmail (${accountEmail}).`,
  "g.err.missing_scope": (scope: string, link: string) => `אין לי הרשאה ${GOOGLE_CAPABILITY[scope]?.cannot ?? "לפעולה הזו"} בחשבון Google — כנראה שהאפשרות לא סומנה במסך האישור. אפשר להוסיף אותה כאן:\n${link}\nהקישור עובד ל-30 הדקות הקרובות.`,
  "g.err.gmail_read_unavailable": () => "קריאה וסיכום של מיילים ב-Gmail עדיין לא זמינים — היכולת תתווסף אחרי בדיקת האבטחה של Google. שליחת מיילים מ-Gmail, היומן וקבצי Drive כבר עובדים.",
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
  "g.web.feature_disabled": () => "קריאת Gmail עדיין לא זמינה: היא דורשת בדיקת אבטחה של Google (CASA) שטרם הושלמה.",
} as const;

export type GoogleCopyId = keyof typeof gcopy;
