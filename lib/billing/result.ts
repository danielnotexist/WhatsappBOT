import { BRAND } from "@/lib/brand";
import type { PaymentReturn } from "./service";

/**
 * Where a payment or a card update lands after HYP (/api/pay/return) or after a card link that cannot open
 * (/pay/card/<token>). Signed in on this browser: the personal area with the message, as before. Not signed in (a
 * link from WhatsApp opened on the phone): /pay/done, which shows a fixed text for a result code. The page never
 * shows text taken from the URL, so a crafted link cannot put words in our mouth.
 */
export type PayResult = "paid" | "card" | "declined" | "card_declined" | "failed" | "card_failed" | "card_link" | "card_unavailable";

export function payResultOf(r: PaymentReturn): PayResult {
  const card = r.mode === "card";
  if (r.ok) return card ? "card" : "paid";
  if (r.reason === "declined") return card ? "card_declined" : "declined";
  return card ? "card_failed" : "failed";
}

export function isPayResult(x: unknown): x is PayResult {
  return typeof x === "string" && Object.hasOwn(PAY_RESULTS, x);
}

export const PAY_RESULTS: Record<PayResult, { ok: boolean; tag: string; title: string; text: string }> = {
  paid: { ok: true, tag: "תודה.", title: "התשלום התקבל", text: `החשבון פעיל. הקבלה נשלחת אוטומטית למייל, ו${BRAND.name} ממשיכה בוואטסאפ מאותו מקום.` },
  card: { ok: true, tag: "תודה.", title: "הכרטיס עודכן", text: "החיובים הבאים יהיו בכרטיס החדש. אפשר לחזור לוואטסאפ." },
  declined: { ok: false, tag: "לא בוצע חיוב.", title: "התשלום לא עבר", text: "לפעמים זה הבנק, לפעמים ספרה שגויה. אפשר לנסות שוב, גם עם כרטיס אחר, מהקישור לתשלום בוואטסאפ." },
  card_declined: { ok: false, tag: "הכרטיס הקודם נשאר.", title: "הכרטיס לא אומת", text: "אפשר לנסות שוב, גם עם כרטיס אחר: בוואטסאפ, לכתוב ״עדכון כרטיס״." },
  failed: { ok: false, tag: "בודקים את זה.", title: "התשלום לא הושלם", text: "משהו השתבש באימות התשלום. אם היה חיוב, נבדוק ונחזור עם תשובה במייל." },
  card_failed: { ok: false, tag: "הכרטיס הקודם נשאר.", title: "הכרטיס לא עודכן", text: "משהו השתבש בשמירת הכרטיס. החיובים ממשיכים בכרטיס הקודם, ואפשר לנסות שוב בוואטסאפ: ״עדכון כרטיס״." },
  card_link: { ok: false, tag: "הקישור פג.", title: "הקישור לא בתוקף", text: "הקישור לעדכון הכרטיס תקף לשבוע. לקישור חדש: בוואטסאפ, לכתוב ״עדכון כרטיס״." },
  card_unavailable: { ok: false, tag: "לא בוצע חיוב.", title: "דף עדכון הכרטיס לא נפתח", text: "אפשר לנסות שוב בעוד רגע, מאותו קישור." },
};

/** Signed in → /account with the message (notice or error); otherwise → /pay/done?r=<code>. */
export function payResultUrl(origin: string, opts: { signedIn: boolean; result: PayResult; message: string }): URL {
  if (opts.signedIn) {
    // the personal area's "מנוי" (app/account/areas.ts), where the message is shown
    const dest = new URL("/account", origin);
    dest.searchParams.set("tab", "plan");
    dest.searchParams.set(PAY_RESULTS[opts.result].ok ? "notice" : "error", opts.message);
    return dest;
  }
  const dest = new URL("/pay/done", origin);
  dest.searchParams.set("r", opts.result);
  return dest;
}
