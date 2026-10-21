import { connection } from "next/server";
import { Suspense } from "react";
import { DEMO_COPY, isDemo } from "@/lib/demo";
import { DemoFlag } from "./demo-flag";

/**
 * The thin strip at the top of every page in DEMO_MODE (round plan §1): "גרסת הדגמה — שום דבר לא נשלח באמת".
 * DEMO_MODE is read per request (a dynamic hole in the static shell), so the strip tells the truth about the running
 * server even when the build ran without the variable. Renders nothing outside the demo.
 * It also hands that value to the client (DemoFlag, ./demo-flag.tsx), once per page load: the steps then draw their
 * demo parts together with the step, instead of streaming them in after it.
 */
export function DemoBar() {
  return (
    <Suspense fallback={null}>
      <DemoBarAtRequest />
    </Suspense>
  );
}

async function DemoBarAtRequest() {
  await connection();
  const demo = isDemo();
  return (
    <>
      {demo ? <DemoStrip /> : null}
      <DemoFlag on={demo} />
    </>
  );
}

/** The strip itself (also rendered by the tests). */
export function DemoStrip() {
  return (
    <div
      role="note"
      data-demo-bar=""
      className="flex flex-none items-center justify-center gap-2 border-b border-line bg-night-2 px-4 py-1.5 text-center text-[0.8125rem] leading-snug font-semibold text-cream"
    >
      <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-honey" />
      {DEMO_COPY.strip}
    </div>
  );
}
