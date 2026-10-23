/**
 * Billing commands typed in the chat ("קבלה", "שדרוג", "ביטול מנוי"…). Matching is deliberately strict — the
 * whole message must be the command (after a few polite fillers), so "תזכירי לי לבטל את המנוי של נטפליקס" or
 * "תשלחי לרונית את הקבלה" still go to the assistant. The owner calls the HYP document "קבלה"; "חשבונית" is
 * accepted as a synonym. A false positive is harmless anyway: every change is an
 * offer with buttons, nothing happens without a press.
 */
import { PRODUCT_NAME } from "@/lib/brand";

export type BillingCommand = "invoice" | "upgrade" | "downgrade" | "cancel" | "renew" | "card" | "retry" | "status" | "refund";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Polite fillers before the command — including the assistant's name (lib/brand.ts), e.g. "<name>, קבלה בבקשה". */
const LEAD = new RegExp(`^(?:(?:אני|רוצה|רוצים|צריך|צריכה|צריכים|אפשר|בבקשה|אשמח|נא|יאללה|${escapeRegExp(PRODUCT_NAME.toLowerCase())}|היי|הי|שלום)[,\\s]+)+`);
const TAIL = /(?:[,\s]+(?:בבקשה|תודה|שלי|עכשיו|אצלך|פה|כאן|רבה|אחי|אחותי))+$/;
/** The same without "שלי": the status patterns need it ("מה המסלול שלי" is about the plan, "מה המסלול" may be a route). */
const TAIL_KEEP_MINE = /(?:[,\s]+(?:בבקשה|תודה|עכשיו|אצלך|פה|כאן|רבה|אחי|אחותי))+$/;

