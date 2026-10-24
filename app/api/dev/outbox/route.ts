import { connection } from "next/server";
import { getMailer } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { getWaSender } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";

/**
 * GET /api/dev/outbox[?to=<email or phone>] — DATA_MODE=memory development only (404 everywhere else; memory mode is
 * refused in production by lib/env). Shows what the in-memory mailer and WhatsApp sender "sent", so the e2e tests can
 * read the sign-in code, the owner's alerts and the bot's replies the way a person would read their inbox / chat.
 */
export async function GET(request: Request) {
  await connection();
  if (process.env.DATA_MODE !== "memory" || process.env.NODE_ENV === "production") return new Response("not found", { status: 404 });
  const to = new URL(request.url).searchParams.get("to")?.toLowerCase() ?? null;
  const mailer = getMailer();
  const wa = getWaSender();
  const mails = mailer instanceof ConsoleMailer ? mailer.sent.filter((m) => !to || m.to.toLowerCase() === to) : [];
  const messages = wa instanceof RecordingWaSender ? wa.sent.filter((m) => !to || m.to === to || m.to === `+${to.replace(/^\+/, "")}`) : [];
  // the owner's alerts (lib/admin/alerts.ts) and the support tickets, by recipient
  const ownerAlerts =
    mailer instanceof ConsoleMailer ? mailer.ownerAlerts.filter((m) => !to || m.to.some((t) => t.toLowerCase() === to)).map((m) => ({ to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo ?? null })) : [];
  const tickets = mailer instanceof ConsoleMailer ? mailer.tickets.filter((m) => !to || m.to.toLowerCase() === to).map((m) => ({ to: m.to, subject: m.subject })) : [];
  return Response.json({ mails, messages, ownerAlerts, tickets }, { headers: { "cache-control": "no-store" } });
}
