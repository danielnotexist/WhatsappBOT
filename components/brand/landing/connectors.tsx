import { IntegrationTile } from "@/components/brand/integrations/tile";
import { SoonTag } from "@/components/brand/integrations/soon-tag";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { SystemRequest } from "@/components/brand/system-request";
import { integrationGroups, type Integration, type IntegrationGroup } from "@/lib/integrations/catalogue";
import { INTEGRATION_MARK_STYLE } from "@/lib/integrations/tiles";
import { cn } from "@/lib/utils";
import { CONTAINER, H2 } from "./ui";

/**
 * "החיבורים": everything she works with (Daniel, 23.10.2026, round 3; trimmed 28.10.2026) - one group per account
 * (Google, Microsoft 365) as a directory of cards, each under its heading with a count. A card is the product's official
 * mark in its own colours (lib/integrations/tiles.ts "marks") and its name, nothing more; what is not connected yet
 * carries "בקרוב" in its corner. The cards are a step lighter than the stage, with a hairline edge, so the darker marks
 * (Microsoft's navy, Excel's green) still read - no glow. The business systems on the way are one compact row of
 * small pills, ending with the way to ask for a missing one ("בקשת מערכת", components/brand/system-request.tsx).
 * Data: lib/integrations/catalogue.ts.
 */
export function Connectors() {
  const groups = integrationGroups();
  return (
    <section id="connectors" aria-labelledby="connectors-title" className="alze-defer scroll-mt-6 py-24 sm:py-32">
      <div className={CONTAINER}>
        <h2 id="connectors-title" className={cn(H2, "max-w-[12ch]")}>
          מתחברת לכלים שכבר יש לכם.
        </h2>

        <div className="mt-12 space-y-12 sm:mt-16 sm:space-y-14">
          {groups.map((g) => (
            <Group key={g.vendor} group={g} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 3 columns on a phone (a card is only a mark and a name), 4 on a tablet and a laptop (each account in two full rows),
 * 8 on a desktop (each account in one row - 6 left a 2-card orphan row under each account)
 */
const GRID = "grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-8";

function Group({ group }: { group: IntegrationGroup }) {
  const soon = group.items.filter((i) => i.status === "soon").length;
  const live = group.items.length - soon;
  const titleId = `connectors-${group.vendor}`;
  const business = group.vendor === "business";
  // the owners' account logos ask for a white chip: only with the white-chip marks
  const logo = INTEGRATION_MARK_STYLE === "svg" && !business;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-5">
        <h3 id={titleId} className="flex items-center gap-3 font-heading text-[1.375rem] leading-tight">
          {logo ? (
            <span aria-hidden="true" className="grid size-8 flex-none place-items-center self-center rounded-[0.5625rem] bg-white">
              <ProviderLogo provider={group.vendor as "google" | "microsoft"} className="size-4" />
            </span>
          ) : null}
          <bdi>{group.title}</bdi>
        </h3>
        <p className="tabular text-[0.9375rem] text-cream-muted">
          {live ? `${live} חיבורים` : null}
          {live && soon ? ", " : null}
          {soon ? `${soon} בקרוב` : null}
        </p>
      </div>
      {business ? (
        // the systems on the way: one compact row, and the way to ask for a missing one at its end
        <ul aria-labelledby={titleId} className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {group.items.map((i) => (
            <Pill key={i.id} integration={i} />
          ))}
          <li className="ms-1 sm:ms-2">
            <SystemRequest className="inline-flex min-h-11 items-center rounded-sm text-[0.9375rem] font-semibold text-honey underline decoration-honey/40 underline-offset-4 hover:decoration-honey" />
          </li>
        </ul>
      ) : (
        <ul aria-labelledby={titleId} className={GRID}>
          {group.items.map((i) => (
            <Card key={i.id} integration={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** the card's frame: a step above the stage, a hairline edge, the page's card corner scaled down */
const CARD = "relative flex h-full flex-col items-center rounded-[1.25rem] border border-cream/[0.085] bg-cream/[0.045] px-1.5 py-5 text-center sm:px-4 sm:py-7 xl:px-2";

function Card({ integration: i }: { integration: Integration }) {
  return (
    <li className={CARD}>
      {i.status === "soon" ? <SoonTag className="absolute end-2.5 top-2.5 px-1.5 text-[0.6875rem] sm:end-3 sm:top-3" /> : null}
      <IntegrationTile integration={i} size="xl" />
      <p className="mt-3 text-[0.875rem] leading-snug font-semibold text-balance text-cream sm:mt-3.5 sm:text-[1rem] xl:text-[0.9375rem]">
        <bdi>{i.name}</bdi>
      </p>
    </li>
  );
}

/** A business system on the way: its mark and its name in a small pill (the group's heading says "בקרוב"). */
function Pill({ integration: i }: { integration: Integration }) {
  return (
    <li className="flex items-center gap-2.5 rounded-full border border-cream/[0.085] bg-cream/[0.045] py-1.5 ps-1.5 pe-4">
      <IntegrationTile integration={i} size="sm" />
      <span className="text-[0.9375rem] leading-snug font-semibold text-cream">
        <bdi>{i.name}</bdi>
      </span>
    </li>
  );
}
