import "server-only";
import { PRODUCT_NAME } from "@/lib/brand";
import { integrationsMocked, liveSupportMailInDemo } from "@/lib/env";
import { getMailer } from "@/lib/mail";
import type { ConsoleMailer } from "@/lib/mail/console";
import { ResendMailer } from "@/lib/mail/resend";
import type { Mailer } from "@/lib/mail/types";

/** No real mail for the admin code: the panel stays closed and says why (names of variables only). */
export class AdminMailUnavailableError extends Error {
  constructor() {
    super(
      "לא ניתן לשלוח את קוד הכניסה לפאנל הניהול: אין שירות מייל אמיתי בסביבה הזו. " +
        "במצב הדגמה צריך LIVE_SUPPORT_MAIL=1 ו-RESEND_API_KEY (וגם MAIL_FROM בדומיין מאומת); מחוץ להדגמה - RESEND_API_KEY ו-APP_URL.",
    );
    this.name = "AdminMailUnavailableError";
  }
}

/**
 * The mailer of the admin code. The code must reach the owner's real inbox — it is what keeps the demo's fixed sign-in
 * code (123456) out of the panel:
 *   - the demo with LIVE_SUPPORT_MAIL=1 → Resend (the same switch that lets the demo hold RESEND_API_KEY, lib/demo.ts);
 *   - outside the demo and DATA_MODE=memory → the regular mailer (Resend; a Hebrew EnvError names what is missing);
 *   - DATA_MODE=memory in development (e2e, local runs) → the console mailer, read back through /api/dev/outbox;
 *   - anything else (the demo without real mail) → AdminMailUnavailableError.
 */
export function adminMailer(source: Record<string, string | undefined> = process.env): Mailer {
  if (liveSupportMailInDemo(source)) return ResendMailer.fromEnv(PRODUCT_NAME);
  if (!integrationsMocked(source)) return getMailer();
  if (source.DATA_MODE?.trim() === "memory" && source.NODE_ENV !== "production") {
    const mailer = getMailer();
    // by shape, not instanceof: the dev server may bundle the singleton's class twice (see app/api/dev/hyp)
    if (Array.isArray((mailer as Partial<ConsoleMailer>).sent)) return mailer;
  }
  throw new AdminMailUnavailableError();
}
