/**
 * Every string the bot sends, keyed by the ids in docs/copy/bot-copy.md (the source of truth — edit there first).
 * A test checks that each id here exists in the document. Placeholders are filled by the functions;
 * The product name comes from lib/brand.ts (עלזה). The assistant speaks about herself in the feminine (docs/copy/style-guide.md).
 */
import { PRODUCT_NAME as P } from "@/lib/brand";
import type { ListRow, ReplyButton } from "@/lib/wa/types";

/** The online meeting service of each calendar: Teams on Microsoft 365, Google Meet on Google. */
export const onlineService = (provider: string) => (provider === "google" ? "Google Meet" : "Teams");
/** `personal`: a personal Microsoft account (lib/online-meeting.ts isPersonalMicrosoftAccount), the only case the reason is known. */
const onlineUnavailable = (provider: string, personal = false) =>
  provider === "google" ? "לא הצלחתי ליצור פגישת Google Meet בחשבון הזה." : `בחשבון Microsoft הזה אין אפשרות ליצור פגישת Teams${personal ? " (היא זמינה רק בחשבון עבודה או בית ספר)" : ""}.`;

/** How an online meeting that could not be created ends: what did not happen, and the next step. */
export interface OnlineNotDone {
  isUpdate: boolean;
  personal?: boolean;
  /** an agent prepared the original and may not prepare the follow-up draft: the main assistant can */
  askMain?: boolean;
  /** a change that also asked for something besides the link */
  somethingLeft?: boolean;
}

