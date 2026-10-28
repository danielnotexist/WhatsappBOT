import { IntegrationChipRow } from "@/components/brand/integrations/chip-row";
import { featuredGroups } from "@/lib/integrations/catalogue";
import { cn } from "@/lib/utils";

/**
 * "עובדת עם": the hero's quiet footnote - a hairline, then the featured product tiles (Google, then Microsoft 365) and
 * a link to the full list (#connectors). Sits under the call to action, never beside the headline. One tab stop:
 * the tiles are a toolbar (components/brand/integrations/chips.tsx).
 */
export function WorksWith({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid max-w-[34rem] grid-cols-[1fr_auto] items-center gap-x-5 gap-y-3.5 border-t border-line pt-6 sm:grid-cols-[auto_auto_1fr]",
        className,
      )}
    >
      <p id="works-with-label" className="text-[0.9375rem] text-cream-muted">
        עובדת עם
      </p>
      <IntegrationChipRow
        groups={featuredGroups()}
        labelledBy="works-with-label"
        size="sm"
        className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
      />
      <a
        href="#connectors"
        className="justify-self-end rounded-sm text-[0.9375rem] text-cream-muted underline decoration-cream-muted/40 underline-offset-4 transition-colors hover:text-cream hover:decoration-cream"
      >
        כל החיבורים
      </a>
    </div>
  );
}
