import type { ReactNode } from "react";
import { IntegrationTile, MoreTile } from "@/components/brand/integrations/tile";
import { SoonTag } from "@/components/brand/integrations/soon-tag";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { SystemRequest } from "@/components/brand/system-request";
import { integrationGroups, type IntegrationGroup } from "@/lib/integrations/catalogue";
import { INTEGRATION_MARK_STYLE } from "@/lib/integrations/tiles";
import { SYSTEM_REQUEST_COPY } from "@/lib/support/types";
import { cn } from "@/lib/utils";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * "החיבורים": everything she works with, as a ruled directory in the page's own idiom (the hairline lists of
 * "לפי מקצוע", the trust facts and the FAQ) - one column per account (Google, Microsoft 365) and one for the
 * business systems on the way. Each row: the product's tile (our night icon set, lib/integrations/tiles.ts), its name
 * and one line of what she does with it; what is not connected yet carries "בקרוב". The business column ends with
 * "ועוד בהמשך" - a button that opens "בקשת מערכת" (components/brand/system-request.tsx). Data:
 * lib/integrations/catalogue.ts.
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

        <div className="mt-16 grid gap-x-12 gap-y-16 sm:mt-20 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Group key={g.vendor} group={g} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Group({ group }: { group: IntegrationGroup }) {
  const allSoon = group.items.every((i) => i.status === "soon");
  const titleId = `connectors-${group.vendor}`;
  // the owners' logos ask for a white chip; with our own tiles the heading is the name alone
  const logo = INTEGRATION_MARK_STYLE === "svg" && group.vendor !== "business";
  return (
    <div>
      <h3 id={titleId} className="flex items-center gap-3 pb-5 font-heading text-[1.375rem] leading-tight">
        {logo ? (
          <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-[0.5625rem] bg-white">
            <ProviderLogo provider={group.vendor as "google" | "microsoft"} className="size-4" />
          </span>
        ) : null}
        <bdi>{group.title}</bdi>
        {allSoon ? <SoonTag /> : null}
      </h3>
      <ul aria-labelledby={titleId} className="border-t border-line">
        {group.items.map((i) => (
          <Row
            key={i.id}
            tile={<IntegrationTile integration={i} size="lg" />}
            name={i.name}
            benefit={i.benefit}
            soon={i.status === "soon" && !allSoon}
            status={i.status === "soon" ? "בקרוב" : null}
          />
        ))}
        {group.vendor === "business" ? <RequestRow /> : null}
      </ul>
    </div>
  );
}

function Row({
  tile,
  name,
  benefit,
  soon = false,
  status = null,
}: {
  tile: ReactNode;
  name: string;
  benefit: string;
  /** show the "בקרוב" tag on the row (the business column says it once, in its heading) */
  soon?: boolean;
  /** read to screen readers when the tag is not shown */
  status?: string | null;
}) {
  return (
    <li className="flex items-start gap-4 border-b border-line py-3.5 sm:py-4">
      {tile}
      <div className="min-w-0 pt-px">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[1.0625rem] leading-snug text-cream">
          <bdi>{name}</bdi>
          {soon ? <SoonTag /> : status ? <span className="sr-only">({status})</span> : null}
        </p>
        <p className="mt-1 text-[0.9375rem] leading-snug text-cream-muted">{benefit}</p>
      </div>
    </li>
  );
}

/**
 * "ועוד בהמשך": the last row is the way to ask for a missing system. The whole row is the button (a big target on a
 * phone); its name is the honey "בקשת מערכת", the line under the title describes it.
 */
function RequestRow() {
  const C = SYSTEM_REQUEST_COPY;
  return (
    <li className="border-b border-line">
      <SystemRequest
        labelledBy="connectors-request-name"
        describedBy="connectors-request-lead"
        className="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-4 rounded-2xl px-3 py-3.5 text-start transition-colors hover:bg-cream/[0.04] focus-visible:outline-offset-0 sm:py-4"
      >
        <MoreTile size="lg" />
        <span className="min-w-0 flex-1 pt-px">
          <span aria-hidden="true" className="block text-[1.0625rem] leading-snug text-cream">
            {C.rowTitle}
          </span>
          <span id="connectors-request-lead" className="mt-1 block text-[0.9375rem] leading-snug text-cream-muted">
            {C.rowLead}
          </span>
          <span id="connectors-request-name" className="mt-2.5 inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-honey underline decoration-honey/40 underline-offset-4 group-hover:decoration-honey">
            {C.trigger}
          </span>
        </span>
      </SystemRequest>
    </li>
  );
}
