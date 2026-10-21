import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CodeStep } from "@/components/auth/code-step";
import { DemoCodeNote } from "@/components/demo/DemoCodeNote";
import { RESEND_SECONDS } from "@/lib/auth/otp-constants";
import { isDemo } from "@/lib/demo";

export const metadata: Metadata = { title: "קוד אימות" };

/** Step 3: the six-digit code. Email / opt-in / cooldown come in the URL from the email card. */
export default function StartCodePage(props: PageProps<"/start/code">) {
  return (
    <Suspense fallback={null}>
      <WithParams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/start/code">["searchParams"] }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  if (!email) redirect("/start/email");
  const wait = typeof sp.wait === "string" ? Math.min(RESEND_SECONDS, Math.max(0, Number(sp.wait) || 0)) : RESEND_SECONDS;
  // DEMO_MODE: no mail goes out — the card names the code that works (lib/demo.ts)
  return <CodeStep email={email} updates={sp.updates === "1"} initialWait={wait} demoNote={isDemo() ? <DemoCodeNote /> : null} />;
}
