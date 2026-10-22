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
const LEAD = new RegExp(`^(?:(?:אני|רוצה|רוצים|צריך|צריכה|צריכים|אפשר|בבקשה|אשמח|נא|${escapeRegExp(PRODUCT_NAME.toLowerCase())}|היי|הי|שלום)[,\\s]+)+`);
const TAIL = /(?:[,\s]+(?:בבקשה|תודה|שלי|עכשיו|אצלך|פה|כאן|רבה))+$/;

export function normalizeCommand(text: string): string {
  let t = text
    .trim()
    .replace(/[?!.…:]+$/u, "")
    .replace(/["׳״']/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  for (let i = 0; i < 3; i++) t = t.replace(LEAD, "").replace(TAIL, "").trim();
  return t;
}

const PRO = "(?:pro|פרו)";
const SUB = "(?:מנוי|מינוי)";

const PATTERNS: [BillingCommand, RegExp][] = [
  [
    "invoice",
    /^(?:(?:לשלוח|שלחי|תשלחי|להציג|תראי|הראי|לקבל|איפה)(?: לי)? )?(?:את )?ה?(?:קבל(?:ה|ות)|חשבוני(?:ת|ות)(?: מס)?)(?: (?:על|של) ה?(?:תשלום|חיוב|מנוי|מינוי))?(?: ה?(?:אחרונה|אחרונות))?$/,
  ],
  ["upgrade", new RegExp(`^(?:לשדרג|שדרוג)(?: את)?(?: ה?(?:${SUB}|מסלול|חבילה))?(?: (?:ל|אל )(?:ה?מסלול )?ה?${PRO})?$`)],
  ["upgrade", new RegExp(`^(?:לעבור|מעבר|לעלות)(?: את ה?(?:${SUB}|מסלול))? (?:ל|אל )(?:ה?מסלול )?ה?${PRO}$`)],
  ["downgrade", new RegExp(`^(?:לעבור|מעבר|לרדת|לחזור|להוריד|לשנמך)(?: את ה?(?:${SUB}|מסלול))? (?:ל|אל )(?:ה?מסלול )?ה?בסיסי$`)],
  ["cancel", new RegExp(`^(?:לבטל|ביטול|להפסיק|הפסקת|לעצור)(?: את)? ה?${SUB}$`)],
  ["renew", new RegExp(`^(?:לחדש|חידוש|חדש|להמשיך|המשך|להפעיל מחדש|להפעיל שוב|הפעלה מחדש)(?: את)? ה?${SUB}$`)],
  ["card", /^(?:לעדכן|עדכון|להחליף|החלפת|לשנות|שינוי)(?: את)? ה?(?:כרטיס(?: ה?אשראי)?|אמצעי ה?תשלום)$/],
  ["retry", /^(?:ניסיון חוזר|לנסות שוב לחייב|לחייב שוב|חיוב חוזר|להסדיר(?: את)? ה?תשלום|הסדרת ה?תשלום|לשלם|תשלום)$/],
  ["status", new RegExp(`^(?:מה )?(?:מצב ה?${SUB}|ה?${SUB}|ה?מסלול|כמה הודעות נשארו(?: לי)?(?: החודש)?)$`)],
  ["refund", /^(?:החזר(?: כספי)?|לקבל החזר(?: כספי)?|זיכוי על ה?(?:מנוי|מינוי))$/],
];

export function billingCommandOf(text: string | null | undefined): BillingCommand | null {
  if (!text || text.length > 80) return null;
  const t = normalizeCommand(text);
  if (!t) return null;
  for (const [cmd, re] of PATTERNS) if (re.test(t)) return cmd;
  return null;
}
