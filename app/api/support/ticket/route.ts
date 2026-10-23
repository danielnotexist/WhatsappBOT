import { connection } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import type { UserRow } from "@/lib/db/types";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/same-origin";
import { NO_STORE, readJson, supportFail } from "@/lib/support/http";
import { notifySupport } from "@/lib/support/notify";
import { SUPPORT_LIMITS, SUPPORT_RATE, type SupportTicketField, type SupportTicketPrefill, type SupportTicketResponse } from "@/lib/support/types";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const L = SUPPORT_LIMITS.ticket;
/** The form, the attached chat (20 messages) and the JSON framing. */
const MAX_BODY_BYTES = 64 * 1024;
const he = new Intl.NumberFormat("he-IL");

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const ticket = z.object({
  name: z.string({ message: "צריך למלא שם." }).trim().min(1, { message: "צריך למלא שם." }).max(L.name, { message: `השם ארוך מדי. אפשר עד ${L.name} תווים.` }),
  email: z
    .string({ message: "צריך למלא כתובת מייל." })
    .trim()
    .min(1, { message: "צריך למלא כתובת מייל." })
    .max(L.email, { message: "כתובת המייל ארוכה מדי." })
    .pipe(z.email({ message: "כתובת המייל לא תקינה." })),
  subject: z.preprocess(blankToNull, z.string().trim().max(L.subject, { message: `הנושא ארוך מדי. אפשר עד ${L.subject} תווים.` }).nullable().optional().default(null)),
  body: z
    .string({ message: "צריך לתאר במשפט או שניים מה קרה." })
    .trim()
    .min(5, { message: "צריך לתאר במשפט או שניים מה קרה." })
    .max(L.body, { message: `התיאור ארוך מדי. אפשר עד ${he.format(L.body)} תווים.` }),
  transcript: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(SUPPORT_LIMITS.historyChars) }))
    .max(L.transcriptTurns)
    .nullable()
    .optional()
    .default(null),
  /** the honeypot: a field people never see; anything in it is a bot */
  website: z.string().max(500).optional(),
});

const FIELDS: readonly SupportTicketField[] = ["name", "email", "subject", "body"];

/** The signed-in person (a valid session whose user still exists), or null. */
async function signedInUser(): Promise<UserRow | null> {
  const session = await getSession();
  if (!session) return null;
  return getDb().getUser(session.userId);
}

/**
 * GET /api/support/ticket — the email to prefill the ticket form with: the signed-in person's, or null.
 * 200 SupportTicketPrefill (never an error: a broken session is simply no session).
 */
export async function GET() {
  await connection();
  let email: string | null = null;
  try {
    email = (await signedInUser())?.email ?? null;
  } catch {
    email = null;
  }
  return Response.json({ ok: true, email } satisfies SupportTicketPrefill, { headers: NO_STORE });
}

/**
 * POST /api/support/ticket — a ticket from the support chat's form ("פתיחת פנייה"). No sign-in needed; when signed
 * in, the ticket is linked to the account. Body `{ name, email, subject?, body, transcript?, website }`.
 * Stored in support_tickets (migration 0011), then emailed to the support inbox (lib/support/notify.ts; a mail
 * failure is logged and does not fail the request — the ticket is stored). A filled honeypot gets the same 200 and
 * nothing is stored.
 * 200 SupportTicketResponse · 400 invalid (a Hebrew line per field) / bad_request · 403 another site's Origin ·
 * 429 over 5 an hour or 20 a day per IP.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return supportFail("forbidden");
  const ip = clientIp(request.headers);
  const limiter = getRateLimiter();
  if (!limiter.hit(`support-ticket:ip:${ip}`, SUPPORT_RATE.ticketPerHour, HOUR) || !limiter.hit(`support-ticket:ip-day:${ip}`, SUPPORT_RATE.ticketPerDay, DAY)) {
    return supportFail("rate_limited", "נשלחו כבר כמה פניות מכאן. אפשר לנסות שוב בעוד שעה.");
  }

  const raw = await readJson(request, MAX_BODY_BYTES);
  if (!raw || typeof raw !== "object") return supportFail("bad_request");
  const parsed = ticket.safeParse(raw);
  if (!parsed.success) {
    const fields: Partial<Record<SupportTicketField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (FIELDS.includes(key as SupportTicketField) && !fields[key as SupportTicketField]) fields[key as SupportTicketField] = issue.message;
    }
    return Object.keys(fields).length ? supportFail("invalid", "חסרים פרטים בטופס.", { fields }) : supportFail("bad_request");
  }
  const form = parsed.data;
  if (form.website?.trim()) return Response.json({ ok: true } satisfies SupportTicketResponse, { headers: NO_STORE });

  try {
    const user = await signedInUser().catch(() => null);
    const row = await getDb().createSupportTicket({
      user_id: user?.id ?? null,
      name: form.name,
      email: form.email,
      subject: form.subject ?? null,
      body: form.body,
      transcript: form.transcript?.length ? form.transcript : null,
    });
    await notifySupport(row);
    return Response.json({ ok: true } satisfies SupportTicketResponse, { headers: NO_STORE });
  } catch (e) {
    console.error("[support-ticket] could not store the ticket:", (e as Error).name);
    return supportFail("server_error", "הפנייה לא נשמרה. אפשר לנסות שוב בעוד רגע.");
  }
}
