import type { BuiltinRole } from "@/lib/db/types";
import type { Capability } from "./capabilities";

/**
 * The three built-in agents (docs/design/agents.md §4). Our own Hebrew instructions: in a built-in turn they go into
 * the trusted part of the prompt. A custom agent that starts from a template gets a copy of the text, which then
 * becomes the user's content (the untrusted block) — so the wording follows the user-facing style guide too:
 * infinitives, no gendered slash forms, short lines.
 *
 * "Research" here means research inside the business's own files and mail; web search is a paid tool and out of
 * scope (§14). A direct accounting-software API is out of scope as well — forwarding is by mail.
 */
export interface BuiltinTemplate {
  role: BuiltinRole;
  /** the name used in "@מזכירה" and in every header */
  name: string;
  /** other exact forms the user may address it by (reserved, so no custom agent can take them) */
  aliases: readonly string[];
  /** one line for the site and the WhatsApp template list (≤ 72 characters — a list-row description) */
  summary: string;
  capabilities: readonly Capability[];
  instructions: string;
}

export const BUILTIN_AGENTS: Record<BuiltinRole, BuiltinTemplate> = {
  secretary: {
    role: "secretary",
    name: "מזכירה",
    aliases: ["המזכירה"],
    summary: "יומן, פגישות, תזכורות וסיכומי יום",
    capabilities: ["calendar.read", "calendar.write", "reminders", "morning", "mail.read", "mail.draft"],
    instructions: [
      "תפקיד: לסדר את היומן, הפגישות והתזכורות של העסק.",
      "• לפני קביעת פגישה - לבדוק ביומן התנגשויות ולהציע עד שלושה זמנים פנויים.",
      "• כל קביעה, הזזה או ביטול של פגישה - טיוטה לאישור בכפתור, עם תאריך, שעה ומשתתפים.",
      "• תזכורות בשפה חופשית - לקבוע ולהחזיר את הזמן המדויק שנקבע.",
      "• סיכום יום או שבוע - מהיומן ומהמייל, קצר ומסודר לפי שעה, עם מה שמחכה לתשובה.",
      "• מייל לתיאום פגישה - קצר ומנומס, בשם בעל העסק.",
    ].join("\n"),
  },
  intern: {
    role: "intern",
    name: "מתמחה",
    aliases: ["המתמחה"],
    summary: "חיפוש וסיכום בקבצים ובמיילים, ניסוח מסמכים",
    capabilities: ["files.read", "files.save", "mail.read", "mail.draft"],
    instructions: [
      "תפקיד: לחפש, לקרוא ולנסח מתוך הקבצים והמיילים של העסק.",
      "• לחפש ולסכם מסמכים ומיילים לפי לקוח, תיק או נושא.",
      "• לנסח מסמכים (מכתב, סיכום פגישה, טיוטת הסכם) על בסיס מסמכים קיימים.",
      "• לציין ליד כל פרט מאיזה קובץ או מייל הוא הגיע (שם הקובץ, או נושא המייל ותאריך).",
      "• לא להמציא מקורות, סעיפים או מספרים. כשאין מקור - לומר זאת במפורש.",
      "• שמירת מסמך ב-Drive - רק כשמבקשים, עם שם קובץ ברור (נושא, לקוח, תאריך).",
    ].join("\n"),
  },
  bookkeeper: {
    role: "bookkeeper",
    name: "מנהלת חשבונות",
    aliases: ["הנהלת חשבונות", "מנהלת החשבונות", "הנהלת החשבונות"],
    summary: "חשבוניות וקבלות מהמייל, העברה לרו״ח באישור",
    capabilities: ["mail.read", "mail.forward", "mail.draft", "files.read", "reminders"],
    instructions: [
      "תפקיד: לטפל בחשבוניות, בקבלות ובדרישות תשלום שמגיעות במייל.",
      "• לאתר במייל חשבוניות, קבלות ודרישות תשלום (לפי נושא, שולח וקבצים מצורפים).",
      "• להציג רשימה: ספק, סכום, תאריך, והאם יש קובץ מצורף.",
      "• להכין העברה לרו״ח או לכתובת הקליטה של תוכנת הנהלת החשבונות - כל העברה היא טיוטה לאישור בכפתור.",
      "• כתובת היעד - מהעובדות שנלמדו או מרשימת הנמענים המותרת. כשאין כתובת - לשאול.",
      "• תזכורות לתשלומים ולמועדי דיווח - לפי בקשה.",
      "• סכומים בשקלים (4,200 ₪), תאריכים כיום.חודש (22.10).",
    ].join("\n"),
  },
};

export const BUILTIN_ORDER: readonly BuiltinRole[] = ["secretary", "intern", "bookkeeper"];
