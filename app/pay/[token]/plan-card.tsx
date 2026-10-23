import { PRICING } from "@/components/brand/landing/content";
import { Cta } from "@/components/brand/cta";
import { PlanFeatureList } from "@/components/brand/plan-features";
import { formatIls, vatOf } from "@/lib/billing/money";
import { PLANS, type PaidPlan } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { startPaymentAction } from "./actions";

/**
 * One plan as a paper you can take: name, the price in big tabular digits (VAT included, the VAT part under it),
 * the monthly allowance and what the plan includes (the landing's price list: lib/billing/plans.ts planFeatures, with
 * basic's "חשבון אחד: Google או Microsoft" as its first line and "בקרוב" on what is coming), and the button
 * to HYP's secure page. Basic is the cream paper; pro is the honey one, the plan the page points at.
 */
export function PlanCard({ plan, token, current = false }: { plan: PaidPlan; token: string; current?: boolean }) {
  const spec = PLANS[plan];
  const copy = PRICING.plans.find((p) => p.id === plan)!;
  const pro = plan === "pro";
  return (
    <form
      action={startPaymentAction}
      aria-labelledby={`plan-${plan}`}
      className={cn("surface-light flex flex-col rounded-card p-6 text-ink shadow-stage sm:p-8 lg:p-10", pro ? "bg-honey" : "bg-paper")}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="plan" value={plan} />
      <div className="flex items-center justify-between gap-3">
        <h2 id={`plan-${plan}`} className="font-heading text-[1.5rem] leading-tight font-bold">
          {spec.nameHe}
        </h2>
        {current ? <span className="flex-none rounded-full bg-ink px-3 py-1 text-[0.8125rem] font-semibold text-cream">המסלול שלך</span> : null}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="tabular font-heading text-[clamp(3.75rem,3rem+2.6vw,5.25rem)] leading-[0.85] font-bold tracking-[-0.02em]">{spec.priceIls}</span>
        <span className="font-heading text-[2rem] leading-none font-bold">₪</span>
        <span className="ms-1 text-[1.0625rem] text-ink-muted">לחודש</span>
      </p>
      <p className="mt-3 text-[0.9375rem] text-ink-muted">כולל מע״מ {formatIls(vatOf(spec.priceIls))} ₪</p>
      <p className="mt-6 text-[1.0625rem] font-semibold">{copy.allowance}</p>
      {copy.lead ? <p className="mt-7 text-[1rem] text-ink-muted">{copy.lead}</p> : null}
      <PlanFeatureList lines={copy.features} rule={pro ? "border-ink/20" : "border-ink/15"} className={copy.lead ? "mt-3" : "mt-7"} itemClassName="py-3 text-[1rem]" />
      {/* the buttons line up at the bottom when the two papers stand side by side */}
      <div className="mt-auto pt-8">
        <Cta type="submit" tone={pro ? "ink" : "outline"} block>
          לתשלום
        </Cta>
      </div>
    </form>
  );
}
