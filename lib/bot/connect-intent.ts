import type { ConnectionProvider, ConnectionRow } from "@/lib/db/types";

/**
 * Chat shortcuts that need no model: "לחבר את המייל", "לחבר את גוגל", "חבר שוב" → a one-time connect link,
 * and an expired connection + a mail/calendar/files request → a reconnect link (PLAN §1, §11 milestones 4/6).
 * Note: JS `\b` is ASCII-only, so Hebrew words are delimited with lookaheads instead.
 */
const CONNECT_VERB = /^(?:לחבר|חבר|תחבר|חיבור|להתחבר)(?=\s|$)/;
const AGAIN_ONLY = /^(?:לחבר|חבר|תחבר)\s+(?:שוב|מחדש)$/;
const GOOGLE_WORDS = /google|gmail|גוגל|ג['׳]?ימייל|גימייל|דרייב|drive/i;
const MICROSOFT_WORDS = /microsoft|outlook|office|365|מיקרוסופט|אאוטלוק|אופיס/i;
const TOPIC_WORDS = /מייל|יומן|קבצ|קובץ|שוב|מחדש/;
const WORK_TOPICS = /מייל|יומן|פגיש|קובץ|מסמך|סיכום|דרייב|drive|gmail|ג['׳]?ימייל/i;

const has = (cs: ConnectionRow[], provider: ConnectionProvider, status?: ConnectionRow["status"]) => cs.some((c) => c.provider === provider && (status ? c.status === status : c.status !== "revoked"));

/** Which provider a connect request is about, or null when the text is not a connect request. */
export function connectRequestProvider(text: string, connections: ConnectionRow[]): ConnectionProvider | null {
  const t = text.trim();
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
  if (!WORK_TOPICS.test(text)) return null;
  const activeMs = has(connections, "microsoft", "active");
  const activeGoogle = has(connections, "google", "active");
  if (activeMs || activeGoogle) return null; // a live connection can still answer
  if (has(connections, "microsoft", "expired") && !GOOGLE_WORDS.test(text)) return "microsoft";
  if (has(connections, "google", "expired")) return "google";
  return null;
}

export function providerLabel(provider: ConnectionProvider): string {
  return provider === "google" ? "Google" : "Microsoft 365";
}
