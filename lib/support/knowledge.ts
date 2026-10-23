import { PLANS, TRIAL_MESSAGES, VAT_RATE } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import { SUPPORT_COPY, SUPPORT_SUGGESTIONS } from "./types";

/**
 * The support chat's knowledge base: what עלזה may say about the service on the website. Every fact comes from a
 * source in the repo, never from memory:
 *   - docs/PLAN.md (§0, §2.3, §4) — what the service does, approval by button, data in the EU, plans
 *   - lib/billing/plans.ts — prices, message allowances, agents per plan, VAT (the numbers below are computed from it)
 *   - components/brand/landing/content.ts — the landing's trust, pricing and FAQ copy
 *   - docs/legal/privacy-policy-he.md, terms-of-service-he.md — what is stored where, trial terms, cancellation, receipts
 *   - lib/billing/commands.ts, lib/copy/bot-billing.ts — "קבלה" / "ביטול מנוי" in the chat
 * Nothing here promises what the docs do not (no servers in Israel, no response-time guarantee beyond the ticket line).
 *
 * Used twice: as the grounding of the model's system prompt (lib/support/answer.ts) and by `matchKnowledge`, the
 * deterministic answer (mock mode, the day's AI budget spent, a provider error). Site text: the short hyphen only.
 */

export interface KnowledgeEntry {
  id: string;
  /** the question as a person would ask it (a chip label when it is one of SUPPORT_SUGGESTIONS) */
  question: string;
  /** words and phrases that point here; a phrase (with a space) counts double */
  keywords: readonly string[];
  answer: string;
  /** offer "פתיחת פנייה" with the answer */
  ticket?: boolean;
  /** multiplies the score (the "something is wrong" entry outweighs a topic word in the same sentence) */
  boost?: number;
}

const he = new Intl.NumberFormat("he-IL");
const n = (v: number) => he.format(v);
const vat = Math.round(VAT_RATE * 100);
const { basic, pro } = PLANS;

