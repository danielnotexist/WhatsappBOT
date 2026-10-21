import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailStep } from "@/components/auth/email-step";

export const metadata: Metadata = { title: "המייל שלך" };

/** Step 2: the email card. `?email=` (from "שינוי מייל") is request-time, so it is read inside <Suspense>. */
export default function StartEmailPage(props: PageProps<"/start/email">) {
  return (
    <Suspense fallback={<EmailStep />}>
      <WithParams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/start/email">["searchParams"] }) {
  const sp = await searchParams;
  return <EmailStep initialEmail={typeof sp.email === "string" ? sp.email : ""} />;
}
