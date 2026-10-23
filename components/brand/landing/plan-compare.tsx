import { IntegrationChipRow } from "@/components/brand/integrations/chip-row";
import { SoonTag } from "@/components/brand/integrations/soon-tag";
import { SystemRequest } from "@/components/brand/system-request";
import { PLANS, type PaidPlan } from "@/lib/billing/plans";
import { planComparison, trialNote, type CompareCell } from "@/lib/billing/compare";
import { integrationsForPlan } from "@/lib/integrations/catalogue";
import { cn } from "@/lib/utils";
import { PRICING } from "./content";
import { CONTAINER, H2, LEDE } from "./ui";

const PAID: readonly PaidPlan[] = ["basic", "pro"];

/**
 * /pricing, the full comparison: one table, a row per capability, generated from the entitlements
 * (lib/billing/compare.ts). A real <table> - the plan names are the column headers, each capability its row header, the
 * four groups row groups - so a screen reader reads "SharePoint, פרו, כלול". On a phone the same three columns, the
 * plan columns narrow; the header row stays on top while scrolling.
 */
export function PlanCompare() {
  const sections = planComparison();
  return (
    <section id="compare" aria-labelledby="compare-title" className="scroll-mt-6 py-20 sm:py-28">
      <div className={CONTAINER}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-20">
          <h2 id="compare-title" className={cn(H2, "max-w-[12ch]")}>
            ההשוואה המלאה.
          </h2>
          <p className={cn(LEDE, "max-w-[30rem]")}>{trialNote()}</p>
        </div>

        <table className="mt-12 w-full border-collapse text-start sm:mt-16">
          <caption className="sr-only">בסיסי מול פרו, יכולת אחרי יכולת</caption>
          <colgroup>
            <col />
            <col className="w-[27%] sm:w-[22%] lg:w-[18%]" />
            <col className="w-[27%] sm:w-[22%] lg:w-[18%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-night">
            <tr className="border-b border-cream/25">
              <th scope="col" className="py-4 text-start align-bottom text-[0.875rem] font-normal text-cream-muted">
                <span className="sr-only">יכולת</span>
              </th>
              {PAID.map((p) => (
                <th key={p} scope="col" className="px-2 py-4 text-center align-bottom">
                  <span className="block font-sans text-[1.125rem] leading-tight font-bold sm:text-[1.25rem]">{PLANS[p].nameHe}</span>
                  <span className="mt-1 block text-[0.875rem] font-normal text-cream-muted tabular">{PLANS[p].priceIls} ₪ לחודש</span>
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.id}>
              <tr>
                <th colSpan={3} scope="colgroup" className="pt-10 pb-3 text-start font-heading text-[1.25rem] leading-tight font-bold text-sage sm:text-[1.375rem]">
                  {s.title}
                </th>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <th scope="row" className="py-3.5 pe-3 text-start align-top text-[0.9375rem] leading-snug font-normal text-cream sm:text-[1.0625rem]">
                    {r.label}
                  </th>
                  <Cell cell={r.basic} />
                  <Cell cell={r.pro} />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="mt-6 max-w-[44rem] text-[0.9375rem] leading-[1.65] text-cream-muted">{PRICING.vatNote}</p>
      </div>
    </section>
  );
}

function Cell({ cell }: { cell: CompareCell }) {
  return (
    <td className="px-2 py-3.5 text-center align-top text-[0.875rem] leading-snug sm:text-[0.9375rem]">
      {cell.kind === "yes" ? (
        <span className="inline-grid size-6 place-items-center rounded-full bg-sage/15 text-sage">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-[2.6]">
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">כלול</span>
        </span>
      ) : cell.kind === "no" ? (
        <span className="inline-grid h-6 place-items-center">
          <span aria-hidden="true" className="block h-0.5 w-3 rounded-full bg-cream-muted/45" />
          <span className="sr-only">לא כלול</span>
        </span>
      ) : cell.kind === "soon" ? (
        <SoonTag className="mt-0.5" />
      ) : (
        <span className="text-cream">{cell.text}</span>
      )}
    </td>
  );
}

/**
 * /pricing: every system each plan connects to, by account, on the night icon set - with their tooltips - and the way
 * to ask for a missing one ("בקשת מערכת").
 */
export function PlanConnections() {
  return (
    <section id="plan-connections" aria-labelledby="plan-connections-title" className="scroll-mt-6 border-t border-line py-20 sm:py-28">
      <div className={CONTAINER}>
        <h2 id="plan-connections-title" className={cn(H2, "max-w-[14ch]")}>
          החיבורים בכל מסלול.
        </h2>
        <div className="mt-12 grid gap-x-16 gap-y-14 sm:mt-16 md:grid-cols-2">
          {PRICING.plans.map((plan) => (
            <div key={plan.id} data-tip-bounds className="min-w-0">
              <h3 className="font-sans text-[1.375rem] leading-tight font-bold">{plan.name}</h3>
              <p className="mt-1.5 text-[0.9375rem] text-cream-muted">{plan.connectionsLabel}</p>
              <div className="mt-6 space-y-6 border-t border-line pt-6">
                {integrationsForPlan(plan.id).map((g) => {
                  const id = `plan-connections-${plan.id}-${g.vendor}`;
                  return (
                    <div key={g.vendor}>
                      <p id={id} className="mb-3 flex items-center gap-2.5 text-[0.9375rem] font-semibold text-cream">
                        <bdi>{g.title}</bdi>
                        {g.items.every((i) => i.status === "soon") ? <SoonTag /> : null}
                      </p>
                      <IntegrationChipRow groups={[g]} labelledBy={id} size="md" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-14 text-[1rem] text-cream-muted">
          חסרה מערכת שהעסק עובד איתה? <SystemRequest />
        </p>
      </div>
    </section>
  );
}