export const copy = {
  // ---- 1. account linking ----
  "link.success": () => "החשבון מקושר. מעכשיו אפשר לכתוב לי כאן.",
  "link.token_expired": (siteLink: string) => `הקישור הזה כבר לא בתוקף (הוא עובד 15 דקות ופעם אחת).\nאפשר להפיק קישור חדש באזור האישי:\n${siteLink}`,
  "link.token_invalid": (siteLink: string) => `לא מצאתי קוד כזה. כדאי לבדוק שההודעה נשלחה בדיוק כמו שהופיעה באתר, או להפיק קישור חדש:\n${siteLink}`,
  "link.unknown_number": (siteLink: string) => `היי, כאן ${P} — עוזרת למייל, ליומן ולקבצים של העסק.\nהמספר הזה עדיין לא מקושר לחשבון. ההרשמה לוקחת כדקה:\n${siteLink}`,
  "link.already_linked": () => "המספר הזה כבר מקושר לחשבון שלך. אפשר פשוט לכתוב לי מה צריך.",
  "link.second_phone": (maskedPhone: string, siteLink: string) =>
    `החשבון הזה כבר מקושר למספר אחר (${maskedPhone}).\nלכל חשבון יש מספר וואטסאפ אחד. כדי להעביר את החשבון למספר הזה, נכנסים לאזור האישי ובוחרים "החלפת מספר":\n${siteLink}`,
  "link.number_belongs_to_other": () => "המספר הזה כבר מקושר לחשבון אחר. כדי לקשר אותו לחשבון חדש, קודם מנתקים אותו מהחשבון הקיים באזור האישי.",
  "link.login_link": (loginLink: string) =>
    `הנה קישור כניסה לאזור האישי באתר:\n${loginLink}\nהוא עובד פעם אחת, ל-10 הדקות הקרובות. אם לא ביקשת להיכנס — אפשר להתעלם מההודעה.`,

  // ---- 2. onboarding ----
  "onb.welcome": (name: string | null) =>
    `${name ? `שלום ${name}, ברוכים הבאים ל${P}.` : `ברוכים הבאים ל${P}.`}\nאני עוזרת למייל, ליומן ולקבצים של העסק — ישירות מכאן.\n\nחשוב לדעת: אני רואה רק מה ששולחים לי כאן. לא את שאר השיחות בוואטסאפ, ולא שום דבר שלא חיברת בעצמך.\n\nרוצה סיור של דקה, או שנתחיל ישר לעבוד?`,
  "onb.ways_card": () =>
    `*4 דרכים לעבוד איתי*\n\n• *הקלטה* — מדברים, אני מתמללת ומבצעת. "תנסח תשובה לרונית שאני מאשר את הפגישה."\n• *מייל ויומן* — "מה יש לי מחר?", "מה רונית כתבה?", "תקבע פגישה ביום ג׳ ב-14:00."\n• *קבצים* — "תמצא את ההסכם של כהן", "תשלח לי את ההצעה האחרונה ב-PDF."\n• *תזכורות וסיכום בוקר* — "תזכיר לי מחר ב-9 להתקשר לבנק." וכל בוקר: פגישות, מיילים שמחכים, תזכורות.\n\nכל שליחה החוצה — מייל, פגישה, קובץ — יוצאת רק אחרי אישור שלך בכפתור.`,
  "onb.first_task": () => `ננסה משהו אמיתי. אפשר לשלוח הקלטה קצרה עם מה שעל הצלחת היום — או לכתוב משפט אחד, למשל: "מה יש לי מחר?"`,
  "onb.ask_name": () => "כדי שנדבר בנוח — איך לקרוא לך?",
  "onb.ask_business": (name: string) => `נעים להכיר, ${name}. מה שם העסק או המשרד?`,
  "onb.ask_name_again": () => "ועוד דבר קטן, כדי שנדבר בנוח: איך לקרוא לך?",
  "onb.ask_business_again": () => "ועוד דבר קטן: מה שם העסק או המשרד?",
  "onb.ask_pain": () => "מה הכי מעמיס עליך ביום-יום? זה עוזר לי לדעת במה להתמקד. אפשר לבחור כמה, אחד בכל פעם.",
  "onb.ask_pain_more": () => "עוד משהו שמעמיס? אפשר לבחור, או לסמן שזהו.",
  "onb.pain_ack": (pain: string) =>
    ({
      pain_email: "מובן. אז נתחיל מהתיבה — אני מסכמת מה מחכה ומנסחת תשובות, והאישור נשאר אצלך.",
      pain_calendar: "מובן. היומן אצלי — שאלות, קביעות והזזות, בלי לפתוח את Outlook.",
      pain_followup: "מובן. תזכורות בשפה חופשית, וכל בוקר רשימה של מה שפתוח.",
      pain_files: "מובן. אומרים לי שם של לקוח או נושא, ואני מוצאת את הקובץ ושולחת.",
    })[pain] ?? "מובן.",
  "onb.ask_morning_time": () => "כל בוקר אני יכולה לשלוח סיכום קצר: פגישות היום, מיילים שמחכים לתשובה ותזכורות. באיזו שעה נוח?",
  "onb.morning_time_ack": (time: string) => `סגור. סיכום בוקר ב-${time}, בימי א׳–ה׳. אפשר לשנות בכל רגע — פשוט לכתוב לי.`,
  "onb.morning_time_skip": () => `בסדר גמור. אם בהמשך יתאים לך סיכום בוקר — פשוט לכתוב "סיכום בוקר ב-7:30".`,
  "onb.connect_nudge": () => "כדי שאוכל לעבוד עם המייל והיומן, צריך לחבר את החשבון. זה לוקח חצי דקה ועובד גם מהטלפון.",
  "onb.connect_link": (provider: string, link: string) => `הנה הקישור לחיבור ${provider}:\n${link}\nהוא עובד פעם אחת, ל-30 הדקות הקרובות. אחרי האישור אני אעדכן כאן.`,
  "onb.connect_done": (provider: string, accountEmail: string) => `החיבור ל-${provider} הושלם (${accountEmail}). מעכשיו אפשר לשאול על מיילים, יומן וקבצים.`,
  "onb.connect_skip": () => `בסדר. בלי חיבור אני יכולה לעזור בתזכורות ובניסוח טקסטים. כשיתאים לחבר — לכתוב "לחבר את המייל" ואשלח קישור.`,
  "onb.done": () => "זהו, אנחנו מסודרים. מכאן זה פשוט — כותבים או מקליטים מה צריך, ואני מטפלת.",

  // ---- 3. processing ----
  "proc.one_sec": () => "רגע…",
  "proc.listening": () => "מקשיבה…",
  "proc.transcript_echo": (transcript: string) => `הבנתי כך: "${transcript}"\nממשיכה לפי זה.`,

  // ---- 4. actions ----
  "act.mail.draft": (d: { toName: string; toEmail: string; subject: string; body: string; cc?: string; attachment?: string }) =>
    `*טיוטה למייל*\nאל: ${d.toName ? `${d.toName} (${d.toEmail})` : d.toEmail}\n${d.cc ? `עותק: ${d.cc}\n` : ""}נושא: ${d.subject}\n${d.attachment ? `מצורף: ${d.attachment}\n` : ""}\n> ${d.body.replace(/\n/g, "\n> ")}\n\nלשלוח כך?`,
  "act.mail.sent": (toName: string) => `נשלח ל${toName}. אעדכן כשתגיע תשובה.`,
  "act.mail.edit_prompt": () => "מה לשנות?",
  "act.mail.cancelled": () => "בוטל. הטיוטה נמחקה ולא נשלחה.",
  "act.cal.create_confirm": (e: { title: string; date: string; start: string; end: string; location?: string; attendees?: string; online?: string; withoutLink?: boolean }) =>
    `*פגישה חדשה*\n${e.title}\n${e.date}, ${e.start}–${e.end}\n${e.location ? `מקום: ${e.location}\n` : ""}${e.attendees ? `משתתפים: ${e.attendees}\n` : ""}${e.online ? `${e.online}\n` : ""}\n${e.withoutLink ? "לקבוע בלי קישור?" : "לקבוע?"}`,
  "act.cal.created": (title: string, date: string, start: string) => `נקבע: ${title}, ${date} ב-${start}.`,
  /** the draft line of a meeting that gets a link; `withInvite` = it has attendees, who get the link in the invitation */
  "act.cal.online_label": (provider: string, withInvite = false) => `פגישת ${onlineService(provider)}${withInvite ? " (הקישור יישלח בהזמנה)" : ""}`,
  /** which meeting a change draft is about (title, date, time), above the changes */
  "act.cal.update_target": (title: string, date: string, start: string) => `פגישה: ${title || "(ללא כותרת)"}, ${date}${start ? ` ב-${start}` : ""}`,
  /** the change-draft line that adds an online meeting to a meeting without one */
  "act.cal.add_online": (provider: string) => `הוספת פגישת ${onlineService(provider)}`,
  "act.cal.attendees_notified": (withLink: boolean) => `המשתתפים יקבלו עדכון${withLink ? " עם הקישור" : ""}.`,
  "act.cal.updated": (title: string) => `עודכן: ${title}.`,
  "act.cal.join_link": (url: string) => `קישור לפגישה: ${url}`,
  "act.cal.join_link_later": () => "הקישור לפגישה עוד בהכנה ויופיע באירוע ביומן.",
  /** `invitesSent`: the invitations already went out (without the link) */
  "act.cal.online_missing": (provider: string, invitesSent = false) =>
    `קישור ${onlineService(provider)} לא נוצר לפגישה הזו.${invitesSent ? "\nההזמנות יצאו בלי קישור." : ""} אפשר לבקש להוסיף אותו.`,
  "act.cal.online_added": (title: string, provider: string) => `נוסף קישור ${onlineService(provider)} לפגישה ״${title}״.`,
  /** the meeting already has an online meeting (any service): nothing added, no update to the attendees */
  "act.cal.online_exists": (url: string | null) => (url ? `לפגישה כבר יש קישור, ולא נוסף קישור חדש.\nקישור לפגישה: ${url}` : "לפגישה כבר יש קישור לפגישה מקוונת, והוא מופיע באירוע ביומן. לא נוסף קישור חדש."),
  "act.cal.online_organizer_only": () => "רק מי שארגן את הפגישה יכול להוסיף לה קישור. הפגישה לא עודכנה.",
  "act.cal.online_unavailable": (provider: string, personal = false) => onlineUnavailable(provider, personal),
  "act.cal.online_not_done": (provider: string, o: OnlineNotDone) => {
    const who = o.askMain ? `מ-״@${P}״ ` : "";
    const next = o.isUpdate ? (o.somethingLeft ? `הפגישה לא עודכנה. אפשר לבקש ${who}לעדכן אותה בלי קישור.` : "הפגישה לא עודכנה.") : `הפגישה לא נקבעה. אפשר לבקש ${who}לקבוע אותה בלי קישור.`;
    return `${onlineUnavailable(provider, o.personal)}\n${next}`;
  },
  "act.cal.move_confirm": (e: { title: string; oldDate: string; oldStart: string; newDate: string; newStart: string; newEnd: string }) => `*הזזת פגישה*\n${e.title}\nמ: ${e.oldDate}, ${e.oldStart}\nאל: ${e.newDate}, ${e.newStart}–${e.newEnd}\nלהזיז?`,
  "act.cal.moved": (title: string, newDate: string, newStart: string) => `הוזז. ${title} עכשיו ב-${newDate}, ${newStart}.`,
  "act.cal.cancel_confirm": (title: string, date: string, start: string) => `*ביטול פגישה*\n${title}\n${date}, ${start}\nלבטל? המשתתפים יקבלו הודעת ביטול.`,
  "act.cal.cancelled": (title: string) => `הפגישה "${title}" בוטלה.`,
  "act.pending_expired": () => "האישור הזה כבר לא בתוקף (עברו יותר מ-10 דקות). אם עדיין רלוונטי — אפשר לבקש שוב ואכין מחדש.",
  "act.pending_replaced": () => `שמתי את הטיוטה הקודמת בצד. אפשר לחזור אליה — פשוט לכתוב "חזור לטיוטה".`,
  "act.generic_done": () => "עודכן.",

  // ---- 5. errors ----
  "err.connection_expired": (provider: string, link: string) => `החיבור ל-${provider} פג תוקף — זה קורה מדי פעם, בדרך כלל אחרי החלפת סיסמה.\nכדי לחדש:\n${link}\nהקישור עובד פעם אחת, ל-30 הדקות הקרובות.`,
  "err.admin_consent_needed": (tenantName: string, adminLink: string) =>
    `בארגון שלך (${tenantName}) חיבור של אפליקציות דורש אישור חד-פעמי של מנהל המערכת — ככה Microsoft מוגדרת היום ברוב העסקים.\n\nאפשר להעביר למנהל ה-IT את ההודעה הזו כמו שהיא:\n\n"היי, אני רוצה לחבר את ${P} — עוזרת למייל וליומן בוואטסאפ — לחשבון ה-Microsoft 365 שלי. נדרש אישור מנהל חד-פעמי להרשאות מייל, יומן וקבצים (קריאה ושליחה בשמי בלבד, בלי גישה לחשבונות אחרים). הקישור לאישור:\n${adminLink}\nתודה."\n\nאחרי האישור — לכתוב לי "חבר שוב" ואשלח קישור חדש.`,
  "err.admin_consent_pending": () => `עדיין אין אישור מנהל לארגון. כשמנהל ה-IT יאשר — לכתוב לי "חבר שוב".`,
  "err.rate_limit": () => "קיבלתי הרבה הודעות ברצף. אני מטפלת בהן לפי הסדר — אפשר להמתין רגע לפני ההודעה הבאה.",
  "err.model": () => "משהו נתקע אצלי באמצע. ההודעה שלך לא אבדה — אפשר לשלוח אותה שוב, או לחכות דקה ואנסה בעצמי.",
  "err.provider_down": (provider: string) => `אין תגובה כרגע מ-${provider} — זה אצלם, לא אצלך. אנסה שוב בעוד כמה דקות ואעדכן. בינתיים אפשר להמשיך בכל מה שלא תלוי במייל וביומן.`,
  "err.unsupported_media": (mediaType: string) => `עם ${mediaType} אני עדיין לא עובדת. מה שכן: טקסט, הקלטה, תמונה וקבצי PDF, Word, Excel ו-PowerPoint.`,
  "err.media_too_large": () => "הקובץ גדול מדי בשבילי כאן (עד 20MB). אפשר לשמור אותו ב-OneDrive או ב-Drive ולכתוב לי את השם — אמצא אותו משם.",
  "err.not_connected": () => `כדי לעשות את זה אני צריכה גישה למייל וליומן — זה חיבור של חצי דקה. לכתוב "לחבר את המייל" ואשלח קישור.`,
  "err.generic": () => `לא הצלחתי להשלים את זה. אפשר לנסות שוב, ואם זה חוזר — לכתוב "תמיכה" ואחבר אותך לאדם.`,

  // ---- 6. trial & billing ----
  "bill.trial_left_3": () => "—\nנשארו 3 הודעות בניסיון. אחרי זה המנוי: 99 ₪ לחודש.",
  "bill.trial_left_1": (payLink: string) => `—\nזו ההודעה הלפני-אחרונה בניסיון. כדי להמשיך בלי הפסקה:\n${payLink}`,
  "bill.trial_ended": (name: string | null, payLink: string) =>
    `${name ? `${name}, 10 ההודעות של הניסיון נגמרו. תודה שניסית.` : "10 ההודעות של הניסיון נגמרו. תודה שניסית."}\n\nכדי להמשיך — מנוי של 99 ₪ לחודש (עד 750 הודעות), ביטול בכל רגע:\n${payLink}\n\nההודעה האחרונה שלך שמורה אצלי. ברגע שהתשלום יעבור, אמשיך ממנה.`,
  "bill.trial_ended_repeat": (payLink: string) => `הניסיון הסתיים. אני כאן ברגע שהמנוי יופעל:\n${payLink}`,
  "bill.payment_success": (planName: string, invoiceNote: string) => `החשבון פעיל. תודה.\nמסלול ${planName}, ${invoiceNote}\n\nממשיכה מאיפה שעצרנו.`,
  "bill.payment_success_no_pending": (planName: string, invoiceNote: string) => `החשבון פעיל. תודה.\nמסלול ${planName}, ${invoiceNote}\n\nמה עושים קודם?`,
  "bill.payment_failed_initial": (payLink: string) => `התשלום לא עבר. לפעמים זה הבנק, לפעמים ספרה שגויה.\nאפשר לנסות שוב, גם עם כרטיס אחר:\n${payLink}`,
  "bill.past_due_blocked_reply": (updateLink: string) => `החשבון מושהה עד להסדרת התשלום:\n${updateLink}`,
  "bill.reactivated": () => "החשבון פעיל שוב. ממשיכים.",
  "bill.cancel_confirm": (periodEnd: string) => `לבטל את המנוי? הוא יישאר פעיל עד ${periodEnd}, ואחרי זה לא יחויב. ההגדרות נשמרות 90 יום למקרה שתרצו לחזור.`,
  "bill.cancelled": (periodEnd: string) => `המנוי בוטל. אפשר להמשיך להשתמש עד ${periodEnd}. לחזור בכל רגע — פשוט לכתוב "חדש מנוי".`,
  "bill.cancel_kept": () => "המנוי נשאר פעיל. לא שיניתי כלום.",
  "bill.plan_limit_reached": (resetDate: string, upgradeLink: string) => `הגעת ל-750 ההודעות של המסלול הבסיסי החודש. המכסה מתחדשת ב-${resetDate}.\n\nכדי להמשיך כבר עכשיו — מסלול פרו (299 ₪): עד 3,000 הודעות, שלושת הסוכנים המובנים ועד 3 סוכנים משלך, ואוטומציות:\n${upgradeLink}\n\nתזכורות וסיכום הבוקר ממשיכים לעבוד כרגיל.`,
  "bill.upgraded": () => `עברת למסלול פרו. המכסה החודשית עודכנה ל-3,000 הודעות. שלושת הסוכנים המובנים זמינים, ואפשר ליצור עד 3 סוכנים משלך — "מה הסוכנים יודעים לעשות?" יסביר.`,
  "bill.status": (s: { planName: string; used: number; limit: number; nextCharge: string; amount: string }) => `*המנוי שלך*\nמסלול: ${s.planName}\nהודעות החודש: ${s.used} מתוך ${s.limit}\nחיוב הבא: ${s.nextCharge}, ${s.amount} ₪\n\nלשנות מסלול או לבטל — פשוט לכתוב.`,

  // ---- 7. meta ----
  "meta.capabilities": (connected: string) =>
    `*מה אפשר לבקש ממני*\n• *מייל* — "מה חדש במייל?", "תסכם את המייל של רונית", "תנסח תשובה שאני מאשר"\n• *יומן* — "מה יש לי מחר?", "תקבע עם כהן ביום ג׳ ב-14:00", "תזיז את הפגישה של 10:00 לחמישי"\n• *קבצים* — "תמצא את ההסכם של לוי", "מה הסכום בהצעת המחיר?"\n• *תזכורות* — "תזכיר לי מחר ב-9 להתקשר לבנק"\n• *סיכום בוקר* — כל יום בשעה שבחרת\n• *הקלטות* — אפשר לדבר במקום לכתוב\n\n${connected}\n\nכל מייל, פגישה או קובץ שיוצאים החוצה — רק אחרי אישור שלך בכפתור.`,
  "meta.smalltalk": () => "בשמחה. אם צריך משהו — אני כאן.",
  "safe.cannot_see_chats": () => "אני לא רואה שיחות אחרות בוואטסאפ — רק את השיחה הזו איתי. אם יש משהו משם שצריך לטפל בו, אפשר להעתיק אותו לכאן.",

  // ---- 8. safety ----
  "safe.bypass_approval": () => "כל מייל, פגישה או קובץ שיוצאים ממני עוברים דרך כפתור אישור — גם כשממהרים. זה לא ניתן לכיבוי, וזה מה ששומר שלא יצא שום דבר בטעות.\nהטיוטה מוכנה, זה רק לחיצה אחת:",
} as const;

