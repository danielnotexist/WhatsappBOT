import { DEMO_OTP_CODE } from "@/lib/demo";

/**
 * On the code card in DEMO_MODE: nothing is mailed, so the card says which code works. Same pill as the
 * "Outlook מחובר" status on the ready card, in the ink of the light (dusty pink) card. The code pages place it through
 * <DemoCodeNoteLive> (./demo-flag.tsx), which knows DEMO_MODE in the same commit as the card.
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
