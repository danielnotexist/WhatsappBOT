import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailStep } from "@/components/auth/email-step";

export const metadata: Metadata = { title: "כניסה עם מייל" };

/** Login with email → the same code flow as signup, landing on /account. */
export default function LoginEmailPage(props: PageProps<"/login/email">) {
  return (
    <Suspense fallback={<EmailStep mode="login" />}>
      <WithParams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/login/email">["searchParams"] }) {
  const sp = await searchParams;
  return <EmailStep mode="login" initialEmail={typeof sp.email === "string" ? sp.email : ""} />;
}
