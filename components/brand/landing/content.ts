import type { ChatStep } from "@/components/brand/chat-demo";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES, VAT_RATE, annualPerMonthIls, planFeatures, proSoonTexts } from "@/lib/billing/plans";
import { integrationsForPlan } from "@/lib/integrations/catalogue";
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

/**
 * The trust section's four facts, as short headings only (Daniel, 28.10.2026). What each one means - the encryption,
 * the EU servers (Frankfurt; never "in Israel"), no training, approval before anything goes out - is on /privacy.
 */
export const TRUST: readonly string[] = ["מוצפן", "נשמר באירופה", "לא משמש לאימון", "שום דבר לא יוצא בלי אישור"];

const vatPercent = Math.round(VAT_RATE * 100);

/** "כולל 16 חיבורים, ועוד 4 בקרוב" - counted from lib/integrations/catalogue.ts integrationsForPlan("pro"). */
function proConnectionsLabel(): string {
  const all = integrationsForPlan("pro").flatMap((g) => g.items);
  const soon = all.filter((i) => i.status === "soon").length;
  return `כולל ${all.length - soon} חיבורים${soon ? `, ועוד ${soon} בקרוב` : ""}`;
}

/** "82.50" / "249.17" - the per-month equivalent of the annual price (lib/billing/plans.ts annualPerMonthIls) */
const perMonth = (n: number) => n.toFixed(2);

