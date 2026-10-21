import { requireEnv } from "@/lib/env";
import type { Mailer, OtpMail } from "./types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Plain-text + HTML body for the sign-in code. RTL, Hebrew, no links (nothing to phish). */
export function otpEmailContent(mail: OtpMail, productName: string): { subject: string; text: string; html: string } {
  const subject = `${mail.code} — קוד הכניסה ל${productName}`;
  const text = [
    `קוד הכניסה שלך ל${productName}:`,
    "",
    mail.code,
    "",
    `הקוד תקף ל-${mail.ttlMinutes} דקות. אם לא ביקשת להיכנס — אפשר להתעלם מההודעה.`,
  ].join("\n");
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;color:#1e2a2e">
<p>קוד הכניסה שלך ל${escapeHtml(productName)}:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:.2em;direction:ltr;text-align:right">${mail.code}</p>
<p>הקוד תקף ל-${mail.ttlMinutes} דקות. אם לא ביקשת להיכנס — אפשר להתעלם מההודעה.</p>
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
    const host = new URL(env.APP_URL).hostname;
    return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: `${productName} <no-reply@${host}>`, productName });
  }

  async sendOtp(mail: OtpMail): Promise<{ id: string | null }> {
    const content = otpEmailContent(mail, this.opts.productName);
    const res = await this.fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.opts.from, to: [mail.to], subject: content.subject, text: content.text, html: content.html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: json.id ?? null };
  }
}
