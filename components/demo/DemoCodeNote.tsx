import { connection } from "next/server";
import { Suspense } from "react";
import { DEMO_OTP_CODE, isDemo } from "@/lib/demo";

/**
 * On the code card in DEMO_MODE: nothing is mailed, so the card says which code works. Same pill as the
 * "Outlook מחובר" status on the ready card, in the ink of the light (dusty pink) card.
 */
export function DemoCodeNote() {
  return (
    <p role="note" className="mb-5 inline-flex items-center gap-2 self-start rounded-full bg-ink/10 px-3 py-1 text-[0.9375rem] text-ink">
      <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-ink" />
      <span>
        בגרסת ההדגמה הקוד הוא{" "}
        <bdi dir="ltr" className="font-semibold tabular">
          {DEMO_OTP_CODE}
        </bdi>
      </span>
    </p>
  );
}

/** The note as the build sees DEMO_MODE (Vercel builds and runs with the same variables) — for static fallbacks. */
export function DemoCodeNoteAtBuild() {
  return isDemo() ? <DemoCodeNote /> : null;
}

/**
 * The note as the code pages place it (`demoNote` of CodeStep). The pages are static so the card opens at once: the
 * build's DEMO_MODE draws it right away, and the running server's DEMO_MODE confirms it per request — like the strip
 * (DemoBar), it tells the truth even if the build ran without the variable.
 */
export function DemoCodeNoteSlot() {
  return (
    <Suspense fallback={<DemoCodeNoteAtBuild />}>
      <DemoCodeNoteAtRequest />
    </Suspense>
  );
}

async function DemoCodeNoteAtRequest() {
  await connection();
  return isDemo() ? <DemoCodeNote /> : null;
}