export const PRICING = {
  trial: TRIAL_MESSAGES,
  /** the one line under the cards (the landing and /pricing): VAT and cancelling, nothing else */
  footnote: "המחירים כוללים מע״מ. ביטול בכל רגע.",
  /** under the cards when the annual cycle is shown (the switch: ./plan-cycle.tsx) */
  annualNote: `בתשלום שנתי משלמים 10 חודשים ומקבלים 12, בחיוב אחד. מכסת ההודעות נשארת חודשית.`,
  plans: [
    {
      id: "basic" as const,
      name: PLANS.basic.nameHe,
      price: PLANS.basic.priceIls,
      annualPrice: PLANS.basic.annualPriceIls,
      annualPerMonth: perMonth(annualPerMonthIls("basic")),
      allowance: `עד ${formatNumber(PLANS.basic.messages)} הודעות בחודש, בערך ${Math.round(PLANS.basic.messages / 30)} ביום`,
      lead: planFeatures("basic").lead,
      /** every line of the plan, from lib/billing/plans.ts (the pay page shows them all) */
      features: planFeatures("basic").lines,
      /** the label over the plan's icons on the landing (its "account" line stands there instead of in the list) */
      connectionsLabel: planFeatures("basic").lines.find((l) => l.id === "account")!.text,
    },
    {
      id: "pro" as const,
      name: PLANS.pro.nameHe,
      price: PLANS.pro.priceIls,
      annualPrice: PLANS.pro.annualPriceIls,
      annualPerMonth: perMonth(annualPerMonthIls("pro")),
      allowance: `עד ${formatNumber(PLANS.pro.messages)} הודעות בחודש, בשימוש הוגן`,
      lead: planFeatures("pro").lead,
      features: planFeatures("pro").lines,
      connectionsLabel: proConnectionsLabel(),
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
    a: "עם Microsoft 365 (Outlook, היומן ו-OneDrive) ועם Google (היומן, Drive ושליחה מ-Gmail). במסלול הבסיסי מחברים אחד מהם, ובפרו את שניהם יחד.",
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

/** "בקרוב" in pro, in words: "סיכומי פגישות Zoom וחיבור למערכות העסק, כמו monday.com" (lib/billing/plans.ts: the soon lines). */
function soonInPro(): string {
  const soon = proSoonTexts();
  return soon.length < 2 ? (soon[0] ?? "") : `${soon.slice(0, -1).join(", ")} ו${soon.at(-1)}`;
}

/**
 * /pricing: questions about the plans. Every fact is one the code enforces (lib/billing/plans.ts, the billing flow in
 * lib/billing/subscription.ts and lib/billing/commands.ts) or one the support chat already says (lib/support/knowledge.ts).
 */
export const PRICING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: `מה קורה אחרי ${TRIAL_MESSAGES} ההודעות החינמיות?`,
    a: `${BRAND.name} שולחת בוואטסאפ קישור תשלום אישי. בוחרים מסלול, משלמים בכרטיס אשראי וממשיכים באותה שיחה. נספרות רק הודעות ששולחים אליה ומקבלות תשובה; לחיצות אישור, תזכורות וסיכום הבוקר לא נספרים.`,
  },
  {
    q: "אפשר לעבור בין המסלולים?",
    a: "כן. שדרוג לפרו נכנס לתוקף מיד, מהאזור האישי או בהודעה ״שדרוג״ בוואטסאפ, ומשלמים רק את ההפרש היחסי עד סוף התקופה, גם בשנתי. מעבר לבסיסי, בהודעה בוואטסאפ, נכנס לתוקף בחיוב הבא.",
  },
  {
    q: "יש תשלום שנתי?",
    a: `כן, עם חודשיים מתנה: משלמים 10 חודשים ומקבלים 12, בחיוב אחד. בסיסי ${formatNumber(PLANS.basic.annualPriceIls)} ₪ לשנה ופרו ${formatNumber(PLANS.pro.annualPriceIls)} ₪ לשנה, כולל מע״מ. מכסת ההודעות נשארת חודשית. מעבר מחודשי לשנתי, מהאזור האישי, נכנס לתוקף מיד: השנה מתחילה מאותו יום, והימים שנותרו בחודש מקוזזים מהחיוב. מעבר משנתי לחודשי נכנס לתוקף בחידוש, ועל החלק שנותר מהשנה אין החזר.`,
  },
  {
    q: "מה זה ״חבר מביא חבר״?",
    a: "לכל חשבון יש קישור אישי באזור האישי, ובוואטסאפ בהודעה ״חבר מביא חבר״. חבר שנרשם דרכו ומשלם בפעם הראשונה מקבל חודש חינם, ומי שהביא אותו מקבל חודש חינם: החיוב הבא נדחה ב-30 יום. עד 12 חודשים חינם בשנה.",
  },
  {
    q: "מה קורה לחשבון השני במעבר לבסיסי?",
    a: "בבסיסי עובדים עם חשבון אחד. אם מחוברים גם Google וגם Microsoft, ממשיכים עם החשבון שחובר אחרון, והשני נשאר מחובר אבל מושהה: לא מתנתק ולא נמחק. אפשר לנתק אחד מהם באזור האישי, או לחזור לפרו ולעבוד עם שניהם יחד.",
  },
  {
    q: "המחירים כוללים מע״מ?",
    a: `כן. ${PLANS.basic.priceIls} ₪ ו-${PLANS.pro.priceIls} ₪ לחודש, וגם ${formatNumber(PLANS.basic.annualPriceIls)} ₪ ו-${formatNumber(PLANS.pro.annualPriceIls)} ₪ לשנה, כוללים מע״מ (${vatPercent}%). קבלה נשלחת במייל אחרי כל חיוב.`,
  },
  {
    q: "מה מסומן ״בקרוב״?",
    a: `יכולות שעוד בפיתוח ויהיו חלק ממסלול פרו: ${soonInPro()}. חסרה מערכת שהעסק עובד איתה? אפשר לבקש אותה בטופס ״בקשת מערכת״ בדף הזה.`,
  },
  {
    q: "אפשר לבטל?",
    a: "כן, בכל רגע, מהאזור האישי או בהודעה ״ביטול מנוי״ בוואטסאפ. המנוי נשאר פעיל עד סוף התקופה ששולמה ולא מתחדש. בלי התחייבות. במנוי שנתי השירות נמשך עד סוף השנה ששולמה, ועל החלק שנותר אין החזר.",
  },
];
