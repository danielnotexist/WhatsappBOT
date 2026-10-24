import "server-only";
import { ownerAlert, type OwnerEvent } from "@/lib/admin/alerts";
import { BRAND, PRODUCT_NAME } from "@/lib/brand";
import type { SupportTicketRow } from "@/lib/db/types";
import { EnvError, integrationsMocked, liveSupportMailInDemo, requireEnv } from "@/lib/env";
import { getMailer } from "@/lib/mail";
import { ResendMailer } from "@/lib/mail/resend";
import type { SupportTicketMail } from "@/lib/mail/types";
import { isSystemRequest } from "./types";

/**
 * Where website tickets go: SUPPORT_EMAIL. Required when mail is real (outside the demo and DATA_MODE=memory) — a
 * Hebrew EnvError names it; in the demo and dev the default is support@<domain> (the address the terms of service
 * name, docs/legal/terms-of-service-he.md), and the console mailer only records it.
 */
export function supportInbox(source: Record<string, string | undefined> = process.env): string {
  if (source.SUPPORT_EMAIL?.trim()) return requireEnv(["SUPPORT_EMAIL"], source).SUPPORT_EMAIL!;
  if (integrationsMocked(source)) return `support@${BRAND.domain}`;
  throw new EnvError(
    [{ code: "custom", path: ["SUPPORT_EMAIL"], message: "required", input: undefined }],
    "חסר SUPPORT_EMAIL: הכתובת שאליה נשלחות פניות מצ'אט התמיכה באתר. הפנייה נשמרה בטבלה support_tickets, אבל לא נשלחה במייל. ראו .env.example.",
  );
}

const one = (s: string) => s.replace(/\s+/g, " ").trim();

/** The email to the support inbox: who, what, and the chat with עלזה when it was attached. Plain text, Hebrew-first lines. */
export function ticketMail(ticket: SupportTicketRow, to: string): SupportTicketMail {
  const topic = one(ticket.subject || ticket.body).slice(0, 60);
  // "בקשת מערכת" (lib/support/system-request.ts): its subject is the marker and the system's name
  const request = isSystemRequest(ticket.subject);
  const lines = [
    request ? "בקשת מערכת חדשה מהאתר: מערכת שלקוח רוצה לחבר" : "פנייה חדשה מצ'אט התמיכה באתר",
    `מספר פנייה: ${ticket.id}`,
    `שם: ${one(ticket.name)}`,
    `מייל: ${ticket.email}`,
    `נושא: ${ticket.subject ? one(ticket.subject) : "(בלי נושא)"}`,
    `משתמש רשום: ${ticket.user_id ? `כן (${ticket.user_id})` : "לא, או לא מחובר"}`,
    "",
    "תיאור:",
    ticket.body,
  ];
  if (ticket.transcript?.length) {
    lines.push("", `השיחה עם ${BRAND.name} באתר:`);
    for (const t of ticket.transcript) lines.push(`- ${t.role === "user" ? "הפונה" : BRAND.name}: ${one(t.text)}`);
  }
  lines.push("", "תשובה למייל הזה תגיע ישירות לפונה.");
  return { to, replyTo: ticket.email, subject: request ? topic : `פנייה חדשה: ${topic}`, text: lines.join("\n") };
}

/** The owner's alert of a ticket (lib/admin/alerts.ts): a system request by its marker, a short excerpt of the body. */
export function ticketOwnerEvent(ticket: SupportTicketRow): OwnerEvent {
  return {
    type: isSystemRequest(ticket.subject) ? "system_request" : "ticket",
    ticketId: ticket.id,
    subject: ticket.subject,
    fromName: ticket.name,
    fromEmail: ticket.email,
    userId: ticket.user_id,
    excerpt: one(ticket.body).slice(0, 200),
  };
}

/**
 * Sends the ticket to the support inbox, then tells the owner (one merged mail: when SUPPORT_EMAIL is also an owner
 * address, that address already has the ticket and gets no second mail). Never throws: the ticket is already stored,
 * so a missing SUPPORT_EMAIL or a provider error is logged (by name and reason, never the ticket's content) and
 * reported as `false`.
 */
export async function notifySupport(ticket: SupportTicketRow): Promise<boolean> {
  let mailedTo: string | null = null;
  try {
    // the demo with LIVE_SUPPORT_MAIL=1: this one email is real; every other mail stays on the console
    const mailer = liveSupportMailInDemo() ? ResendMailer.fromEnv(PRODUCT_NAME) : getMailer();
    if (mailer.sendSupportTicket) {
      const inbox = supportInbox();
      await mailer.sendSupportTicket(ticketMail(ticket, inbox));
      mailedTo = inbox;
    }
  } catch (e) {
    console.error(`[support] ticket ${ticket.id} stored but not emailed:`, e instanceof EnvError ? e.message : (e as Error).name);
  }
  ownerAlert(ticketOwnerEvent(ticket), { alreadyMailed: mailedTo ? [mailedTo] : [] });
  return mailedTo !== null;
}
