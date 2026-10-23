import { IntegrationTile, MoreTile } from "@/components/brand/integrations/tile";
import { SoonTag } from "@/components/brand/integrations/soon-tag";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { SystemRequest } from "@/components/brand/system-request";
import { integrationGroups, type Integration, type IntegrationGroup } from "@/lib/integrations/catalogue";
import { INTEGRATION_MARK_STYLE } from "@/lib/integrations/tiles";
import { SYSTEM_REQUEST_COPY } from "@/lib/support/types";
import { cn } from "@/lib/utils";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * "החיבורים": everything she works with, as a directory of cards (Daniel, 23.10.2026, round 3) - one group per account
 * (Google, Microsoft 365) and one for the business systems on the way, each under its heading with a count. A card: the
 * product's official mark in its own colours, straight on the card (lib/integrations/tiles.ts "marks"), its name, and
 * one quiet line of what she does with it; what is not connected yet carries "בקרוב" in its corner. The cards are a
 * step lighter than the stage, with a hairline edge, so the darker marks (Microsoft's navy, Excel's green) still read -
 * no glow. The business group ends with "ועוד בהמשך" - a card that opens "בקשת מערכת"
 * (components/brand/system-request.tsx). Data: lib/integrations/catalogue.ts.
 */
export function Connectors() {
  const groups = integrationGroups();
  return (
    <section id="connectors" aria-labelledby="connectors-title" className="alze-defer scroll-mt-6 py-28 sm:py-40">
      <div className={CONTAINER}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-20">
          <h2 id="connectors-title" className={cn(H2, "max-w-[12ch]")}>
            מתחברת לכלים שכבר יש לכם.
          </h2>
          <p className={cn(LEDE, "max-w-[30rem]")}>
            מתחברים פעם אחת עם חשבון Google או Microsoft 365, והיא עובדת מתוך המייל, היומן והקבצים. מה שמסומן ״בקרוב״ עוד
            בפיתוח.
          </p>
        </div>

        <div className="mt-16 space-y-14 sm:mt-20 sm:space-y-16">
          {groups.map((g) => (
            <Group key={g.vendor} group={g} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 2 columns on a phone, 3 on a large phone or a small tablet, 4 on a tablet and a laptop (each account in two full
 * rows), 8 on a desktop (each account in one row - 6 left a 2-card orphan row under each account)
 */
const GRID = "grid grid-cols-2 gap-2.5 min-[34rem]:grid-cols-3 sm:gap-3 md:grid-cols-4 xl:grid-cols-8";

function Group({ group }: { group: IntegrationGroup }) {
  const soon = group.items.filter((i) => i.status === "soon").length;
  const live = group.items.length - soon;
  const titleId = `connectors-${group.vendor}`;
  // the owners' account logos ask for a white chip: only with the white-chip marks
  const logo = INTEGRATION_MARK_STYLE === "svg" && group.vendor !== "business";
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
      <ul aria-labelledby={titleId} className={GRID}>
        {group.items.map((i) => (
          <Card key={i.id} integration={i} />
        ))}
        {group.vendor === "business" ? <RequestCard /> : null}
      </ul>
    </div>
  );
}

/** the card's frame: a step above the stage, a hairline edge, the page's card corner scaled down */
const CARD = "relative flex h-full flex-col items-center rounded-[1.25rem] px-3 pt-7 pb-5 text-center sm:px-4 sm:pt-8 sm:pb-6 xl:px-2";

function Card({ integration: i }: { integration: Integration }) {
  const soon = i.status === "soon";
  return (
    <li className={cn(CARD, "border border-cream/[0.085] bg-cream/[0.045]")}>
      {soon ? <SoonTag className="absolute end-2.5 top-2.5 px-1.5 text-[0.6875rem] sm:end-3 sm:top-3" /> : null}
      <IntegrationTile integration={i} size="xl" />
      <p className="mt-4 text-[1rem] leading-snug font-semibold text-cream xl:text-[0.9375rem]">
        <bdi>{i.name}</bdi>
      </p>
      <p className="mt-1.5 max-w-[15rem] text-[0.8125rem] leading-[1.45] text-cream-muted">{i.benefit}</p>
    </li>
  );
}

/**
 * "ועוד בהמשך": the last card is the way to ask for a missing system. The whole card is the button (a big target on a
 * phone); its name is the honey "בקשת מערכת", the line under the title describes it.
 */
function RequestCard() {
  const C = SYSTEM_REQUEST_COPY;
  return (
    <li>
      <SystemRequest
        labelledBy="connectors-request-name"
        describedBy="connectors-request-lead"
        className={cn(
          CARD,
          "group w-full border border-dashed border-cream-muted/30 transition-colors duration-150 hover:border-cream-muted/60 hover:bg-cream/[0.03] focus-visible:outline-offset-2 motion-reduce:transition-none",
        )}
      >
        <MoreTile size="xl" />
        <span aria-hidden="true" className="mt-4 block text-[1rem] leading-snug font-semibold text-cream xl:text-[0.9375rem]">
          {C.rowTitle}
        </span>
        <span id="connectors-request-lead" className="mt-1.5 block max-w-[15rem] text-[0.8125rem] leading-[1.45] text-cream-muted">
          {C.rowLead}
        </span>
        <span id="connectors-request-name" className="mt-3 block text-[0.875rem] font-semibold text-honey underline decoration-honey/40 underline-offset-4 group-hover:decoration-honey">
          {C.trigger}
        </span>
      </SystemRequest>
    </li>
  );
}
