import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeStep, CodeStepFromUrl } from "@/components/auth/code-step";
import { DemoCodeNoteAtBuild, DemoCodeNoteSlot } from "@/components/demo/DemoCodeNote";

export const metadata: Metadata = { title: "קוד כניסה" };

/** The sign-in code card — the signup code card in login mode (static; see app/(auth)/start/code/page.tsx). */
export default function LoginCodePage() {
  return (
    <Suspense fallback={<CodeStep mode="login" email="" demoNote={<DemoCodeNoteAtBuild />} autoFocus={false} />}>
      <CodeStepFromUrl mode="login" demoNote={<DemoCodeNoteSlot />} />
    </Suspense>
  );
}
