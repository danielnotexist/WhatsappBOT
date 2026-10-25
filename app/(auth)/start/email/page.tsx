import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailStep, EmailStepFromUrl } from "@/components/auth/email-step";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "המייל שלך", robots: NOINDEX };

/** Step 2: the email card. Static: `?email=` (from "שינוי מייל") is read on the client; the fallback is the same card. */
export default function StartEmailPage() {
  return (
    <Suspense fallback={<EmailStep autoFocus={false} />}>
      <EmailStepFromUrl />
    </Suspense>
  );
}
