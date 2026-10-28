import Link from "next/link";
import { Cta } from "@/components/brand/cta";
import { IntegrationChipRow } from "@/components/brand/integrations/chip-row";
import { PlanFeatureList } from "@/components/brand/plan-features";
import { integrationsForPlan } from "@/lib/integrations/catalogue";
import { cn } from "@/lib/utils";
import { PRICING, formatNumber } from "./content";
import { AnnualOnly, CycleProvider, CycleToggle, PlanPrice } from "./plan-cycle";
import { CONTAINER, H2, LEDE } from "./ui";

/** how many connection tiles a plan shows before "+K" (the rest open in place) */
const TILES_SHOWN = 8;

/**
 * Pricing on the landing, compact (Daniel, 23.10.2026: both plans within one desktop screen): two cards on the night
 * stage, basic on cream paper and pro on honey (24.10.2026). Each plan: its name and allowance beside the price, then the
 * feature lines of lib/billing/plans.ts (planFeatures, generated from the entitlements) as tight ruled rows, each led by
 * its product marks or a check - pro opens with
 * "כל מה שבבסיסי, ובנוסף:", "בקרוב" on what is coming - and at its foot one compact row of the systems it connects
 * to (lib/integrations/catalogue.ts integrationsForPlan, the official marks straight on the card): the first few tiles and "+K" for the rest.
 * The full comparison lives on /pricing ("להשוואה המלאה"). One call to action: the plan is chosen in WhatsApp after
 * the free messages, not here.
 */
export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="alze-defer scroll-mt-6 py-24 sm:pt-10 sm:pb-32">
      <div className={CONTAINER}>
        {/* one line beside the lede on wide screens: the sheet starts within the first screen */}
        <div className="grid gap-5 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-end xl:gap-14">
          <h2 id="pricing-title" className={cn(H2, "max-w-[13ch] xl:max-w-none xl:whitespace-nowrap")}>
            שני מסלולים. מתחילים בחינם.
          </h2>
          <p className={cn(LEDE, "max-w-[31rem] xl:pb-2")}>
            {PRICING.trial} ההודעות הראשונות בחינם, עם חיבור למייל וליומן. אחר כך בוחרים מסלול, בלי התחייבות.
          </p>
        </div>

        <PlanSheet className="mt-6 sm:mt-7" />

        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-[40rem] text-[0.9375rem] leading-[1.65] text-cream-muted">
            <p>
              {PRICING.connectionsNote}{" "}
              <a href="#connectors" className="rounded-sm whitespace-nowrap text-cream underline decoration-cream-muted/50 underline-offset-4 hover:decoration-cream">
                לכל החיבורים
              </a>
            </p>
            <p className="mt-2">{PRICING.vatNote}</p>
          </div>
          <div className="flex flex-none flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link
              href="/pricing"
              className="rounded-sm text-center text-[1rem] font-semibold whitespace-nowrap text-cream underline decoration-honey/60 underline-offset-[6px] hover:decoration-honey max-sm:order-last"
            >
              להשוואה המלאה
            </Link>
            <Cta href="/start" className="max-sm:w-full">
              בואו נתחיל - לוקח דקה
            </Cta>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The two plans as two cards side by side (the landing, and the top of /pricing): basic on the cream paper, pro on
 * honey with ink type - the pro card of the brand film (media/brand-film): "כל מה שבבסיסי, ובנוסף:", hairline rules,
 * and every line opening with the marks of the products it is about or a check in a small circle (a moss circle on
 * the paper, an ink one on the honey). `tilesShown`: the connection tiles before "+K" (undefined shows them all).
 */
export function PlanSheet({ className, tilesShown = TILES_SHOWN, headingLevel = 3 }: { className?: string; tilesShown?: number; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <CycleProvider>
      <div className={className}>
        {/* monthly by default; the annual face: "82.50 ₪ לחודש", the yearly charge under it (./plan-cycle.tsx) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <CycleToggle />
          <AnnualOnly>
            <p className="text-[0.9375rem] text-cream-muted">{PRICING.annualNote}</p>
          </AnnualOnly>
        </div>
        <PlanCards tilesShown={tilesShown} H={H} />
      </div>
    </CycleProvider>
  );
}

function PlanCards({ tilesShown, H }: { tilesShown?: number; H: "h2" | "h3" }) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-5">
      {PRICING.plans.map((plan) => {
        const pro = plan.id === "pro";
        return (
          <article
            key={plan.id}
            aria-labelledby={`plan-${plan.id}`}
            // the tooltips of the connection tiles stay inside the card (the card clips its overflow)
            data-tip-bounds
            data-plan-surface={pro ? "honey" : "paper"}
            className={cn(
              "surface-light flex flex-col overflow-hidden rounded-card px-6 py-7 text-ink shadow-stage sm:px-9 sm:py-8 lg:px-11",
              pro ? "bg-honey" : "alze-paper-grain",
            )}
          >
            {/* wide cards: one row (the allowance wraps before the price does); narrow ones: the price under the name */}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 xl:flex-nowrap">
              <div className="min-w-0 xl:flex-1">
                <H id={`plan-${plan.id}`} className="font-sans text-[1.375rem] leading-tight font-bold">
                  {plan.name}
                </H>
                <p className="mt-1.5 text-[0.9375rem] leading-snug font-semibold text-ink-muted">{plan.allowance}</p>
              </div>
              <PlanPrice monthly={String(plan.price)} annual={formatNumber(plan.annualPrice)} perMonth={plan.annualPerMonth} />
            </div>
            {plan.lead ? <p className="mt-6 text-[0.9375rem] font-semibold text-ink-muted">{plan.lead}</p> : null}
            <PlanFeatureList
              lines={plan.features.filter((f) => f.id !== "account")}
              rule={pro ? "border-ink/20" : "border-ink/15"}
              lead={pro ? "ink" : "moss"}
              className={plan.lead ? "mt-2" : "mt-6"}
              itemClassName="py-2 text-[0.9375rem]"
            />
            {/* pinned to the foot of the card, so both plans' rows line up */}
            <div className="mt-auto pt-6">
              <p id={`plan-${plan.id}-connections`} className="text-[0.875rem] leading-snug font-semibold">
                {plan.connectionsLabel}
              </p>
              <IntegrationChipRow
                groups={integrationsForPlan(plan.id)}
                labelledBy={`plan-${plan.id}-connections`}
                tone="paper"
                size="xs"
                collapsed={tilesShown}
                className="mt-2.5"
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