export function normalizeCommand(text: string, opts: { keepMine?: boolean } = {}): string {
  const tail = opts.keepMine ? TAIL_KEEP_MINE : TAIL;
  let t = text
    .trim()
    .replace(/[?!.…:]+$/u, "")
    .replace(/["׳״']/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  for (let i = 0; i < 3; i++) t = t.replace(LEAD, "").replace(tail, "").trim();
  return t;
}

const PRO = "(?:pro|פרו)";
const SUB = "(?:מנוי|מינוי)";
/** "המנוי", "מסלול", "חבילת" — what is being upgraded */
const PLAN_NOUN = `(?:${SUB}|מסלול|חבילה|חבילת)`;
/** " לפרו", " למנוי פרו", " למסלול הפרו", " אל הפרו" */
const TO_PRO = ` (?:ל|אל )(?:ה?${PLAN_NOUN} )?ה?${PRO}`;
/** "לשדרג", the common typo "לשדרוג", and the noun — alone they are the documented command */
const UPGRADE_VERB = "(?:לשדרג|לשדרוג|שדרוג|נשדרג|אשדרג)";
/**
 * The imperatives ("תשדרגי", "שדרג") only with the plan: alone, or with "לי", they are a natural reply to a draft
 * ("improve it") — "תשדרגי אותי לפרו", "שדרגי את המנוי", "תשדרג למסלול פרו".
 */
const UPGRADE_IMPERATIVE = "(?:שדרג|שדרגי|תשדרג|תשדרגי)";

const PATTERNS: [BillingCommand, RegExp][] = [
  [
    "invoice",
    /^(?:(?:לשלוח|שלחי|תשלחי|להציג|תראי|הראי|לקבל|איפה)(?: לי)? )?(?:את )?ה?(?:קבל(?:ה|ות)|חשבוני(?:ת|ות)(?: מס)?)(?: (?:על|של) ה?(?:תשלום|חיוב|מנוי|מינוי))?(?: ה?(?:אחרונה|אחרונות))?$/,
  ],
  // "לשדרג", "אני רוצה לשדרג למנוי פרו" — never "תשדרגי את המצגת" (the object must be the plan)
  ["upgrade", new RegExp(`^${UPGRADE_VERB}(?:(?: אותי| לי)?(?: את)? ה?${PLAN_NOUN}(?:${TO_PRO})?|(?: אותי)?(?:${TO_PRO})?)$`)],
  // "תשדרגי אותי", "שדרגי את המנוי", "תשדרג לפרו" — never a bare "תשדרגי" / "תשדרגי לי"
  ["upgrade", new RegExp(`^${UPGRADE_IMPERATIVE}(?: לי)?(?: אותי(?: את ה?${PLAN_NOUN})?(?:${TO_PRO})?| (?:את )?ה?${PLAN_NOUN}(?:${TO_PRO})?|${TO_PRO})$`)],
  ["upgrade", new RegExp(`^(?:לעבור|מעבר|לעלות|להעביר אותי|תעביר אותי|תעבירי אותי)(?: את ה?${PLAN_NOUN})?${TO_PRO}$`)],
  // the plan's name alone: "מנוי פרו", "מסלול פרו", "פרו"
  ["upgrade", new RegExp(`^(?:ה?${PLAN_NOUN} )?ה?${PRO}$`)],
  // "איך משדרגים?", "איך אפשר לשדרג את המנוי?", "איך עוברים לפרו?"
  ["upgrade", new RegExp(`^איך(?: אפשר| אני)? (?:לשדרג|משדרגים|אשדרג)(?: את ה?${PLAN_NOUN})?(?:${TO_PRO})?$`)],
  ["upgrade", new RegExp(`^איך(?: אפשר| אני)? (?:לעבור|עוברים|אעבור)${TO_PRO}$`)],
  ["downgrade", new RegExp(`^(?:לעבור|מעבר|לרדת|לחזור|להוריד|לשנמך)(?: את ה?(?:${SUB}|מסלול))? (?:ל|אל )(?:ה?מסלול )?ה?בסיסי$`)],
  ["cancel", new RegExp(`^(?:לבטל|ביטול|להפסיק|הפסקת|לעצור)(?: את)? ה?${SUB}$`)],
  ["renew", new RegExp(`^(?:לחדש|חידוש|חדש|להמשיך|המשך|להפעיל מחדש|להפעיל שוב|הפעלה מחדש)(?: את)? ה?${SUB}$`)],
  ["card", /^(?:לעדכן|עדכון|להחליף|החלפת|לשנות|שינוי)(?: את)? ה?(?:כרטיס(?: ה?אשראי)?|אמצעי ה?תשלום)$/],
  ["retry", /^(?:ניסיון חוזר|לנסות שוב לחייב|לחייב שוב|חיוב חוזר|להסדיר(?: את)? ה?תשלום|הסדרת ה?תשלום|לשלם|תשלום)$/],
  ["refund", /^(?:החזר(?: כספי)?|לקבל החזר(?: כספי)?|זיכוי על ה?(?:מנוי|מינוי))$/],
];

/** "אני" / "יש לי" / "שלי" after "מסלול": about the plan. Alone, "איזה מסלול?" may be a route. */
const MINE = "(?: (?:אני|יש לי|אני נמצא|אני נמצאת|שלי))";
/**
 * Status, tested on the text with "שלי" kept. "חבילה" is never a status word: "איזו חבילה?" after a DHL mail is about
 * a delivery, and the assistant answers a plan question in that wording from the account facts anyway.
 */
const STATUS_PATTERNS: RegExp[] = [
  new RegExp(`^(?:מה )?(?:מצב ה?${SUB}|ה?${SUB}|כמה הודעות (?:נשארו|יש)(?: לי)?(?: החודש| בניסיון)?)(?: שלי)?$`),
  new RegExp(`^(?:מה )?(?:מצב )?ה?מסלול${MINE}$`),
  // "איזה מנוי אני?", "באיזה מסלול אני?", "איזה סוג מנוי יש לי?", "מה סוג המנוי?"
  new RegExp(`^ב?(?:איזה|איזו|מה)(?: סוג)?(?: של)? ה?${SUB}(?: (?:אני|יש לי|יש|זה|אני נמצא|אני נמצאת|שלי))?$`),
  new RegExp(`^ב?(?:איזה|מה)(?: סוג)?(?: של)? ה?מסלול${MINE}$`),
];

export function billingCommandOf(text: string | null | undefined): BillingCommand | null {
  if (!text || text.length > 80) return null;
  const t = normalizeCommand(text);
  if (!t) return null;
  for (const [cmd, re] of PATTERNS) if (re.test(t)) return cmd;
  const mine = normalizeCommand(text, { keepMine: true });
  if (STATUS_PATTERNS.some((re) => re.test(mine))) return "status";
  return null;
}
