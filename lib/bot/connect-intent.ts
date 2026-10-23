import { PRODUCT_NAME } from "@/lib/brand";
import type { ConnectionProvider, ConnectionRow } from "@/lib/db/types";

/**
 * Chat shortcuts that need no model: "לחבר את המייל", "לחבר את גוגל", "חבר שוב" → a one-time connect link,
 * and an expired connection + a mail/calendar/files request → a reconnect link (PLAN §1, §11 milestones 4/6).
 * Note: JS `\b` is ASCII-only, so Hebrew words are delimited with lookaheads instead.
 */
/** "ג׳ימייל" in every spelling people type: geresh or apostrophe (normalized first), with or without them, "ג׳י מייל", "גמייל". */
const GMAIL_HE = "ג'?י ?מייל|ג'?ימיל|גמייל";
/** "gmail", "g-mail" / "g mail" (hyphens become spaces in normalize) */
const GMAIL_EN = "g ?mail";
const GOOGLE_WORDS = new RegExp(`google|${GMAIL_EN}|גוגל|${GMAIL_HE}|דרייב|drive`, "i");
const MICROSOFT_WORDS = /microsoft|outlook|office|365|מיקרוסופט|אאוטלוק|אופיס/i;
/** What a mail / calendar / files request is about — shared with onboarding (a request is never a name). */
export const WORK_TOPICS_SOURCE = `מייל|יומן|פגיש|קובץ|מסמך|סיכום|דרייב|drive|${GMAIL_EN}|${GMAIL_HE}`;
const WORK_TOPICS = new RegExp(WORK_TOPICS_SOURCE, "i");
/** Polite openers before the verb: "אני רוצה לחבר…", "אפשר לחבר…", "<name>, תחברי…". */
const LEAD = new RegExp(`^(?:(?:אני|רוצה|צריך|צריכה|אפשר|בבקשה|בוא|בואי|היי|הי|${PRODUCT_NAME})[,\\s]+)+`);
/**
 * A connect request is the verb followed by what is connected — "לחבר את המייל", "תחברי לי את הג׳ימייל", "להתחבר
 * לגוגל", "חיבור Outlook", "לחבר מחדש את היומן". Never the verb alone: "חבר" / "חברי" are also "a friend" / "members
 * of" ("חבר שלי שלח לי מייל", "חברי הוועד שלחו מייל"), and "לחבר בין…" / "נחבר את זה ל…" are not about an account.
 */
const CONNECT_VERB = "(?:לחבר|חבר|חברי|תחבר|תחברי|נחבר|חיבור|להתחבר|תתחבר|תתחברי)";
const CONNECT_OBJECT = `(?:${GMAIL_HE}|${GMAIL_EN}|גוגל|google|מיקרוסופט|microsoft|אאוטלוק|outlook|אופיס|office|365|מייל|מיילים|אימייל|דואר|תיבת|יומן|יומנים|קלנדר|calendar|דרייב|drive|וואן ?דרייב|onedrive|קבצים|חשבון|חשבונות)`;
const CONNECT_REQUEST = new RegExp(`^${CONNECT_VERB}(?: (?:לי|לנו))?(?: (?:שוב|מחדש))?(?: את ה?| אל ה?| ל| ה?)${CONNECT_OBJECT}(?=[\\s,.!?]|$)`, "i");
/** "חבר שוב", "לחבר מחדש" — about the connection that expired */
const AGAIN_ONLY = new RegExp(`^${CONNECT_VERB} (?:שוב|מחדש)$`);
const AGAIN = /(?:^|\s)(?:שוב|מחדש)(?=\s|$)/;
/**
 * A provider's name as the whole message ("הג׳ימייל", "גוגל", "Outlook", "יומן גוגל", "המייל של גוגל") — typically the
 * answer to "לאיזה חשבון?" or a correction right after a link for the other provider. A connect request unless that
 * provider is already active.
 */
const BARE_GOOGLE = new RegExp(
  `^(?:את )?(?:ה?(?:${GMAIL_HE}|${GMAIL_EN}|גוגל|google)(?: (?:דרייב|drive|קלנדר|calendar|יומן|מייל))?|ה?(?:יומן|מייל|דרייב|קלנדר|calendar|drive)(?: של)? ה? ?(?:גוגל|google))(?: שלי)?$`,
  "i",
);
const BARE_MICROSOFT = /^(?:את )?ה?(?:מיקרוסופט|microsoft|אאוטלוק|outlook|אופיס|office)(?: 365)?(?: שלי)?$/i;

/** Geresh / curly / back quotes → "'", hyphens → spaces ("ג׳י-מייל", "G-mail"), spaces collapsed, trailing punctuation dropped, the opener removed. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/[׳’‘`´]/g, "'")
    .replace(/[-‐–—־]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?…]+$/u, "")
    .replace(LEAD, "")
    .trim();
}

const has = (cs: ConnectionRow[], provider: ConnectionProvider, status?: ConnectionRow["status"]) => cs.some((c) => c.provider === provider && (status ? c.status === status : c.status !== "revoked"));

/**
 * Which provider a connect request is about, or null when the text is not a connect request. A provider that is
 * already active gets no new link unless the text says "שוב" / "מחדש" (then the model answers "already connected").
 */
export function connectRequestProvider(text: string, connections: ConnectionRow[]): ConnectionProvider | null {
  const t = normalize(text);
  if (BARE_GOOGLE.test(t)) return has(connections, "google", "active") ? null : "google";
  if (BARE_MICROSOFT.test(t)) return has(connections, "microsoft", "active") ? null : "microsoft";
  if (!CONNECT_REQUEST.test(t) && !AGAIN_ONLY.test(t)) return null;
  const provider = providerOf(t, connections);
  return has(connections, provider, "active") && !AGAIN.test(t) ? null : provider;
}

function providerOf(t: string, connections: ConnectionRow[]): ConnectionProvider {
  const google = GOOGLE_WORDS.test(t);
  const microsoft = MICROSOFT_WORDS.test(t);
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
