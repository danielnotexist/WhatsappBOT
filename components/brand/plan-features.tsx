import type { PlanFeatureLine } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { SoonTag } from "./integrations/soon-tag";

/**
 * A plan's features as ruled rows on paper (the landing's price list, the pay page's plan papers, the upgrade offer):
 * the lines come from lib/billing/plans.ts (planFeatures), and a line that is included once it ships carries "בקרוב".
 */
export function PlanFeatureList({ lines, rule = "border-ink/15", className, itemClassName }: { lines: readonly PlanFeatureLine[]; rule?: string; className?: string; itemClassName?: string }) {
  return (
    <ul className={cn("border-t", rule, className)}>
      {lines.map((l) => (
        <li key={l.id} data-soon={l.soon ? "" : undefined} className={cn("flex items-baseline justify-between gap-3 border-b py-3.5 leading-snug", rule, itemClassName)}>
          <span className={l.soon ? "text-ink-muted" : undefined}>{l.text}</span>
          {l.soon ? <SoonTag tone="paper" /> : null}
        </li>
      ))}
    </ul>
  );
}