export type CopyId = keyof typeof copy;

/** Button sets (ids come back in `button_reply.id`). */
export const buttons = {
  welcome: [
    { id: "onb:tour", title: "סיור קצר" },
    { id: "onb:start", title: "נתחיל לעבוד" },
  ] satisfies ReplyButton[],
  connect: [
    { id: "onb:connect:microsoft", title: "Microsoft 365" },
    { id: "onb:connect:google", title: "Google" },
    { id: "onb:connect:later", title: "אחר כך" },
  ] satisfies ReplyButton[],
  cancelSubscription: [
    { id: "bill:cancel:yes", title: "בטל מנוי" },
    { id: "bill:cancel:no", title: "השאר פעיל" },
  ] satisfies ReplyButton[],
  /** approval buttons for a pending action; `kind` picks the first label (שלח / קבע) */
  approve: (actionId: string, firstLabel = "שלח") =>
    [
      { id: `pa:approve:${actionId}`, title: firstLabel },
      { id: `pa:edit:${actionId}`, title: "ערוך" },
      { id: `pa:cancel:${actionId}`, title: "בטל" },
    ] satisfies ReplyButton[],
};

export const lists = {
  pain: {
    button: "לבחירה",
    title: "מה הכי מעמיס",
    rows: [
      { id: "pain_email", title: "מיילים שמחכים לתשובה", description: "תיבה מלאה, תשובות שנדחות" },
      { id: "pain_calendar", title: "היומן והפגישות", description: "תיאומים, הזזות, שכחה" },
      { id: "pain_followup", title: "מעקבים ותזכורות", description: "דברים שנופלים בין הכיסאות" },
      { id: "pain_files", title: "למצוא מסמכים", description: "״איפה הקובץ ההוא?״" },
    ] satisfies ListRow[],
    done: { id: "pain_done", title: "זהו, מספיק", description: "ממשיכים הלאה" } satisfies ListRow,
  },
  morningTime: {
    button: "לבחירה",
    title: "שעת סיכום בוקר",
    rows: [
      { id: "mt_0700", title: "07:00" },
      { id: "mt_0730", title: "07:30" },
      { id: "mt_0800", title: "08:00" },
      { id: "mt_0830", title: "08:30" },
      { id: "mt_none", title: "לא עכשיו" },
    ] satisfies ListRow[],
  },
};
