import { AUTOMATED_SENDER, BULK_SUBJECT } from "@/lib/jobs/awaiting-reply";
import type { GmailMessage } from "@/lib/google/gmail";
import type { GraphMessage } from "@/lib/ms/graph";
import { businessDaysBetween } from "@/lib/time/rest-days";
import { DEFAULT_TZ, localDateOf } from "@/lib/time/zoned";

/**
 * One mail as the proactive checks see it (lib/proactive): Microsoft 365 (Graph) and Gmail mapped to the same fields.
 * Everything here came from the sender — header fields are printed only through oneLineUntrusted, bodies never.
 */
export interface ProactiveMail {
  provider: "microsoft" | "google";
  id: string;
  conversationId: string | null;
  subject: string;
  from: { name: string; address: string } | null;
  replyTo: { name: string; address: string }[];
  /** ISO 8601 */
  receivedDateTime: string;
  isRead: boolean;
  /** Graph bodyPreview / Gmail snippet; the full text only when the mail was fetched in full */
  text: string;
  importance: "high" | "normal" | "low" | null;
  /** a bulk-mail header is present: List-Unsubscribe, Auto-Submitted (not "no"), Precedence bulk / list / junk */
  bulkHeaders: boolean;
}

const lower = (a: { name: string; address: string } | null | undefined) => (a ? { name: a.name, address: a.address.trim().toLowerCase() } : null);

function importanceOf(v: string | undefined | null): ProactiveMail["importance"] {
  const s = (v ?? "").toLowerCase();
  return s === "high" || s === "low" || s === "normal" ? s : null;
}

/** Graph headers (lib/ms/graph.ts bulkHeaders, lower-case names) → is it a mailing? */
export function graphBulkHeaders(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  const auto = (headers["auto-submitted"] ?? "no").trim().toLowerCase();
  const precedence = (headers.precedence ?? "").trim().toLowerCase();
  return Boolean(headers["list-unsubscribe"] || headers["list-id"]) || (auto !== "" && auto !== "no") || ["bulk", "list", "junk"].includes(precedence);
}

export function fromGraphMessage(m: GraphMessage): ProactiveMail {
  return {
    provider: "microsoft",
    id: m.id,
    conversationId: m.conversationId,
    subject: m.subject,
    from: lower(m.from),
    replyTo: (m.replyTo ?? []).map((r) => lower(r)!).filter((r) => r.address),
    receivedDateTime: m.receivedDateTime,
    isRead: m.isRead,
    text: m.bodyText ?? m.bodyPreview,
    importance: importanceOf(m.importance),
    bulkHeaders: graphBulkHeaders(m.headers),
  };
}

export function fromGmailMessage(m: GmailMessage): ProactiveMail {
  return {
    provider: "google",
    id: m.id,
    conversationId: m.threadId,
    subject: m.subject,
    from: lower(m.from),
    replyTo: m.replyTo.map((r) => lower(r)!).filter((r) => r.address),
    receivedDateTime: m.date,
    isRead: !m.unread,
    text: m.bodyText ?? m.snippet,
    importance: m.importance,
    bulkHeaders: m.automated,
  };
}

/** The domain of an address, lower-case ("" when there is none). */
export const domainOf = (address: string) => address.trim().toLowerCase().split("@")[1] ?? "";

/**
 * Not a person: a bulk header (List-Unsubscribe, Auto-Submitted, Precedence), a no-reply / notifications / billing
 * sender, or a newsletter-like subject. The awaiting-reply heuristic (lib/jobs/awaiting-reply.ts) uses the same
 * sender and subject patterns.
 */
export function isAutomatedMail(m: Pick<ProactiveMail, "from" | "subject" | "bulkHeaders">): boolean {
  const from = m.from?.address ?? "";
  return m.bulkHeaders || !from || AUTOMATED_SENDER.test(from) || BULK_SUBJECT.test(m.subject);
}

/** Explicit urgency written by the sender (subject or the first lines), or the high-importance flag. */
export const URGENT_WORDS = /(^|[^א-ת])(דחוף|דחופה|בדחיפות|בהול|בהולה|מיידי|מיידית|בהקדם האפשרי|עוד היום)(?![א-ת])|\burgent\b|\basap\b|\bimmediately\b|\btime[- ]sensitive\b/i;

export function explicitUrgency(m: Pick<ProactiveMail, "subject" | "text" | "importance">): boolean {
  return URGENT_WORDS.test(m.subject) || URGENT_WORDS.test(m.text.slice(0, 300));
}

/** Business days (Sunday–Thursday, not a holiday) the mail has waited, counted between the day it came and today. */
export function waitingBusinessDays(m: Pick<ProactiveMail, "receivedDateTime">, now: Date, tz: string = DEFAULT_TZ): number {
  const t = Date.parse(m.receivedDateTime);
  if (!Number.isFinite(t) || t > now.getTime()) return 0;
  return businessDaysBetween(localDateOf(new Date(t), tz), localDateOf(now, tz));
}
