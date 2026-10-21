import type { Metadata } from "next";
import { Suspense } from "react";
import { CodeStep, CodeStepFromUrl } from "@/components/auth/code-step";
import { DemoCodeNoteAtBuild, DemoCodeNoteSlot } from "@/components/demo/DemoCodeNote";

export const metadata: Metadata = { title: "קוד אימות" };

/**
 * Step 3: the six-digit code. Static: email / opt-in / cooldown come in the URL from the email card and are read on the
 * client (CodeStepFromUrl), so navigating here draws the whole card at once. On a page load the card itself is the
 * fallback until the URL is known — never an empty card.
 */
export default function StartCodePage() {
  return (
    <Suspense fallback={<CodeStep email="" demoNote={<DemoCodeNoteAtBuild />} autoFocus={false} />}>
      <CodeStepFromUrl demoNote={<DemoCodeNoteSlot />} />
    </Suspense>
  );
}
