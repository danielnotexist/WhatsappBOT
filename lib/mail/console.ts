import type { Mailer, OtpMail } from "./types";

/** Dev/test mailer: prints the code instead of sending. Never used in production. */
export class ConsoleMailer implements Mailer {
  sent: OtpMail[] = [];

  async sendOtp(mail: OtpMail): Promise<{ id: string | null }> {
    this.sent.push(mail);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[mail] קוד אימות ל-${mail.to}: ${mail.code} (תקף ${mail.ttlMinutes} דק')`);
    }
    return { id: null };
  }
}
