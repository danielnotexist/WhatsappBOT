import type { PlanFeatureLine } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { SoonTag, type TileTone } from "./integrations/soon-tag";

/**
 * A plan's features as ruled rows (the landing's price list, the pay page's plan papers, the upgrade offer, and on the
 * night stage the personal area's "מנוי"): the lines come from lib/billing/plans.ts (planFeatures), and a line that is
 * included once it ships carries "בקרוב".
 */
export function PlanFeatureList({
  lines,
  tone = "paper",
  rule = tone === "paper" ? "border-ink/15" : "border-line",
  className,
  itemClassName,
}: {
  lines: readonly PlanFeatureLine[];
  tone?: TileTone;
  rule?: string;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ul className={cn("border-t", rule, className)}>
      {lines.map((l) => (
        <li key={l.id} data-soon={l.soon ? "" : undefined} className={cn("flex items-baseline justify-between gap-3 border-b py-3.5 leading-snug", rule, itemClassName)}>
          <span className={l.soon ? (tone === "paper" ? "text-ink-muted" : "text-cream-muted") : undefined}>{l.text}</span>
          {l.soon ? <SoonTag tone={tone} /> : null}
        </li>
      ))}
    </ul>
  );
}
