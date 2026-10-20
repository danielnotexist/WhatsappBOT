import "server-only";
import { dataMode } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { PRODUCT_NAME } from "@/lib/product";
import { ConsoleMailer } from "./console";
import { ResendMailer } from "./resend";
import type { Mailer } from "./types";

export type { Mailer, OtpMail } from "./types";

const NAME = "mailer";

/** `DATA_MODE=memory` → console; otherwise Resend (throws a Hebrew EnvError if RESEND_API_KEY / APP_URL are missing). */
export function getMailer(): Mailer {
  return globalSingleton<Mailer>(NAME, () => (dataMode() === "memory" ? new ConsoleMailer() : ResendMailer.fromEnv(PRODUCT_NAME)));
}

export function setMailerForTests(mailer: Mailer | undefined): void {
  setGlobalSingleton(NAME, mailer);
}
