/**
 * WhatsApp-native billing strings (one-tap upgrade / retry / renew, receipts ("קבלה") in chat, renewal nudges, cancel/downgrade),
 * keyed by the ids in docs/copy/bot-copy-billing.md (source of truth; a test checks every id is documented there).
 * Shared billing strings (bill.cancel_confirm, bill.cancelled, bill.cancel_kept, bill.status, bill.plan_limit_reached)
 * stay in lib/copy/bot.ts. Neutral phrasing toward the user; עלזה speaks about herself in the feminine.
 */
import type { ReplyButton } from "@/lib/wa/types";

/** "יום אחד" / "יומיים" / "12 ימים" */
export function daysHe(n: number): string {
  return n === 1 ? "יום אחד" : n === 2 ? "יומיים" : `${n} ימים`;
}

export interface UpgradeOfferParts {
  amount: string;
  vat: string;
  daysLeft: number;
  periodEnd: string;
  nextAmount: string;
  last4: string;
  /** e.g. the 750-limit notice, as the first paragraph */
  lead?: string;
  /** after the next amount: "לחודש" (default) / "לשנה" on the annual cycle */
  per?: string;
}

/** "החיוב החודשי" / "החיוב השנתי" — the renewal, in the nudges (lib/billing/service.ts). */
export const renewalWhatHe = (annual: boolean) => (annual ? "החיוב השנתי" : "החיוב החודשי");

export interface InvoiceLine {
  date: string;
  amount: string;
  desc: string;
  link: string;
}

