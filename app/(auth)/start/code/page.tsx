import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeStep, CodeStepFromUrl } from "@/components/auth/code-step";
import { DemoCodeNoteLive } from "@/components/demo/demo-flag";
import { isDemo } from "@/lib/demo";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "קוד אימות", robots: NOINDEX };

/**
 * Step 3: the six-digit code. Static: email / opt-in / cooldown come in the URL from the email card and are read on the
 * client (CodeStepFromUrl), so navigating here draws the whole card at once. On a page load the card itself is the
 * fallback until the URL is known — never an empty card. The demo note is part of the same commit (DemoCodeNoteLive:
 * the running server's DEMO_MODE, reported by the DemoBar); nothing streams in after the card. No email → the proxy
 * sends a page load back to the email card (proxy.ts), and the card does the same on the client.
 */
export default function StartCodePage() {
  const demoNote = <DemoCodeNoteLive atBuild={isDemo()} />;
  return (
    <Suspense fallback={<CodeStep email="" demoNote={demoNote} autoFocus={false} />}>
      <CodeStepFromUrl demoNote={demoNote} />
    </Suspense>
  );
}
