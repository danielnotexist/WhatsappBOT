import type { ComponentType } from "react";
import type { PlanFeatureLine } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { INTEGRATION_ICONS, WhatsAppIcon } from "./integrations/icons";
import { SoonTag, type TileTone } from "./integrations/soon-tag";
import { bareMarkSide } from "./integrations/tile";
import { GoogleLogo, MicrosoftLogo } from "./provider-logo";

/**
 * The product marks a feature line leads with, by line id (lib/billing/plans.ts planFeatures): the products the line is
 * about, in the owners' colours (components/brand/integrations/icons.tsx, provider-logo.tsx). `null`: a line that is
 * not about one product (the agents, the alerts) - it leads with a check in a small circle instead. Every line id of
 * both plans is listed (plan-features.test.tsx), so a new line chooses its picture on purpose.
 */
export const FEATURE_MARKS: Readonly<Record<string, readonly FeatureMarkId[] | null>> = {
  // basic
  account: ["google", "microsoft"],
  mail: ["gmail", "outlook"],
  calendar: ["google-calendar", "outlook"],
  files: ["google-drive", "onedrive"],
  routine: ["whatsapp"],
  agents: null,
  // pro
  accounts: ["google", "microsoft"],
  tasks: ["google-tasks", "todo"],
  drive: ["google-drive"],
  sharepoint: ["sharepoint"],
  file_create: ["google-docs"],
  meetings: ["teams", "google-meet"],
  proactive: null,
  business: ["monday"],
};

/**
 * What a line opens with on the price cards: "check" - a ✓ in a small circle on every line (Daniel, 24.10.2026: the
 * product marks before the words are not pretty; the marks stay in the row at the bottom of each card); "marks" - the
 * products' marks (FEATURE_MARKS), a ✓ where a line is not about one product. Back to the marks: change this one line.
 */
export const FEATURE_LEAD_STYLE: "check" | "marks" = "check";

export type FeatureMarkId = "google" | "microsoft" | "whatsapp" | keyof typeof INTEGRATION_ICONS;

/** the account marks are cropped to the drawing (as the catalogue's Google icons): their optical side, in percent */
const ACCOUNT_MARKS: Record<"google" | "microsoft" | "whatsapp", { Icon: ComponentType<{ className?: string }>; side: number }> = {
  google: { Icon: GoogleLogo, side: 80 },
  microsoft: { Icon: MicrosoftLogo, side: 76 },
  whatsapp: { Icon: WhatsAppIcon, side: 90 },
};

function FeatureMark({ id }: { id: FeatureMarkId }) {
  const account = ACCOUNT_MARKS[id as keyof typeof ACCOUNT_MARKS];
  const Icon = account?.Icon ?? INTEGRATION_ICONS[id];
  if (!Icon) return null;
  const side = `${account?.side ?? bareMarkSide(id)}%`;
  return (
    <span data-feature-mark={id} className="grid size-5 flex-none place-items-center">
      <span className="grid place-items-center" style={{ width: side, height: side }}>
        <Icon className="size-full" />
      </span>
    </span>
  );
}

/**
 * Where the list stands: "moss" on the cream paper (a moss circle with an ink check), "ink" on the honey pro card (an
 * ink circle with a honey check, as in the brand film's pro card). lib/design/tokens.ts checks both pairs.
 */
export type FeatureLead = "moss" | "ink";

function Check({ lead }: { lead: FeatureLead }) {
  return (
    <span data-feature-check="" className={cn("grid size-5 flex-none place-items-center rounded-full", lead === "ink" ? "bg-ink text-honey" : "bg-moss text-ink")}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-3.5 fill-none stroke-current stroke-[3]">
        <path d="M5.5 12.5l4.2 4.2L18.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * A plan's features as ruled rows (the landing's price list, the pay page's plan papers, the upgrade offer, and on the
 * night stage the personal area's "מנוי"): the lines come from lib/billing/plans.ts (planFeatures), and a line that is
 * included once it ships carries "בקרוב". With `lead`, every line opens with a picture (decorative - the words say it):
 * a check in a small circle, or under `leadStyle` "marks" the marks of the products it is about (FEATURE_MARKS).
 */
export function PlanFeatureList({
  lines,
  tone = "paper",
  rule = tone === "paper" ? "border-ink/15" : "border-line",
  lead,
  leadStyle = FEATURE_LEAD_STYLE,
  className,
  itemClassName,
}: {
  lines: readonly PlanFeatureLine[];
  tone?: TileTone;
  rule?: string;
  lead?: FeatureLead;
  leadStyle?: "check" | "marks";
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ul data-plan-features="" className={cn("border-t", rule, className)}>
      {lines.map((l) => {
        const marks = leadStyle === "marks" ? FEATURE_MARKS[l.id] : null;
        return (
          <li
            key={l.id}
            data-soon={l.soon ? "" : undefined}
            className={cn("flex justify-between gap-3 border-b py-3.5 leading-snug", lead ? "items-center" : "items-baseline", rule, itemClassName)}
          >
            {lead ? (
              <span aria-hidden="true" data-feature-lead={marks ? "marks" : "check"} className={cn("flex flex-none items-center gap-1", leadStyle === "marks" && "w-11")}>
                {marks ? marks.map((m) => <FeatureMark key={m} id={m} />) : <Check lead={lead} />}
              </span>
            ) : null}
            <span className={cn(lead && "min-w-0 flex-1", l.soon && (tone === "paper" ? "text-ink-muted" : "text-cream-muted"))}>{l.text}</span>
            {l.soon ? <SoonTag tone={tone} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