export const billCopy = {
  // ---- offers ----
  "bill.upgrade_offer": (o: UpgradeOfferParts) =>
    `${o.lead ? `${o.lead}\n\n` : ""}*שדרוג למסלול פרו*\nעד 3,000 הודעות בחודש, שלושת הסוכנים המובנים ועד 3 סוכנים משלך, ואוטומציות — מיד.\n\nלתשלום עכשיו: ${o.amount} ₪ (כולל מע״מ ${o.vat} ₪)\nזה ההפרש היחסי עד סוף התקופה הנוכחית (${daysHe(o.daysLeft)}, עד ${o.periodEnd}).\nמ-${o.periodEnd}: ${o.nextAmount} ₪ ${o.per ?? "לחודש"}.\nהחיוב בכרטיס המסתיים ב-${o.last4}. הקבלה תגיע לכאן ולמייל.\n\nלשדרג?`,
  "bill.limit_lead": (resetDate: string) => `הגעת ל-750 ההודעות של המסלול הבסיסי החודש. המכסה מתחדשת ב-${resetDate}, ותזכורות וסיכום הבוקר ממשיכים כרגיל.`,
  "bill.limit_reminder": (resetDate: string) => `המכסה של המסלול הבסיסי לחודש הזה נוצלה (מתחדשת ב-${resetDate}), ולכן ההודעה הזו לא טופלה. לשדרוג למסלול פרו — לכתוב "שדרוג".`,
  "bill.retry_offer": (o: { amount: string; vat: string; last4: string; what?: string }) => `*ניסיון חוזר לחיוב*\n${o.what ?? "החיוב החודשי"} שלא עבר: ${o.amount} ₪ (כולל מע״מ ${o.vat} ₪), בכרטיס המסתיים ב-${o.last4}.\n\nלחייב עכשיו?`,
  "bill.renew_offer": (o: { plan: string; amount: string; vat: string; periodEnd: string; last4: string; period?: string }) =>
    `*חידוש מנוי ${o.plan}*\nלתשלום עכשיו: ${o.amount} ₪ (כולל מע״מ ${o.vat} ₪) — ${o.period ?? "חודש"}, עד ${o.periodEnd}.\nהחיוב בכרטיס המסתיים ב-${o.last4}. הקבלה תגיע לכאן ולמייל.\n\nלחדש?`,
  "bill.resume_offer": (o: { periodEnd: string; amount: string }) => `המנוי מבוטל ופעיל עד ${o.periodEnd}. להמשיך אותו? עכשיו לא יבוצע חיוב — החיוב הבא (${o.amount} ₪) יהיה ב-${o.periodEnd}, כרגיל.`,
  "bill.cancel_confirm_paused": () => "לבטל את המנוי? לא יהיו יותר ניסיונות חיוב, וההגדרות נשמרות 90 יום למקרה שתרצו לחזור.",
  "bill.keep_pro_confirm": (o: { periodEnd: string; amount: string; basicAmount?: string }) =>
    `המעבר למסלול הבסיסי מתוכנן ל-${o.periodEnd}. לבטל אותו ולהישאר בפרו? עכשיו לא יבוצע חיוב — החיוב הבא, ב-${o.periodEnd}, יהיה ${o.amount} ₪ (במקום ${o.basicAmount ?? "99"} ₪).`,
  "bill.downgrade_confirm": (periodEnd: string, price = "99 ₪ לחודש") =>
    `לעבור למסלול הבסיסי? השינוי ייכנס לתוקף ב-${periodEnd}: עד אז נשארות כל היכולות של פרו, ומשם ${price} (עד 750 הודעות בחודש, בלי הסוכנים המובנים, וסוכן אחד משלך: הוותיק נשאר פעיל, והשאר נשמרים נעולים). על התקופה הנוכחית אין החזר.`,
  "bill.cancel_confirm_annual": (periodEnd: string) =>
    `לבטל את המנוי השנתי? הוא יישאר פעיל עד ${periodEnd}, ואחרי זה לא יחויב. על החלק שנותר מהשנה אין החזר. ההגדרות נשמרות 90 יום למקרה שתרצו לחזור.`,

  // ---- results ----
  "bill.upgrade_done": (o: { amount: string; nextAmount: string; nextDate: string; resendHint: boolean }) =>
    `שודרג. מסלול פרו פעיל מעכשיו — עד 3,000 הודעות בחודש, שלושת הסוכנים המובנים זמינים, ואפשר ליצור עד 3 סוכנים משלך.\nחויבו ${o.amount} ₪. החיוב הבא: ${o.nextAmount} ₪ ב-${o.nextDate}.\nהקבלה בהודעה הבאה.${o.resendHint ? "\n\nההודעה האחרונה לא טופלה בגלל המכסה — אפשר לשלוח אותה שוב." : ""}`,
  "bill.charge_ok_resumed": (o: { amount: string; nextDate: string }) => `החיוב עבר והחשבון פעיל. חויבו ${o.amount} ₪; החיוב הבא: ${o.nextDate}.\nהקבלה בהודעה הבאה.`,
  "bill.renewed": (o: { plan: string; amount: string; nextDate: string }) => `המנוי חודש — מסלול ${o.plan} פעיל. חויבו ${o.amount} ₪; החיוב הבא: ${o.nextDate}.\nהקבלה בהודעה הבאה.`,
  "bill.resumed": (o: { periodEnd: string; amount: string }) => `המנוי ממשיך. החיוב הבא: ${o.amount} ₪ ב-${o.periodEnd}.`,
  "bill.downgrade_scheduled": (periodEnd: string, price = "99 ₪ לחודש") => `נקבע. מ-${periodEnd} המסלול יהיה בסיסי, ${price}. עד אז הכול נשאר כמו שהוא. כדי להישאר בפרו — לכתוב "שדרוג".`,
  "bill.downgrade_kept": () => "נשארים במסלול פרו. לא שיניתי כלום.",
  "bill.downgrade_cleared": () => "המעבר לבסיסי בוטל — נשארים במסלול פרו, והחיוב הבא כרגיל.",
  "bill.keep_pro_declined": () => "בסדר, המעבר לבסיסי נשאר כמתוכנן. לא שיניתי כלום.",
  "bill.offer_declined": () => "בסדר, לא בוצע חיוב ולא שיניתי כלום.",
  "bill.renewal_charged": (o: { plan: string; amount: string; nextDate: string; what?: string }) => `${o.what ?? "החיוב החודשי"} עבר: ${o.amount} ₪, מסלול ${o.plan}. החיוב הבא: ${o.nextDate}.\nהקבלה בהודעה הבאה.`,
  "bill.annual_switched": (o: { plan: string; amount: string; nextAmount: string; nextDate: string }) =>
    `עברת לחיוב שנתי — מסלול ${o.plan} פעיל לשנה. חויבו ${o.amount} ₪ (אחרי קיזוז הימים שנותרו בחודש). החיוב הבא: ${o.nextAmount} ₪ ב-${o.nextDate}.\nמכסת ההודעות נשארת חודשית. הקבלה בהודעה הבאה.`,

  // ---- states that need no approval ----
  "bill.already_pro": () => "המסלול כבר פרו — עד 3,000 הודעות בחודש, כולל הסוכנים המובנים.",
  "bill.already_basic": () => "המסלול כבר בסיסי.",
  "bill.already_active": (nextDate: string) => `המנוי פעיל, ואין חיוב שממתין. החיוב הבא: ${nextDate}.`,
  "bill.already_cancelled": (periodEnd: string) => `המנוי כבר מבוטל ופעיל עד ${periodEnd}. להמשיך אותו — לכתוב "חידוש מנוי".`,
  "bill.cancel_not_active": () => "אין מנוי פעיל לבטל.",
  "bill.upgrade_needs_settle": () => "לפני שדרוג צריך להסדיר את החיוב החודשי שלא עבר:",
  "bill.upgrade_cancelled_first": (periodEnd: string) => `המנוי מבוטל ופעיל עד ${periodEnd}. כדי לשדרג, קודם ממשיכים את המנוי — לכתוב "חידוש מנוי".`,
  "bill.upgrade_wait_renewal": () => "החיוב החודשי מתבצע בימים אלה. אפשר לשדרג מיד אחריו — לכתוב שוב \"שדרוג\".",
  "bill.trial_pay_link": (payLink: string) =>
    `כדי להפעיל מנוי — בסיסי 99 ₪ או פרו 299 ₪ לחודש, כולל מע״מ, או בתשלום שנתי עם חודשיים מתנה — יש דף תשלום מאובטח:\n${payLink}\nאחרי התשלום הראשון, שדרוגים וחידושים נעשים כאן בלחיצה.`,
  "bill.no_saved_card": (payLink: string) => `אין כרטיס שמור לחיוב בלחיצה. אפשר להשלים בדף התשלום המאובטח:\n${payLink}`,

  // ---- approval guards ----
  "bill.approval_expired": () => "האישור הקודם כבר לא בתוקף (עברו יותר מ-10 דקות), ולכן לא בוצע חיוב. הנה הצעה מעודכנת:",
  "bill.approval_used": () => "ההצעה הזו כבר טופלה, ולא יבוצע חיוב נוסף.",
  "bill.approval_wrong_number": () => "האישור הזה לא שייך למספר הזה, ולכן לא בוצע דבר.",
  "bill.approval_not_found": () => `לא מצאתי את ההצעה הזו. אפשר לבקש שוב — למשל "שדרוג" או "ניסיון חוזר".`,
  "bill.charge_in_progress": () => "יש חיוב קודם שעדיין בבדיקה. כדי לא לחייב פעמיים, לא אבצע חיוב נוסף עד שיתברר — אעדכן כאן.",
  "bill.offer_stale": () => "המצב של המנוי השתנה מאז ההצעה, ולכן לא בוצע חיוב. אפשר לבקש שוב.",

  // ---- charge failures (nothing was charged) ----
  "bill.charge_failed_declined": (o: { code: string; amount: string }) => `החיוב לא עבר — חברת האשראי לא אישרה (קוד ${o.code}), ולכן לא בוצע חיוב. אפשר לנסות שוב (${o.amount} ₪), או לעדכן כרטיס.`,
  "bill.charge_failed_card": (code: string) => `הכרטיס השמור לא אושר לחיוב (קוד ${code}), ולכן לא בוצע חיוב. כדי להמשיך — עדכון כרטיס בדף המאובטח של HYP.`,
  "bill.charge_failed_temporary": (amount: string) => `הייתה תקלת תקשורת מול חברת האשראי, ולא בוצע חיוב. אפשר לנסות שוב בעוד רגע (${amount} ₪).`,
  "bill.charge_failed_config": () => "יש תקלה זמנית במערכת התשלומים שלנו, ולא בוצע חיוב. כבר מטפלים בזה — אפשר לנסות שוב מאוחר יותר.",
  "bill.charge_unknown": () => "לא התקבלה תשובה ברורה מחברת האשראי. כדי לא לחייב פעמיים, לא אנסה שוב בינתיים — אבדוק ואעדכן כאן. אם החיוב עבר, הקבלה תגיע לכאן ולמייל.",
  "bill.card_expired": (last4: string) => `תוקף הכרטיס השמור (מסתיים ב-${last4}) עבר, ולכן לא בוצע חיוב. כדי להמשיך — עדכון כרטיס בדף המאובטח של HYP.`,

  // ---- renewal, monthly or annual (days 1 / 3 / 5, pause after day 7); `what` = renewalWhatHe ----
  "bill.renewal_failed_day1": (o: { amount: string; nextTry: string; what?: string }) =>
    `${o.what ?? "החיוב החודשי"} (${o.amount} ₪) לא עבר הפעם. השירות ממשיך כרגיל, ואנסה שוב ב-${o.nextTry}.\nאפשר גם לנסות שוב כבר עכשיו, או לעדכן כרטיס.`,
  "bill.renewal_failed_day3": (o: { amount: string; nextTry: string }) => `גם הניסיון השני לחייב (${o.amount} ₪) לא עבר. כדאי לבדוק עם הבנק או לעדכן כרטיס. אנסה שוב ב-${o.nextTry}.`,
  "bill.renewal_failed_day5": (o: { amount: string; lastTry: string }) => `החיוב (${o.amount} ₪) לא עבר גם בניסיון השלישי. הניסיון האחרון יהיה ב-${o.lastTry}; אם גם הוא לא יעבור, החשבון יושהה עד להסדרה — כל ההגדרות והחיבורים נשמרים.`,
  "bill.renewal_card_invalid": (o: { amount: string; until: string; code: string; what?: string }) =>
    `${o.what ?? "החיוב החודשי"} (${o.amount} ₪) לא עבר: הכרטיס השמור לא אושר לחיוב (קוד ${o.code}), ולכן לא אנסה אותו שוב. השירות ממשיך עד ${o.until}. אחרי עדכון הכרטיס אפשר לחייב כאן בלחיצה.`,
  "bill.renewal_paused": (amount: string, what = "החיוב החודשי") =>
    `${what} (${amount} ₪) לא עבר גם בניסיון האחרון, ולכן החשבון מושהה. כל ההגדרות, החיבורים והתזכורות שמורים — ברגע שהתשלום יוסדר, ממשיכים מאותו מקום.`,
  "bill.paused_reply": () => "החשבון מושהה עד להסדרת התשלום. אפשר להסדיר כאן בלחיצה:",

  // ---- receipts (HYP PrintHesh — the owner calls them "קבלה") & card ----
  "bill.invoice_caption": (o: { amount: string; date: string }) => `קבלה — ${o.amount} ₪, ${o.date}`,
  "bill.invoice_link": (o: { amount: string; date: string; link: string }) => `קבלה — ${o.amount} ₪, ${o.date}:\n${o.link}`,
  "bill.invoice_list": (lines: InvoiceLine[]) => `*הקבלות האחרונות*\n${lines.map((l) => `• ${l.date} — ${l.amount} ₪ — ${l.desc}\n${l.link}`).join("\n")}\n\nהקישורים תקפים ל-90 יום; כל הקבלות נשלחות גם למייל.`,
  "bill.invoice_none": () => "עדיין אין קבלות. אחרי החיוב הראשון הקבלה תגיע לכאן ולמייל.",
  "bill.card_update_link": (link: string) => `הנה דף מאובטח של HYP לעדכון הכרטיס — רק אימות, בלי חיוב:\n${link}\nהקישור תקף ל-7 ימים. בסיום העדכון יופיע אישור בדף.`,
  "bill.card_updated": (last4: string) => `הכרטיס עודכן (מסתיים ב-${last4}). החיובים הבאים יהיו בכרטיס הזה.`,
  "bill.card_update_failed": (link: string) => `עדכון הכרטיס לא הושלם, והכרטיס הקודם נשאר. אפשר לנסות שוב:\n${link}`,
  "bill.card_update_charged": () => "עדכון הכרטיס לא הושלם בגלל תקלה בהגדרות התשלום אצלנו, והכרטיס הקודם נשאר. אם הופיע חיוב של 1 ₪ על האימות — הוא יבוטל. כבר מטפלים בזה.",
  "bill.refund_request": () => "בקשות להחזר כספי מטופלות ידנית, מול הקבלה. הבקשה נרשמה, והתשובה תישלח למייל של החשבון.",

  // ---- חבר מביא חבר (lib/referrals) ----
  "bill.referral_link": (link: string) =>
    `*חבר מביא חבר*\nהקישור האישי שלך:\n${link}\n\nחבר שנרשם דרכו ומשלם בפעם הראשונה — ושניכם מקבלים חודש חינם: החיוב הבא של כל אחד נדחה ב-30 יום. עד 12 חודשים חינם בשנה.`,
  "bill.referral_reward_referrer": (o: { nextDate: string }) => `חבר שהצטרף דרך הקישור שלך שילם עכשיו בפעם הראשונה, ולכן קיבלת חודש חינם: החיוב הבא נדחה ל-${o.nextDate}. תודה שהמלצת.`,
  "bill.referral_reward_referred": (o: { nextDate: string }) => `ונעים לדעת: הצטרפת דרך הקישור של חבר, ולכן קיבלת חודש חינם — החיוב הבא נדחה ל-${o.nextDate}.`,
  "bill.referral_reward_pending": () => "חבר שהצטרף דרך הקישור שלך שילם עכשיו בפעם הראשונה, ולכן קיבלת חודש חינם. הוא יתווסף למנוי עם התשלום הבא, והחיוב שאחריו יידחה ב-30 יום.",
  "bill.referral_credit_applied": (o: { nextDate: string }) => `החודש החינמי מ״חבר מביא חבר״ נוסף למנוי: החיוב הבא נדחה ל-${o.nextDate}.`,
} as const;

