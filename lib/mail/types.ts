export interface OtpMail {
  to: string;
  code: string;
  /** minutes until the code expires (for the email text) */
  ttlMinutes: number;
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

export interface Mailer {
  /** Sends the 6-digit sign-in code. Throws on provider failure. */
  sendOtp(mail: OtpMail): Promise<{ id: string | null }>;
  /** Sends an operator alert. Optional: a mailer without it means "log only". Throws on provider failure. */
  sendOperatorAlert?(mail: OperatorAlertMail): Promise<{ id: string | null }>;
  /** Sends a support ticket to the support inbox. Optional: a mailer without it means "stored only". Throws on provider failure. */
  sendSupportTicket?(mail: SupportTicketMail): Promise<{ id: string | null }>;
}
