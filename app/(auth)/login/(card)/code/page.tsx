import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeStep, CodeStepFromUrl } from "@/components/auth/code-step";
import { DemoCodeNoteLive } from "@/components/demo/demo-flag";
import { isDemo } from "@/lib/demo";

export const metadata: Metadata = { title: "קוד כניסה" };

/** The sign-in code card — the signup code card in login mode (static; see app/(auth)/start/code/page.tsx). */
export default function LoginCodePage() {
  const demoNote = <DemoCodeNoteLive atBuild={isDemo()} />;
  return (
    <Suspense fallback={<CodeStep mode="login" email="" demoNote={demoNote} autoFocus={false} />}>
      <CodeStepFromUrl mode="login" demoNote={demoNote} />
    </Suspense>
  );
}
