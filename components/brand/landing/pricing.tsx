import { Cta } from "@/components/brand/cta";
import { IntegrationChipRow } from "@/components/brand/integrations/chip-row";
import { PlanFeatureList } from "@/components/brand/plan-features";
import { integrationsForPlan } from "@/lib/integrations/catalogue";
import { cn } from "@/lib/utils";
import { PRICING } from "./content";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * Pricing as a printed price list: one paper sheet on the night stage (the signup cards' paper), two columns split by
 * a rule. Prices, allowances, the trial and every feature line come from lib/billing/plans.ts (planFeatures, generated
 * from the entitlements): basic lists what one account gives, pro opens with "כל מה שבבסיסי, ובנוסף:" and its own
 * lines, "בקרוב" on what is coming. Each plan ends with the product tiles it connects to
 * (lib/integrations/catalogue.ts integrationsForPlan): basic under "חשבון אחד: Google או Microsoft" (its account line
 * stands there instead of in the list), pro under "כולל חיבור ל:" with the full set. One call to action: the plan is
 * chosen in WhatsApp after the free messages, not here.
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
            {PRICING.trial} ההודעות הראשונות בחינם, עם חיבור למייל וליומן. אחר כך בוחרים מסלול,
            בלי התחייבות.
          </p>
        </div>

        <div className="surface-light alze-paper-grain mt-14 grid overflow-hidden rounded-card text-ink shadow-stage sm:mt-20 md:grid-cols-2">
          {PRICING.plans.map((plan, i) => (
            <article
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
              // the tooltips of the connection tiles stay inside the card (the sheet clips its overflow)
              data-tip-bounds
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
              <PlanFeatureList
                lines={plan.features.filter((f) => f.id !== "account")}
                className={plan.lead ? "mt-3" : "mt-9"}
                itemClassName="text-[1.0625rem]"
              />
              {/* pinned to the foot of the card, so both plans' rows line up */}
              <div className="mt-auto pt-10">
                <p
                  id={`plan-${plan.id}-connections`}
                  className={cn("text-[0.9375rem]", plan.id === "basic" ? "font-semibold" : "text-ink-muted")}
                >
                  {plan.connectionsLabel}
                </p>
                <IntegrationChipRow
                  groups={integrationsForPlan(plan.id)}
                  labelledBy={`plan-${plan.id}-connections`}
                  tone="paper"
                  className="mt-3.5"
                />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-7 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-[38rem] text-[0.9375rem] leading-[1.65] text-cream-muted">
            <p>
              {PRICING.connectionsNote}{" "}
              <a
                href="#connectors"
                className="rounded-sm whitespace-nowrap text-cream underline decoration-cream-muted/50 underline-offset-4 hover:decoration-cream"
              >
                לכל החיבורים
              </a>
            </p>
            <p className="mt-2">{PRICING.vatNote}</p>
          </div>
          <Cta href="/start" className="flex-none max-sm:w-full">
            בואו נתחיל - לוקח דקה
          </Cta>
        </div>
      </div>
    </section>
  );
}
