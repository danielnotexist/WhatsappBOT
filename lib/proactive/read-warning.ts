import { pcopy } from "@/lib/copy/bot-proactive";
import { phishingReasonText } from "./digest";
import type { ProactiveMail } from "./mail";
import { checkPhishing, type Contact } from "./phishing";

/**
 * The phishing check on a mail the assistant reads or lists for the user (get_email / search_emails and the gmail_
 * twins), pro only — deterministic, no extra model call: the strong model is reading the mail anyway.
 *   suspicious → `phishing_warning: { say }` — the reply about the mail opens with `say` as written (system prompt)
 *   borderline → `phishing_signals` — the model warns only if the content itself looks like an attempt
 * Read-only: nothing here marks, moves or answers a mail.
 */
export function phishingFields(mail: ProactiveMail, known: readonly Contact[], selfAddresses: readonly string[]): Record<string, unknown> {
  const check = checkPhishing(mail, { known, selfAddresses });
  if (check.level === "suspicious") return { phishing_warning: { say: pcopy["alert.phishing.warning"](phishingReasonText(check)), signals: check.signals } };
  if (check.level === "borderline") return { phishing_signals: check.signals };
  return {};
}

/** Known contacts fetched once per tool set (one Sent Items call), never failing the tool. */
export function lazyKnown(fetch: () => Promise<Contact[]>): () => Promise<Contact[]> {
  let p: Promise<Contact[]> | null = null;
  return () => (p ??= fetch().catch(() => []));
}
