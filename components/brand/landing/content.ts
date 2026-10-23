import type { ChatStep } from "@/components/brand/chat-demo";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES, VAT_RATE } from "@/lib/billing/plans";
import type { MascotPose } from "./mascot";

/**
 * Landing-page copy (app/page.tsx), kept as data so the sections stay layout-only and the tests can check it.
 * One persona runs through the page: מיכל, who runs a small office. The hero, the day scenes and the lock screen are
 * the same two days (Wed 21.10 → Thu 22.10.2026), so names, times and dates agree with each other.
 * Voice: docs/copy/style-guide.md — the assistant is feminine, the reader is addressed neutrally (infinitive/plural).
 */

const he = new Intl.NumberFormat("he-IL");
export const formatNumber = (n: number) => he.format(n);

/** The hero demo: something "you said you'd do" → she finds the file, drafts the mail, waits for approval. */
export const HERO_SCRIPT: ChatStep[] = [
  { kind: "chip", text: "היום" },
  {
    kind: "out",
    text: "אמרתי לגב׳ אברהם שאשלח לה היום את הסיכום מהפגישה",
    time: "16:52",
    wait: 500,
    react: true,
  },
  { kind: "typing", ms: 1600, wait: 450 },
  {
    kind: "draft",
    time: "16:53",
    prompt: "צירפתי את ״סיכום פגישה אברהם.docx״ מ-OneDrive. לשלוח?",
    draft: {
      to: "r.avraham@gmail.com",
      subject: "סיכום הפגישה מ-20.10",
      body: "שלום רונית,\nמצורף הסיכום מהפגישה שלנו. אשמח לשמוע אם יש הערות.\nבברכה,\nמיכל",
    },
  },
  {
    kind: "buttons",
    time: "16:53",
    labels: ["שלח", "ערוך", "בטל"],
    replies: {
      שלח: "נשלח. אעדכן כשתגיע תשובה.",
      ערוך: "בסדר. מה לשנות בטיוטה?",
      בטל: "בוטל. הטיוטה נמחקה ולא נשלחה.",
    },
  },
];

export interface Scene {
  /** the WhatsApp timestamp of the scene — the page's only sequence marker, because the scenes are a day */
  time: string;
  /** where/when, in a few words */
  moment: string;
  title: string;
  body: string;
  /** her pose in this scene (public/brand/mascot/) */
  pose: MascotPose;
}

/** The pinned phone scene: one working day and the next morning. */
export const SCENES: readonly Scene[] = [
  {
    time: "13:05",
    pose: "listening",
    moment: "ברכב, בין שתי פגישות",
    title: "מקליטים. היא מסדרת.",
    body: "חצי דקה של מחשבות בקול הופכת לרשימה: תזכורת, טיוטה ושעה פנויה ביומן, כל אחד במקום שלו.",
  },
  {
    time: "18:20",
    pose: "calendar",
    moment: "סוף היום",
    title: "שואלים מה מחר.",
    body: "היא קוראת את היומן ואת המייל ועונה בשורה לכל פגישה, כולל מה עוד מחכה לתשובה.",
  },
  {
    time: "18:24",
    pose: "envelope",
    moment: "ארבע דקות אחר כך",
    title: "היא מנסחת. מחליטים לבד.",
    body: "כל מייל או זימון מגיע קודם כטיוטה, עם שלח, ערוך או בטל. בלי לחיצה, שום דבר לא יוצא.",
  },
  {
    time: "07:30",
    pose: "front",
    moment: "למחרת בבוקר",
    title: "הבוקר כבר מסודר.",
    body: "בשעה שבוחרים מגיע סיכום: הפגישות של היום, התזכורות ומי עוד מחכה לתשובה.",
  },
];

export interface Exchange {
  profession: string;
  /** what the professional writes to her */
  ask: string;
  /** her answer — always ends with a question when something would go out */
  answer: string;
}

export const PROFESSIONS: readonly Exchange[] = [
  {
    profession: "עורכי דין",
    ask: "מה כתוב בהסכם השכירות של משפחת לוי על הארכת החוזה?",
    answer:
      "סעיף 9.2: אופציה לשנתיים נוספות, בהודעה מוקדמת של 90 יום. המועד האחרון למסור הודעה הוא 2.1.2027. להוסיף תזכורת?",
  },
  {
    profession: "רואי חשבון",
    ask: "מי עוד לא שלח את החשבוניות של ספטמבר?",
    answer: "שלושה לקוחות: גרינברג, א.ש. שיווק ונגריית הגליל. להכין לכל אחד מהם מייל תזכורת?",
  },
  {
    profession: "יועצים",
    ask: "תמצאי שעה לפגישה עם דנה בשבוע הבא ותשלחי לה זימון.",
    answer: "פנוי ביום א׳ ב-10:00, ביום ב׳ ב-14:30 וביום ד׳ ב-09:00. איזה מועד לשלוח לה?",
  },
  {
    profession: "קליניקות",
    ask: "תעבירי את התור של מר כהן מיום שני לשלישי, באותה שעה.",
    answer: "ביום ג׳ 27.10 ב-16:00 פנוי. הכנתי לו מייל עם המועד החדש. לשלוח?",
  },
];