export type BillCopyId = keyof typeof billCopy;

/** Billing buttons. Ids come back in `button_reply.id` (or a template quick-reply payload): bill:ok:<approval> / bill:no:<approval> / bill:card. */
export const billButtons = {
  offer: (approvalId: string, yes: string, no = "לא עכשיו") =>
    [
      { id: `bill:ok:${approvalId}`, title: yes },
      { id: `bill:no:${approvalId}`, title: no },
    ] satisfies ReplyButton[],
  retryOrCard: (approvalId: string) =>
    [
      { id: `bill:ok:${approvalId}`, title: "ניסיון חוזר" },
      { id: "bill:card", title: "עדכון כרטיס" },
    ] satisfies ReplyButton[],
  card: [{ id: "bill:card", title: "עדכון כרטיס" }] satisfies ReplyButton[],
};

/** First-button labels per offer kind ([שדרוג עכשיו] [לא עכשיו] etc.). */
export const OFFER_LABELS = {
  upgrade: { yes: "שדרוג עכשיו", no: "לא עכשיו" },
  retry: { yes: "חיוב עכשיו", no: "לא עכשיו" },
  renew: { yes: "חידוש עכשיו", no: "לא עכשיו" },
  resume: { yes: "המשך מנוי", no: "לא עכשיו" },
  cancel: { yes: "בטל מנוי", no: "השאר פעיל" },
  downgrade: { yes: "מעבר לבסיסי", no: "להישאר בפרו" },
  keep_pro: { yes: "להישאר בפרו", no: "לא עכשיו" },
} as const;
