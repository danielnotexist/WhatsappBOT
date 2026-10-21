import { Cta } from "@/components/brand/cta";
import { cn } from "@/lib/utils";
import { PRICING } from "./content";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * Pricing as a printed price list: one paper sheet on the night stage (the signup cards' paper), two columns split by
 * a rule. Prices, allowances and the trial come from lib/billing/plans.ts. One call to action: the plan is chosen in
 * WhatsApp after the free messages, not here.
 */
export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="alze-defer scroll-mt-6 py-28 sm:py-40"
    >
      <div className={CONTAINER}>
        <div>
          <h2 id="pricing-title" className={cn(H2, "max-w-[13ch]")}>
            שני מסלולים. מתחילים בחינם.
          </h2>
          <p className={cn(LEDE, "mt-6 max-w-[31rem]")}>
            {PRICING.trial} ההודעות הראשונות בחינם, עם חיבור מלא למייל וליומן. אחר כך בוחרים מסלול,
            בלי התחייבות.
          </p>
        </div>

        <div className="surface-light alze-paper-grain mt-14 grid overflow-hidden rounded-card text-ink shadow-stage sm:mt-20 md:grid-cols-2">
          {PRICING.plans.map((plan, i) => (
            <article
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
              className={cn(
                "flex flex-col px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14",
                i > 0 && "border-t border-ink/15 md:border-s md:border-t-0",
              )}
            >
              <h3 id={`plan-${plan.id}`} className="font-sans text-[1.25rem] font-bold">
                {plan.name}
              </h3>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="tabular font-heading text-[clamp(4.25rem,3.2rem+4vw,7rem)] leading-[0.85] font-bold tracking-[-0.02em]">
                  {plan.price}
                </span>
                <span className="font-heading text-[2.25rem] leading-none font-bold">₪</span>
                <span className="ms-1 text-[1.0625rem] text-ink-muted">לחודש</span>
              </p>
              <p className="mt-6 text-[1.0625rem] font-semibold">{plan.allowance}</p>
              {plan.lead ? <p className="mt-9 text-[1rem] text-ink-muted">{plan.lead}</p> : null}
              <ul className={cn("border-t border-ink/15", plan.lead ? "mt-3" : "mt-9")}>
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="border-b border-ink/15 py-3.5 text-[1.0625rem] leading-snug"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-7 md:flex-row md:items-center md:justify-between md:gap-12">
          <p className="max-w-[38rem] text-[0.9375rem] leading-[1.65] text-cream-muted">
            {PRICING.vatNote}
          </p>
          <Cta href="/start" className="flex-none max-sm:w-full">
            בואו נתחיל — לוקח דקה
          </Cta>
        </div>
      </div>
    </section>
  );
}
