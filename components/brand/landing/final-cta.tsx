import { Cta } from "@/components/brand/cta";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { DeferredMascot } from "./mascot";
import { CONTAINER } from "./ui";

/** The end card: the hero's second sentence again, under a dawn light, and the one call to action - no more words. */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-title"
      className="alze-defer relative overflow-hidden py-28 text-center sm:py-40"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_75%_at_50%_120%,rgb(233_184_102/0.17),rgb(216_169_156/0.05)_55%,transparent_75%)]"
      />
      <div className={cn(CONTAINER, "relative flex flex-col items-center")}>
        {/* decorative: the headline says it */}
        <DeferredMascot
          pose="celebrating"
          idle="float"
          sizes="(min-width: 640px) 184px, 144px"
          className="mb-6 w-[9rem] sm:w-[11.5rem]"
        />
        <h2
          id="final-title"
          className="headline-light text-[clamp(3rem,1.55rem+6.1vw,7.25rem)] leading-[0.98] tracking-[-0.018em]"
        >
          {BRAND.name} על זה.
        </h2>
        <Cta href="/start" className="mt-10 max-sm:w-full sm:min-w-64">
          בואו נתחיל - לוקח דקה
        </Cta>
      </div>
    </section>
  );
}
