/**
 * "Emails awaiting a reply" — one heuristic for every mailbox (Microsoft 365 via Graph, Gmail via the Gmail API),
 * used by the morning summary (lib/jobs/morning-summary.ts) and the `gmail_awaiting_reply` tool.
 */

/** The fields the heuristic needs; GraphMessage and the Gmail mapping (lib/google/gmail.ts) both fit. */
export interface MailLike {
  subject: string;
  from: { name: string; address: string } | null;
  receivedDateTime: string;
  isRead: boolean;
  bodyPreview: string;
  /** Graph conversationId / Gmail threadId */
  conversationId: string | null;
}

export interface SentRef {
  conversationId: string | null;
  sentDateTime: string;
}

export const AUTOMATED_SENDER = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer-daemon|postmaster|newsletters?|news|marketing|bounces?|billing|invoices?|receipts?|updates?|automated)([._+-]|@)/i;
export const BULK_SUBJECT = /newsletter|ניוזלטר|unsubscribe|הסרה מרשימת|webinar|וובינר|מבצע|הנחה של|sale\b/i;
const ASKS = /\?|נשמח|אשמח|אפשר |תוכל|תוכלי|תוכלו|מתי|האם |בבקשה|נא ל|מחכה|ממתין|ממתינה|ממתינים|דחוף|לתשובתך|לתשובתכם|לאשר|אישורך|אישורכם|please|could you|can you|let me know|waiting for/i;

/**
 * Inbox messages from the last `maxAgeDays` days, from a person (not the user, not no-reply/newsletters), in a
 * conversation the user has not answered since, and either unread or asking something ("?", "נשמח", "מתי",
 * "please"…). Newest first, one per conversation.
 */
export function emailsAwaitingReply<T extends MailLike>(inbox: T[], sent: SentRef[], opts: { selfAddress: string | null; now: Date; maxAgeDays?: number; limit?: number }): T[] {
  const self = opts.selfAddress?.toLowerCase() ?? null;
  const oldest = opts.now.getTime() - (opts.maxAgeDays ?? 7) * 86_400_000;
  const lastSent = new Map<string, number>();
  for (const s of sent) {
    if (!s.conversationId) continue;
    lastSent.set(s.conversationId, Math.max(lastSent.get(s.conversationId) ?? 0, Date.parse(s.sentDateTime) || 0));
  }
  const seen = new Set<string>();
  return [...inbox]
    .sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))
    .filter((m) => {
      const received = Date.parse(m.receivedDateTime);
      if (!Number.isFinite(received) || received < oldest || received > opts.now.getTime()) return false;
      const from = m.from?.address.toLowerCase() ?? "";
      if (!from || from === self || AUTOMATED_SENDER.test(from) || BULK_SUBJECT.test(m.subject)) return false;
      if (m.conversationId && (lastSent.get(m.conversationId) ?? 0) > received) return false;
      if (m.conversationId) {
        if (seen.has(m.conversationId)) return false;
        seen.add(m.conversationId);
      }
      return !m.isRead || ASKS.test(`${m.subject} ${m.bodyPreview}`);
    })
    .slice(0, opts.limit ?? 5);
}
