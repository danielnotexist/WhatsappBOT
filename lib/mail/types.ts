export interface OtpMail {
  to: string;
  code: string;
  /** minutes until the code expires (for the email text) */
  ttlMinutes: number;
}

export interface Mailer {
  /** Sends the 6-digit sign-in code. Throws on provider failure. */
  sendOtp(mail: OtpMail): Promise<{ id: string | null }>;
}
