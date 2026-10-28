import { SoonTag } from "@/components/brand/integrations/soon-tag";
import { SystemRequest } from "@/components/brand/system-request";
import { PLANS, type PaidPlan } from "@/lib/billing/plans";
import { planComparison, type CompareCell } from "@/lib/billing/compare";
import { cn } from "@/lib/utils";
import { OpenOnHash } from "./open-on-hash";
import { CONTAINER } from "./ui";

const PAID: readonly PaidPlan[] = ["basic", "pro"];

/**
 * /pricing, the full comparison: behind one disclosure, "להשוואה המלאה" (Daniel, 28.10.2026: closed until asked for),
 * in the FAQ's style - a native <details>, so it opens with the keyboard and without JavaScript; "/pricing#compare"
 * (the landing's link) opens it (./open-on-hash.tsx). Inside, one table, a row per capability, generated from the
 * entitlements (lib/billing/compare.ts). A real <table> - the plan names are the column headers, each capability its
 * row header, the four groups row groups - so a screen reader reads "SharePoint, פרו, כלול". On a phone the same three
 * columns, the plan columns narrow; the header row stays on top while scrolling. At its foot, the way to ask for a
 * missing system ("בקשת מערכת", the pricing FAQ points here).
 */
export function PlanCompare() {
  const sections = planComparison();
  return (
    <section aria-label="ההשוואה המלאה" className="pt-6 pb-16 sm:pt-8 sm:pb-24">
      <div className={cn(CONTAINER, "alze-faq")}>
        <OpenOnHash id="compare" className="scroll-mt-6 border-y border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-6 font-heading text-[clamp(1.375rem,1.2rem+0.7vw,1.75rem)] leading-snug font-bold">
            להשוואה המלאה
            <span data-plus aria-hidden="true" className="relative size-4 flex-none text-honey">
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current" />
              <span className="absolute inset-x-0 inset-y-0 mx-auto w-0.5 rounded-full bg-current" />
            </span>
          </summary>

          <div className="pb-10">
            <table className="w-full border-collapse text-start">
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
            <p className="mt-8 text-[1rem] text-cream-muted">
              חסרה מערכת? <SystemRequest />
            </p>
          </div>
        </OpenOnHash>
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
