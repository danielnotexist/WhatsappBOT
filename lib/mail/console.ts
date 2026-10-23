import type { Mailer, OperatorAlertMail, OtpMail, SupportTicketMail } from "./types";

/** Dev/test mailer: prints the code instead of sending. Never used in production. */
export class ConsoleMailer implements Mailer {
  sent: OtpMail[] = [];
  alerts: OperatorAlertMail[] = [];
  tickets: SupportTicketMail[] = [];

  async sendOtp(mail: OtpMail): Promise<{ id: string | null }> {
    this.sent.push(mail);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[mail] קוד אימות ל-${mail.to}: ${mail.code} (תקף ${mail.ttlMinutes} דק')`);
    }
    return { id: null };
  }

  async sendOperatorAlert(mail: OperatorAlertMail): Promise<{ id: string | null }> {
    this.alerts.push(mail);
    if (process.env.NODE_ENV !== "test") console.info(`[mail] התראת תפעול ל-${mail.to}: ${mail.subject}`);
    return { id: null };
  }

  /** Only that a ticket arrived - never its content (a person's own words). */
  async sendSupportTicket(mail: SupportTicketMail): Promise<{ id: string | null }> {
    this.tickets.push(mail);
    if (process.env.NODE_ENV !== "test") console.info(`[mail] פנייה חדשה מהאתר ל-${mail.to}`);
    return { id: null };
  }
}
