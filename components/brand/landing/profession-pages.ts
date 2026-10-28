import type { ProfessionSlug } from "@/lib/seo/professions";
import type { Exchange } from "./content";
import { PROFESSIONS } from "./content";

/**
 * The "לפי מקצוע" pages (/for/<slug>, round plan "אנליטיקה ו-SEO": pages that can be found on Google): one per
 * profession of the landing's section, with that section's exchange first and two more from the same working day.
 * Copy only (the page is app/for/[profession]/page.tsx; the share image is its opengraph-image.tsx). Voice:
 * docs/copy/style-guide.md — she speaks in the feminine, the reader is addressed neutrally.
 */
export interface ProfessionPage {
  slug: ProfessionSlug;
  /** as in the landing's section: "עורכי דין" */
  profession: string;
  /** the <title> part: "עוזרת אישית בוואטסאפ לעורכי דין" */
  title: string;
  /** meta description and the share card's line */
  description: string;
  /** the page's h1 (ends with a period) */
  headline: string;
  exchanges: readonly Exchange[];
  /** what she does in that office, four short lines */
  tasks: readonly string[];
}

const first = (profession: string): Exchange => {
  const e = PROFESSIONS.find((p) => p.profession === profession);
  if (!e) throw new Error(`no landing exchange for ${profession}`);
  return e;
};

export const PROFESSION_PAGES: readonly ProfessionPage[] = [
  {
    slug: "lawyers",
    profession: "עורכי דין",
    title: "עוזרת אישית בוואטסאפ לעורכי דין",
    description: "סעיף בהסכם, מועד להגשה ומייל ללקוח - בהודעה אחת בוואטסאפ. עוזרת למשרד עורכי דין שעובדת עם Outlook, Gmail והקבצים של המשרד, ושום דבר לא יוצא בלי אישור.",
    headline: "עוזרת אישית בוואטסאפ, למשרד עורכי דין.",
    exchanges: [
      first("עורכי דין"),
      {
        profession: "עורכי דין",
        ask: "תכיני מייל לשמעון לוי עם עדכון על הדיון מחר.",
        answer: "הכנתי טיוטה לשמעון לוי: הדיון נקבע למחר ב-09:30 בבית משפט השלום בתל אביב, ומצורף כתב התשובה. לשלוח?",
      },
      {
        profession: "עורכי דין",
        ask: "תזכירי לי שבוע לפני המועד האחרון להגשת הערעור.",
        answer: "קבעתי תזכורת ליום ה׳ 12.11 ב-09:00: שבוע לפני המועד האחרון להגשת הערעור.",
      },
    ],
    tasks: [
      "קוראת חוזים ומסמכים מ-OneDrive ומ-Google Drive, ועונה מה כתוב בהם.",
      "מזכירה מועדים, הגשות ושיחות חוזרות, בשעה שקובעים.",
      "מכינה טיוטות מייל ללקוחות, שיוצאות רק אחרי לחיצה על ״שלח״.",
      "שולחת בבוקר סיכום: הדיונים והפגישות של היום ומה מחכה לתשובה.",
    ],
  },
  {
    slug: "accountants",
    profession: "רואי חשבון",
    title: "עוזרת אישית בוואטסאפ לרואי חשבון",
    description: "מי עוד לא שלח חשבוניות, מה מחכה לתשובה במייל ומתי הפגישה הבאה. עוזרת למשרד רואי חשבון בוואטסאפ, עם Outlook או Gmail, ושום דבר לא יוצא בלי אישור.",
    headline: "עוזרת אישית בוואטסאפ, למשרד רואי חשבון.",
    exchanges: [
      first("רואי חשבון"),
      {
        profession: "רואי חשבון",
        ask: "מה יש לי ביומן ביום ראשון?",
        answer: "שלוש פגישות: 09:00 עם גרינברג על הדוח השנתי, 11:30 שיחה עם הבנק ו-15:00 לקוח חדש. להוסיף תזכורת לפגישה הראשונה?",
      },
      {
        profession: "רואי חשבון",
        ask: "תעבירי את המייל מהבנק ליוסי.",
        answer: "הכנתי העברה של ״אישור יתרות 2025״ ליוסי כהן. לשלוח?",
      },
    ],
    tasks: [
      "עוקבת אחרי מיילים שמחכים לתשובה, ואומרת ממי.",
      "מכינה מיילי תזכורת ללקוחות על מסמכים חסרים, לאישור.",
      "מעבירה מיילים וקבצים לרואה החשבון או ללקוח, אחרי לחיצה על ״שלח״.",
      "שולחת בבוקר סיכום עם הפגישות והתזכורות של היום.",
    ],
  },
  {
    slug: "consultants",
    profession: "יועצים",
    title: "עוזרת אישית בוואטסאפ ליועצים",
    description: "תיאום פגישות, זימונים ומעקב אחרי הצעות מחיר בלי לפתוח את היומן. עוזרת ליועצים בוואטסאפ, עם Outlook או Google Calendar, ושום דבר לא יוצא בלי אישור.",
    headline: "עוזרת אישית בוואטסאפ, ליועצים.",
    exchanges: [
      first("יועצים"),
      {
        profession: "יועצים",
        ask: "מי עוד לא ענה על הצעת המחיר ששלחתי השבוע?",
        answer: "שניים: נגה מ-א.ב. ייעוץ ומשרד ברק. להכין לכל אחד מהם מייל תזכורת קצר?",
      },
      {
        profession: "יועצים",
        ask: "תזכירי לי מחר בשמונה להתקשר לדנה.",
        answer: "קבעתי תזכורת למחר ב-08:00: להתקשר לדנה.",
      },
    ],
    tasks: [
      "מוצאת שעות פנויות ביומן ומכינה זימונים, לאישור.",
      "עוקבת אחרי הצעות מחיר ומיילים שעוד לא נענו.",
      "הופכת הודעה קולית לתזכורת, לטיוטה או לפגישה.",
      "שולחת בבוקר סיכום של היום, לפני הפגישה הראשונה.",
    ],
  },
  {
    slug: "clinics",
    profession: "קליניקות",
    title: "עוזרת אישית בוואטסאפ לקליניקות",
    description: "הזזת תורים, מיילים למטופלים ותזכורות, בין טיפול לטיפול. עוזרת לקליניקה בוואטסאפ, עם Outlook או Google Calendar, ושום דבר לא יוצא בלי אישור.",
    headline: "עוזרת אישית בוואטסאפ, לקליניקה.",
    exchanges: [
      first("קליניקות"),
      {
        profession: "קליניקות",
        ask: "מה יש לי מחר אחרי הצהריים?",
        answer: "ארבעה תורים: 14:00, 15:00, 16:30 ו-17:30. בין 15:45 ל-16:15 פנוי.",
      },
      {
        profession: "קליניקות",
        ask: "תכיני מייל למיכל עם ההנחיות לפני הטיפול.",
        answer: "הכנתי טיוטה למיכל עם ההנחיות מהקובץ ״הנחיות לפני טיפול.pdf״. לשלוח?",
      },
    ],
    tasks: [
      "מזיזה תורים ביומן ומכינה מייל עם המועד החדש, לאישור.",
      "מכינה מיילים למטופלים מתוך הקבצים השמורים.",
      "מזכירה לחזור למטופל או להזמין ציוד, בשעה שקובעים.",
      "שולחת בבוקר סיכום עם התורים של היום.",
    ],
  },
];

export function professionPage(slug: string): ProfessionPage | null {
  return PROFESSION_PAGES.find((p) => p.slug === slug) ?? null;
}
