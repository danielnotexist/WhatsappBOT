export interface OtpMail {
  to: string;
  code: string;
  /** minutes until the code expires (for the email text) */
  ttlMinutes: number;
  /** "admin": the one-time code of the admin panel (/admin, lib/admin/auth.ts) — its own subject and words */
  purpose?: "signin" | "admin";
}

/** A plain-text operational alert to the operator (OPERATOR_EMAIL) — e.g. Google's user cap at 80 / 95. */
export interface OperatorAlertMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * A new support ticket from the website (app/api/support/ticket) to the support inbox (SUPPORT_EMAIL). Plain text;
 * `replyTo` is the person who opened it, so answering the email reaches them.
 */
export interface SupportTicketMail {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

/**
 * An alert to the owner (lib/admin/alerts.ts, ADMIN_EMAILS): a new signup, a ticket, a failed payment, the morning
 * digest. One mail to every address in `to`; plain text with an HTML version (RTL), never a secret.
 */
export interface OwnerAlertMail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** a ticket: answering the alert reaches the person who opened it */
  replyTo?: string;
}

export interface Mailer {
  /** Sends the 6-digit sign-in code. Throws on provider failure. */
  sendOtp(mail: OtpMail): Promise<{ id: string | null }>;
  /** Sends an operator alert. Optional: a mailer without it means "log only". Throws on provider failure. */
  sendOperatorAlert?(mail: OperatorAlertMail): Promise<{ id: string | null }>;
  /** Sends a support ticket to the support inbox. Optional: a mailer without it means "stored only". Throws on provider failure. */
  sendSupportTicket?(mail: SupportTicketMail): Promise<{ id: string | null }>;
  /** Sends an alert to the owner. Optional: without it the alert falls back to sendOperatorAlert. Throws on provider failure. */
  sendOwnerAlert?(mail: OwnerAlertMail): Promise<{ id: string | null }>;
}
