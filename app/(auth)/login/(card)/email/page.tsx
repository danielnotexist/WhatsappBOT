import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailStep, EmailStepFromUrl } from "@/components/auth/email-step";

export const metadata: Metadata = { title: "כניסה עם מייל" };

/** Login with email → the same code flow as signup, landing on /account. Static, like the signup email card. */
export default function LoginEmailPage() {
  return (
    <Suspense fallback={<EmailStep mode="login" autoFocus={false} />}>
      <EmailStepFromUrl mode="login" />
    </Suspense>
  );
}
