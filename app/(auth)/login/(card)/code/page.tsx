import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CodeStep } from "@/components/auth/code-step";
import { RESEND_SECONDS } from "@/lib/auth/otp-constants";

export const metadata: Metadata = { title: "קוד כניסה" };

export default function LoginCodePage(props: PageProps<"/login/code">) {
  return (
    <Suspense fallback={null}>
      <WithParams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/login/code">["searchParams"] }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  if (!email) redirect("/login/email");
  const wait = typeof sp.wait === "string" ? Math.min(RESEND_SECONDS, Math.max(0, Number(sp.wait) || 0)) : RESEND_SECONDS;
  return <CodeStep mode="login" email={email} initialWait={wait} />;
}
