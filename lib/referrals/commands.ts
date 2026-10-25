import { billCopy } from "@/lib/copy/bot-billing";
import { normalizeCommand } from "@/lib/billing/commands";
import type { Db } from "@/lib/db/types";
import { referralLinkOf } from "./service";

/**
 * "חבר מביא חבר" in WhatsApp: the whole message is the command (after the usual polite fillers — "אפשר את הקישור של
 * חבר מביא חבר?" is not, "חבר מביא חבר בבקשה" is), so a sentence that only mentions a friend still goes to the
 * assistant. Answered without the model and not counted, on every plan (like "כניסה").
 */
const REFERRAL_RE = /^(?:ה?קישור (?:של |ל)?)?(?:חבר מביא חבר|חבר מביא|להזמין חבר(?:ה)?|הזמנת חבר(?:ה|ים)?|הזמן חבר|קישור הזמנה|קישור לחבר)$/;

export function isReferralCommand(text: string | null | undefined): boolean {
  if (!text || text.length > 60) return false;
  return REFERRAL_RE.test(normalizeCommand(text));
}

/** The personal link (the code is made on first use). true = handled. */
export async function handleReferralKeyword(db: Db, userId: string, appUrl: string, text: string | null | undefined, say: (text: string) => Promise<void>): Promise<boolean> {
  if (!isReferralCommand(text)) return false;
  const { link } = await referralLinkOf(db, userId, appUrl);
  await db.addAudit({ user_id: userId, action: "referral.link", result: "whatsapp" });
  await say(billCopy["bill.referral_link"](link));
  return true;
}
