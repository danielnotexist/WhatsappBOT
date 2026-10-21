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

export interface Mailer {
  /** Sends the 6-digit sign-in code. Throws on provider failure. */
  sendOtp(mail: OtpMail): Promise<{ id: string | null }>;
  /** Sends an operator alert. Optional: a mailer without it means "log only". Throws on provider failure. */
  sendOperatorAlert?(mail: OperatorAlertMail): Promise<{ id: string | null }>;
}
