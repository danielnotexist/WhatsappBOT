import { z } from "zod";
import { BRAND } from "@/lib/brand";
import type { NewSupportTicket, UserRow } from "@/lib/db/types";
import { SUPPORT_LIMITS, SYSTEM_REQUEST_COPY, SYSTEM_REQUEST_LIMITS, SYSTEM_REQUEST_PREFIX, type SystemRequestField } from "./types";

/**
 * "בקשת מערכת" on the server: the form's schema and the support ticket it is stored as (POST /api/support/ticket with
 * `kind: "system"`). No column of its own: the subject carries the marker ("בקשת מערכת: <name>"), the body the
 * answers, so the support inbox and the table read it like any ticket (lib/support/notify.ts names it in the mail).
 */

const S = SYSTEM_REQUEST_LIMITS;
const C = SYSTEM_REQUEST_COPY.errors;
const he = new Intl.NumberFormat("he-IL");
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const systemRequestSchema = z.object({
  kind: z.literal("system"),
  system: z.string({ message: C.system }).trim().min(1, { message: C.system }).max(S.system, { message: `השם ארוך מדי. אפשר עד ${S.system} תווים.` }),
  want: z
    .string({ message: C.want })
    .trim()
    .min(5, { message: C.want })
    .max(S.want, { message: `התיאור ארוך מדי. אפשר עד ${he.format(S.want)} תווים.` }),
  email: z
    .string({ message: C.email })
    .trim()
    .min(1, { message: C.email })
    .max(SUPPORT_LIMITS.ticket.email, { message: "כתובת המייל ארוכה מדי." })
    .pipe(z.email({ message: "כתובת המייל לא תקינה." })),
  business: z.preprocess(blankToNull, z.string().trim().max(S.business, { message: `אפשר עד ${S.business} תווים.` }).nullable().optional().default(null)),
  /** the honeypot, as on the ticket form */
  website: z.string().max(500).optional(),
});

export type SystemRequestForm = z.output<typeof systemRequestSchema>;

export const SYSTEM_REQUEST_FIELDS: readonly SystemRequestField[] = ["system", "want", "email", "business"];

/** the name column of a request from someone who is not signed in (the form asks for no name) */
export const ANONYMOUS_NAME = "פונה מהאתר";

/** The ticket a system request is stored as: the marker in the subject, the answers in the body. */
export function systemRequestTicket(form: SystemRequestForm, user: Pick<UserRow, "id" | "name"> | null): NewSupportTicket {
  return {
    user_id: user?.id ?? null,
    name: user?.name?.trim().slice(0, SUPPORT_LIMITS.ticket.name) || ANONYMOUS_NAME,
    email: form.email,
    subject: `${SYSTEM_REQUEST_PREFIX}${form.system}`,
    body: [`מערכת: ${form.system}`, `מה ${BRAND.name} תעשה איתה: ${form.want}`, `סוג העסק: ${form.business ?? "(לא צוין)"}`].join("\n"),
    transcript: null,
  };
}