export const KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "what",
    question: SUPPORT_SUGGESTIONS[0],
    // the general entry: half weight, so a topic word in the same question wins ("כמה עולה עלזה?" → pricing)
    keywords: [BRAND.name, BRAND.latin, "עושה", "עושים", "לעשות", "יודעת", "שירות", "יכולות", "יכולה", "עוזרת", "מקבלים", "נותנת", "נותן", "מיועד", "בשביל מה", "איך זה עובד", "עובדת"],
    boost: 0.5,
    answer:
      `אני עוזרת אישית בוואטסאפ לעסקים קטנים. אחרי חיבור ל-Microsoft 365 או ל-Google אני עובדת עם המייל, היומן והקבצים: קוראת, מסכמת, מחפשת ומנסחת, ` +
      "קובעת תזכורות, שולחת סיכום בוקר ומבינה הודעות קוליות. כל מייל, זימון או קובץ יוצא רק אחרי לחיצה על ״שלח״.",
  },
  {
    id: "pricing",
    question: SUPPORT_SUGGESTIONS[1],
    keywords: ["מחיר", "מחירים", "עולה", "עלות", "כמה זה", "כמה כסף", "תשלום", "לשלם", "מסלול", "מסלולים", "מנוי", "מינוי", "שקל", "שקלים", "₪", "ש״ח", "שח", "תמחור", "יקר", "זול", "חודשי", "מע״מ", "מעמ"],
    answer:
      `${TRIAL_MESSAGES} ההודעות הראשונות בחינם, בלי כרטיס אשראי. אחר כך יש שני מסלולים: בסיסי ב-${basic.priceIls} ₪ לחודש (עד ${n(basic.messages)} הודעות) ` +
      `ופרו ב-${pro.priceIls} ₪ לחודש (עד ${n(pro.messages)} הודעות, בשימוש הוגן). המחירים כוללים מע״מ (${vat}%). החיוב חודשי, ואפשר לבטל בכל רגע מהאזור האישי.`,
  },
  {
    id: "connect",
    question: SUPPORT_SUGGESTIONS[2],
    keywords: ["מתחברים", "להתחבר", "התחברות", "חיבור", "לחבר", "מחברים", "הרשמה", "להירשם", "נרשמים", "מתחילים", "להתחיל", "התחלה", "התקנה", "להתקין", "אפליקציה", "קישור", "לקשר", "ברקוד", "qr"],
    answer:
      "לא צריך להתקין כלום. נרשמים באתר עם כתובת המייל ומקבלים קוד, מחברים את Outlook (Microsoft 365) או את Gmail (Google), " +
      "ואז פותחים את השיחה איתי בוואטסאפ מהקישור (במחשב - בסריקת קוד). זה לוקח בערך דקה. אפשר גם לדלג על החיבור ולחבר אחר כך.",
  },
  {
    id: "security",
    question: SUPPORT_SUGGESTIONS[3],
    keywords: ["מאובטח", "אבטחה", "פרטיות", "מוצפן", "הצפנה", "שרתים", "שרת", "איפה נשמר", "נשמר", "נשמרים", "אחסון", "מאוחסן", "אימון", "לאמן", "דליפה", "בטוח", "בטיחות", "gdpr", "אירופה", "פרנקפורט"],
    answer:
      "המידע מוצפן בדרך ובאחסון, והגישה לחשבון המייל נשמרת בהצפנה נפרדת. מסד הנתונים נמצא באיחוד האירופי, בפרנקפורט. " +
      "את המיילים והקבצים אני קוראת רק כשמבקשים ממני משהו שדורש אותם, ותוכן המיילים לא נשמר אצלנו. השיחות והקבצים לא משמשים לאימון מודלים. " +
      "אפשר לנתק חיבור בכל רגע, ומחיקת החשבון מוחקת את המידע ומנתקת את החיבורים. הפירוט המלא במדיניות הפרטיות.",
  },
  {
    id: "approval",
    question: "משהו יכול לצאת בשמי בלי אישור?",
    keywords: ["בלי אישור", "אישור", "לאשר", "מאשרים", "בשמי", "טיוטה", "טיוטות", "שולחת לבד", "בטעות", "שליטה"],
    answer:
      "לא. כל מייל, זימון או קובץ מגיע קודם כטיוטה עם הכפתורים שלח, ערוך ובטל, ויוצא רק אחרי לחיצה על ״שלח״. " +
      "טיוטה שלא אושרה תוך 10 דקות לא נשלחת.",
  },
  {
    id: "accounts",
    question: "עם אילו חשבונות זה עובד?",
    keywords: ["microsoft", "מיקרוסופט", "365", "outlook", "google", "גוגל", "gmail", "onedrive", "drive", "יומן", "חשבונות", "גימייל", "מנהל ה-it", "אישור מנהל", "ארגון"],
    answer:
      "עם Microsoft 365 (Outlook, היומן ו-OneDrive) ועם Google (היומן, Drive ושליחה מ-Gmail). אפשר לחבר אחד מהם או את שניהם. " +
      "יש ארגונים שבהם Microsoft 365 דורש אישור חד-פעמי של מנהל ה-IT, ואז מקבלים טקסט מוכן להעביר אליו.",
  },
  {
    id: "plans",
    question: "מה ההבדל בין בסיסי לפרו?",
    keywords: ["הבדל", "ההבדל", "בסיסי", "פרו", "pro", "השוואה", "להשוות", "שדרוג", "לשדרג", "מה כולל", "כלול"],
    answer:
      `בשני המסלולים: חיבור למייל, ליומן ולקבצים, ניסוח ושליחה באישור, סיכום בוקר, תזכורות והודעות קוליות. בסיסי (${basic.priceIls} ₪): עד ${n(basic.messages)} הודעות בחודש, ` +
      `סוכן ${basic.customAgents === 1 ? "אחד" : n(basic.customAgents)} משלך והיסטוריה ל-90 יום. פרו (${pro.priceIls} ₪): עד ${n(pro.messages)} הודעות בשימוש הוגן, ` +
      `שלושת הסוכנים המובנים ועד ${n(pro.customAgents)} סוכנים משלך, משימות ואוטומציות, היסטוריה לשנה ועדיפות למודל המתקדם. לשדרוג אפשר לכתוב לי ״שדרוג״ בוואטסאפ.`,
  },
  {
    id: "trial",
    question: "איך עובדת תקופת הניסיון?",
    keywords: ["ניסיון", "בחינם", "חינם", "לנסות", "להתנסות", "כרטיס אשראי", "אשראי", "הודעות ראשונות", "אחרי הניסיון", "נגמר", "נגמרו"],
    answer:
      `${TRIAL_MESSAGES} ההודעות הראשונות בחינם, עם חיבור מלא למייל וליומן ובלי כרטיס אשראי. נספרות רק הודעות ששולחים אליי ומקבלות תשובה; ` +
      "לחיצות אישור, תזכורות וסיכום הבוקר לא נספרים. אחרי הניסיון אני שולחת קישור תשלום אישי, בוחרים מסלול, משלמים בכרטיס אשראי וממשיכים באותה שיחה.",
  },
  {
    id: "agents",
    question: "מה הם הסוכנים?",
    keywords: ["סוכן", "סוכנים", "מזכירה", "מתמחה", "מנהלת חשבונות", "הנחיות"],
    answer:
      "סוכן הוא תפקיד עם שם שפונים אליו בתחילת ההודעה, למשל ״@מזכירה מה יש לי מחר?״. יש שלושה מובנים: מזכירה, מתמחה ומנהלת חשבונות. " +
      `אפשר גם ליצור סוכן משלך עם שם, הנחיות ויכולות. בתקופת הניסיון אפשר לנסות את המובנים כמו שהם; בבסיסי יש סוכן ${basic.customAgents === 1 ? "אחד" : n(basic.customAgents)} משלך, ` +
      `ובפרו שלושת המובנים (עם התאמה) ועד ${n(pro.customAgents)} סוכנים משלך.`,
  },
  {
    id: "features",
    question: "מה זה סיכום בוקר ותזכורות?",
    keywords: ["סיכום בוקר", "בוקר", "סיכום", "תזכורת", "תזכורות", "להזכיר", "תזכירי", "פגישות", "פגישה", "זימון"],
    answer:
      "בשעה שבוחרים מגיע סיכום בוקר: הפגישות של היום, התזכורות ומי עוד מחכה לתשובה. תזכורת קובעים במשפט רגיל, " +
      "למשל ״תזכירי לי מחר ב-9 להתקשר לבנק״, והיא מגיעה בוואטסאפ בזמן.",
  },
  {
    id: "files",
    question: "אילו קבצים את קוראת?",
    keywords: ["קובץ", "קבצים", "word", "excel", "powerpoint", "וורד", "אקסל", "מסמך", "מסמכים", "חוזה"],
    answer:
      "אני מחפשת קבצים ב-OneDrive או ב-Google Drive וקוראת קובצי Word, Excel ו-PowerPoint: מסכמת, עונה על שאלות מתוכם ומצרפת אותם לטיוטת מייל.",
  },
  {
    id: "voice",
    question: "אפשר לדבר איתך בהקלטות?",
    keywords: ["הקלטה", "הקלטות", "קולית", "קוליות", "קול", "להקליט", "לדבר", "דיבור"],
    answer: "כן. הקלטה בעברית מתומללת ומטופלת כמו הודעה כתובה, גם כשיש בה מילים באנגלית.",
  },
  {
    id: "whatsapp",
    question: "את רואה את שאר השיחות שלי?",
    keywords: ["שיחות", "שאר השיחות", "קבוצות", "קבוצה", "אנשי קשר", "רואה", "רואה את", "הודעות אחרות"],
    answer: "לא. וואטסאפ מעביר אליי רק הודעות שנשלחות אליי ישירות. שיחות אחרות, קבוצות ואנשי קשר נשארים מחוץ להישג היד שלי.",
  },
  {
    id: "receipt",
    question: "איך מקבלים קבלה?",
    keywords: ["קבלה", "קבלות", "חשבונית", "חשבוניות", "חשבונית מס", "invoice", "הוצאה מוכרת"],
    answer: "אחרי כל חיוב נשלחת קבלה במייל באופן אוטומטי. אפשר גם לכתוב לי ״קבלה״ בוואטסאפ, ואשלח קישור לקבלות האחרונות.",
  },
  {
    id: "cancel",
    question: "איך מבטלים את המנוי?",
    keywords: ["ביטול", "לבטל", "מבטלים", "להפסיק", "הפסקה", "לעזוב", "החזר", "התחייבות"],
    answer:
      "אפשר לבטל בכל רגע, מהאזור האישי או בהודעה ״ביטול מנוי״ בוואטסאפ. המנוי נשאר פעיל עד סוף התקופה ששולמה ולא מתחדש. " +
      "בלי התחייבות.",
  },
  {
    id: "delete",
    question: "איך מוחקים את החשבון?",
    keywords: ["מחיקה", "למחוק", "מוחקים", "מחיקת", "מחיקת החשבון", "לנתק", "ניתוק"],
    answer:
      "באזור האישי, בתחתית העמוד: ״מחיקת החשבון״. המחיקה מוחקת את המידע, מנתקת את החיבורים ל-Microsoft ול-Google ומבטלת את המנוי. " +
      "חיבור בודד אפשר לנתק שם בלי למחוק את החשבון.",
  },
  {
    id: "model",
    question: "איזו בינה מלאכותית עומדת מאחורייך?",
    keywords: ["בינה מלאכותית", "ai", "מודל", "מודלים", "claude", "anthropic", "chatgpt", "gpt", "צ׳אט gpt"],
    answer:
      "ההודעות מעובדות במודלים של Anthropic (Claude). ההסכם איתם אוסר שימוש בנתונים לאימון מודלים, וכל פעולה יוצאת עדיין מחכה ללחיצה על ״שלח״.",
  },
  {
    id: "support",
    question: "יש בעיה בחשבון שלי",
    keywords: ["בעיה", "תקלה", "לא עובד", "לא עובדת", "שגיאה", "באג", "החשבון שלי", "חויבתי", "חיוב כפול", "נציג", "נציגה", "בן אדם", "לדבר עם", "תמיכה", "פנייה", "פניה", "עזרה", "דחוף", "לא מצליח", "לא מצליחה"],
    answer: "בשביל זה עדיף לפתוח פנייה: מתארים מה קרה, ונחזור אליך במייל.",
    ticket: true,
    boost: 2,
  },
];

