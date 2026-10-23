import { PRODUCT_NAME } from "@/lib/brand";
import type { ConnectionProvider, ConnectionRow } from "@/lib/db/types";

/**
 * Chat shortcuts that need no model: "לחבר את המייל", "לחבר את גוגל", "חבר שוב" → a one-time connect link,
 * and an expired connection + a mail/calendar/files request → a reconnect link (PLAN §1, §11 milestones 4/6).
 * Note: JS `\b` is ASCII-only, so Hebrew words are delimited with lookaheads instead.
 */
const CONNECT_VERB = /^(?:לחבר|חבר|חברי|תחבר|תחברי|נחבר|חיבור|להתחבר|תתחבר|תתחברי)(?=\s|$)/;
const AGAIN_ONLY = /^(?:לחבר|חבר|תחבר)\s+(?:שוב|מחדש)$/;
/** "ג׳ימייל" in every spelling people type: geresh or apostrophe (normalized first), with or without them, "ג׳י מייל", "גמייל". */
const GMAIL_HE = "ג'?י ?מייל|ג'?ימיל|גמייל";
const GOOGLE_WORDS = new RegExp(`google|gmail|g-mail|גוגל|${GMAIL_HE}|דרייב|drive`, "i");
const MICROSOFT_WORDS = /microsoft|outlook|office|365|מיקרוסופט|אאוטלוק|אופיס/i;
const TOPIC_WORDS = /מייל|יומן|קבצ|קובץ|שוב|מחדש/;
const WORK_TOPICS = new RegExp(`מייל|יומן|פגיש|קובץ|מסמך|סיכום|דרייב|drive|gmail|${GMAIL_HE}`, "i");
/** Polite openers before the verb: "אני רוצה לחבר…", "אפשר לחבר…", "<name>, תחברי…". */
const LEAD = new RegExp(`^(?:(?:אני|רוצה|צריך|צריכה|אפשר|בבקשה|בוא|בואי|היי|הי|${PRODUCT_NAME})[,\\s]+)+`);
/**
 * A provider's name as the whole message ("הג׳ימייל", "גוגל", "Outlook") — typically the answer to "לאיזה חשבון?" or a
 * correction right after a link for the other provider. A connect request unless that provider is already active.
 */
const BARE_GOOGLE = new RegExp(`^(?:את )?ה?(?:${GMAIL_HE}|gmail|גוגל|google)(?: (?:דרייב|drive))?(?: שלי)?$`, "i");
const BARE_MICROSOFT = /^(?:את )?ה?(?:מיקרוסופט|microsoft|אאוטלוק|outlook|אופיס|office)(?: 365)?(?: שלי)?$/i;

/** Geresh / curly / back quotes → "'", spaces collapsed, trailing punctuation dropped, the opener removed. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/[׳’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?…]+$/u, "")
    .replace(LEAD, "")
    .trim();
}

const has = (cs: ConnectionRow[], provider: ConnectionProvider, status?: ConnectionRow["status"]) => cs.some((c) => c.provider === provider && (status ? c.status === status : c.status !== "revoked"));

/** Which provider a connect request is about, or null when the text is not a connect request. */
export function connectRequestProvider(text: string, connections: ConnectionRow[]): ConnectionProvider | null {
  const t = normalize(text);
  if (BARE_GOOGLE.test(t)) return has(connections, "google", "active") ? null : "google";
  if (BARE_MICROSOFT.test(t)) return has(connections, "microsoft", "active") ? null : "microsoft";
  if (!CONNECT_VERB.test(t)) return null;
  const google = GOOGLE_WORDS.test(t);
  const microsoft = MICROSOFT_WORDS.test(t);
  if (!google && !microsoft && !TOPIC_WORDS.test(t)) return null;
  if (google && !microsoft) return "google";
  if (microsoft && !google) return "microsoft";
  if (AGAIN_ONLY.test(t) && has(connections, "google", "expired") && !has(connections, "microsoft", "expired")) return "google";
  // generic ("לחבר את המייל"): the provider the user already uses, Microsoft by default (main audience)
  if (has(connections, "google") && !has(connections, "microsoft")) return "google";
  return "microsoft";
}

/** An expired connection blocks a mail/calendar/files request and nothing else can serve it → reconnect link. */
export function reconnectProviderFor(text: string, connections: ConnectionRow[]): ConnectionProvider | null {
  const t = normalize(text);
  if (!WORK_TOPICS.test(t)) return null;
  const activeMs = has(connections, "microsoft", "active");
  const activeGoogle = has(connections, "google", "active");
  if (activeMs || activeGoogle) return null; // a live connection can still answer
  if (has(connections, "microsoft", "expired") && !GOOGLE_WORDS.test(t)) return "microsoft";
  if (has(connections, "google", "expired")) return "google";
  return null;
}

export function providerLabel(provider: ConnectionProvider): string {
  return provider === "google" ? "Google" : "Microsoft 365";
}