export const TRUST: readonly { term: string; detail: string }[] = [
  {
    term: "מוצפן",
    detail:
      "המידע מוצפן בדרך ובאחסון. הגישה לחשבון המייל נשמרת בהצפנה נפרדת, ואפשר לנתק אותה בכל רגע.",
  },
  {
    term: "נשמר באירופה",
    detail: "השרתים בפרנקפורט, באיחוד האירופי. מחיקת החשבון מוחקת את כל המידע ומנתקת את החיבורים.",
  },
  {
    term: "לא משמש לאימון",
    detail: "השיחות, המיילים והקבצים לא משמשים לאימון מודלים של בינה מלאכותית.",
  },
  {
    term: "שום דבר לא יוצא בלי אישור",
    detail: "כל מייל, זימון או קובץ מגיע קודם כטיוטה, ויוצא רק אחרי לחיצה על ״שלח״.",
  },
];

const vatPercent = Math.round(VAT_RATE * 100);

export const PRICING = {
  trial: TRIAL_MESSAGES,
  vatNote: `המחירים לחודש וכוללים מע״מ (${vatPercent}%). חיוב חודשי, קבלה נשלחת אוטומטית במייל, ביטול בכל רגע מהאזור האישי.`,
  /** lib/integrations/catalogue.ts integrationsForPlan: the plans differ in messages and agents, not in connections */
  connectionsNote: "החיבורים זהים בשני המסלולים וגם בהודעות החינמיות.",
  plans: [
    {
      id: "basic" as const,
      name: PLANS.basic.nameHe,
      price: PLANS.basic.priceIls,
      allowance: `עד ${formatNumber(PLANS.basic.messages)} הודעות בחודש, בערך ${Math.round(PLANS.basic.messages / 30)} ביום`,
      lead: null,
      features: [
        "חיבור ל-Microsoft 365 או ל-Google: מייל, יומן וקבצים",
        "קריאה, סיכום, חיפוש וניסוח. שליחה רק באישור",
        "סיכום בוקר, תזכורות והודעות קוליות",
        "קריאת קובצי Word, Excel ו-PowerPoint",
        "סוכן אחד משלך, עם הנחיות ויכולות שבוחרים",
        "היסטוריה וזיכרון ל-90 יום",
      ],
    },
    {
      id: "pro" as const,
      name: PLANS.pro.nameHe,
      price: PLANS.pro.priceIls,
      allowance: `עד ${formatNumber(PLANS.pro.messages)} הודעות בחודש, בשימוש הוגן`,
      lead: "כל מה שבבסיסי, ובנוסף:",
      features: [
        `שלושת הסוכנים המובנים (מזכירה, מתמחה ומנהלת חשבונות) ועד ${PLANS.pro.customAgents} סוכנים משלך`,
        "משימות ואוטומציות, כמו מעקב חשבוניות ותזכורת למי שלא ענה",
        "היסטוריה וזיכרון לשנה",
        "עדיפות למודל המתקדם",
      ],
    },
  ],
} as const;

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "צריך להתקין משהו?",
    a: `לא. ${BRAND.name} היא איש קשר בוואטסאפ שכבר יש בטלפון. נרשמים כאן עם המייל, מחברים את Outlook או את Gmail, ושולחים לה הודעה ראשונה.`,
  },
  {
    q: "היא רואה את שאר השיחות שלי?",
    a: "לא. וואטסאפ מעביר לה רק הודעות שנשלחות אליה ישירות. שיחות אחרות, קבוצות ואנשי קשר נשארים מחוץ להישג ידה.",
  },
  {
    q: "משהו יכול לצאת בשמי בלי שאישרתי?",
    a: "לא. כל מייל, זימון או קובץ מגיע קודם כטיוטה עם הכפתורים שלח, ערוך ובטל, ומתבצע רק אחרי לחיצה.",
  },
  {
    q: "עם אילו חשבונות זה עובד?",
    a: "עם Microsoft 365 (Outlook, היומן ו-OneDrive) ועם Google (היומן, Drive ושליחה מ-Gmail). אפשר לחבר אחד מהם או את שניהם.",
  },
  {
    q: "אפשר לדבר איתה בהקלטות?",
    a: "כן. הקלטה בעברית מתומללת ומטופלת כמו הודעה כתובה, גם כשיש בה מילים באנגלית.",
  },
  {
    q: `מה קורה אחרי ${TRIAL_MESSAGES} ההודעות?`,
    a: `${BRAND.name} שולחת קישור תשלום אישי. בוחרים מסלול, משלמים בכרטיס אשראי וממשיכים באותה שיחה.`,
  },
  {
    q: "אפשר לבטל?",
    a: "כן, בכל רגע מהאזור האישי. המנוי נשאר פעיל עד סוף התקופה ששולמה.",
  },
];
