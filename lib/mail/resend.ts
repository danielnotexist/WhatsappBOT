import { requireEnv } from "@/lib/env";
import type { Mailer, OperatorAlertMail, OtpMail, OwnerAlertMail, SupportTicketMail } from "./types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Plain-text + HTML body for the sign-in code. RTL, Hebrew, no links (nothing to phish). */
export function otpEmailContent(mail: OtpMail, productName: string): { subject: string; text: string; html: string } {
  const admin = mail.purpose === "admin";
  const lead = admin ? `קוד הכניסה לפאנל הניהול של ${productName}:` : `קוד הכניסה שלך ל${productName}:`;
  const tail = admin
    ? `הקוד תקף ל-${mail.ttlMinutes} דקות. אם לא ביקשת להיכנס לפאנל, מישהו מחובר עם הכתובת הזו - כדאי לבדוק.`
    : `הקוד תקף ל-${mail.ttlMinutes} דקות. אם לא ביקשת להיכנס — אפשר להתעלם מההודעה.`;
  const subject = admin ? `${mail.code} — קוד לפאנל הניהול` : `${mail.code} — קוד הכניסה ל${productName}`;
  const text = [lead, "", mail.code, "", tail].join("\n");
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;color:#1e2a2e">
<p>${escapeHtml(lead)}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:.2em;direction:ltr;text-align:right">${mail.code}</p>
<p>${escapeHtml(tail)}</p>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface ResendMailerOptions {
  apiKey: string;
  /** e.g. `עלזה <no-reply@example.co.il>` — the domain must be verified in Resend. */
  from: string;
  productName: string;
  fetchImpl?: typeof fetch;
}

/** Resend adapter — one HTTPS call, no SDK. */
export class ResendMailer implements Mailer {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ResendMailerOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(productName: string): ResendMailer {
    const env = requireEnv(["RESEND_API_KEY", "APP_URL"]);
    const address = process.env.MAIL_FROM?.trim() || `no-reply@${new URL(env.APP_URL).hostname}`;
    return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: `${productName} <${address}>`, productName });
  }

  async sendOtp(mail: OtpMail): Promise<{ id: string | null }> {
    const content = otpEmailContent(mail, this.opts.productName);
    return this.post({ from: this.opts.from, to: [mail.to], subject: content.subject, text: content.text, html: content.html });
  }

  /** Plain text only — an internal alert to the operator, not a customer email. */
  async sendOperatorAlert(mail: OperatorAlertMail): Promise<{ id: string | null }> {
    return this.post({ from: this.opts.from, to: [mail.to], subject: mail.subject, text: mail.text });
  }

  /** Plain text to the support inbox, with Reply-To set to the person who opened the ticket. */
  async sendSupportTicket(mail: SupportTicketMail): Promise<{ id: string | null }> {
    return this.post({ from: this.opts.from, to: [mail.to], reply_to: mail.replyTo, subject: mail.subject, text: mail.text });
  }

  /** The owner's alert: text + HTML, one mail to every owner address; Reply-To the person behind a ticket. */
  async sendOwnerAlert(mail: OwnerAlertMail): Promise<{ id: string | null }> {
    return this.post({ from: this.opts.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) });
  }

  private async post(payload: Record<string, unknown>): Promise<{ id: string | null }> {
    const res = await this.fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: json.id ?? null };
  }
}
