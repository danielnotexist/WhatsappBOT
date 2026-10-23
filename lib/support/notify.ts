import "server-only";
import { BRAND } from "@/lib/brand";
import type { SupportTicketRow } from "@/lib/db/types";
import { EnvError, integrationsMocked, requireEnv } from "@/lib/env";
import { getMailer } from "@/lib/mail";
import type { SupportTicketMail } from "@/lib/mail/types";

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
  const lines = [
    "פנייה חדשה מצ'אט התמיכה באתר",
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
  return { to, replyTo: ticket.email, subject: `פנייה חדשה: ${topic}`, text: lines.join("\n") };
}

/**
 * Sends the ticket to the support inbox. Never throws: the ticket is already stored, so a missing SUPPORT_EMAIL or a
 * provider error is logged (by name and reason, never the ticket's content) and reported as `false`.
 */
export async function notifySupport(ticket: SupportTicketRow): Promise<boolean> {
  try {
    const mailer = getMailer();
    if (!mailer.sendSupportTicket) return false;
    await mailer.sendSupportTicket(ticketMail(ticket, supportInbox()));
    return true;
  } catch (e) {
    console.error(`[support] ticket ${ticket.id} stored but not emailed:`, e instanceof EnvError ? e.message : (e as Error).name);
    return false;
  }
}