/* ---------------------------------------------------------------------------------------------------------------- */
/* the deterministic matcher                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Lowercase, niqqud and punctuation out, gershayim / geresh unified, final letters as regular ones, spaces collapsed. */
export function normalizeQuestion(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud and cantillation
    .replace(/["״“”]/g, "״")
    .replace(/['׳‘’`]/g, "׳")
    .replace(/[^\p{L}\p{N}₪@״׳\s-]/gu, " ")
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]!) // "מוצפן" / "מוצפנים", "סוכן" / "סוכנים"
    .replace(/\s+/g, " ")
    .trim();
}

const FINAL_LETTERS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/** Hebrew one-letter prefixes (ו, ה, ב, ל, מ, ש, כ), up to two, maybe with a hyphen ("ל-Outlook"); or "@" ("@מזכירה"). */
const PREFIXES = /^(?:@|[והבלמשכ]{1,2}-?)$/;
/** Plural / construct / possessive endings a keyword may carry: "מחירים", "תזכורות", "מחירי". */
const SUFFIXES = /^(?:ימ|ות|י|ה|ת|כ|מ|נ)?$/; // final letters are already folded: "ים" → "ימ"

function tokenMatches(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (keyword.length < 3) return false;
  const at = token.indexOf(keyword);
  if (at < 0 || at > 3) return false;
  const prefix = token.slice(0, at);
  if (prefix && !PREFIXES.test(prefix)) return false;
  return SUFFIXES.test(token.slice(at + keyword.length));
}

function keywordMatches(norm: string, tokens: string[], keyword: string): boolean {
  const k = normalizeQuestion(keyword);
  if (!k) return false;
  if (k.includes(" ")) return norm.includes(k);
  return tokens.some((t) => tokenMatches(t, k));
}

export interface KnowledgeMatch {
  entry: KnowledgeEntry;
  score: number;
}

/**
 * The entry that fits the question best, or null. A chip (the exact question) wins outright; otherwise every keyword
 * found scores 1 (a phrase 2), and the highest score wins (ties: the earlier entry, the more general one).
 */
export function matchKnowledge(question: string, entries: readonly KnowledgeEntry[] = KNOWLEDGE): KnowledgeMatch | null {
  const norm = normalizeQuestion(question);
  if (!norm) return null;
  const exact = entries.find((e) => normalizeQuestion(e.question) === norm);
  if (exact) return { entry: exact, score: Number.POSITIVE_INFINITY };
  const tokens = norm.split(" ");
  let best: KnowledgeMatch | null = null;
  for (const entry of entries) {
    let score = 0;
    for (const keyword of new Set(entry.keywords)) if (keywordMatches(norm, tokens, keyword)) score += keyword.includes(" ") ? 2 : 1;
    score *= entry.boost ?? 1;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}

export interface KnowledgeAnswer {
  answer: string;
  ticket: boolean;
  suggestions: string[];
  topic: string | null;
}

/** The deterministic answer: the best entry's, or the "not sure" line with the topic chips and the ticket offer. */
export function knowledgeAnswer(question: string): KnowledgeAnswer {
  const hit = matchKnowledge(question);
  if (!hit) return { answer: SUPPORT_COPY.fallback, ticket: true, suggestions: [...SUPPORT_SUGGESTIONS], topic: null };
  return { answer: hit.entry.answer, ticket: Boolean(hit.entry.ticket), suggestions: [], topic: hit.entry.id };
}

/** The knowledge base as text, for the model's system prompt. */
export function knowledgeText(entries: readonly KnowledgeEntry[] = KNOWLEDGE): string {
  return entries.map((e) => `## ${e.question}\n${e.answer}`).join("\n\n");
}
