import type { CSSProperties } from "react";
import type { Integration } from "@/lib/integrations/catalogue";
import { cn } from "@/lib/utils";
import { INTEGRATION_ICONS } from "./icons";
import type { TileTone } from "./soon-tag";

export { SoonTag, type TileTone } from "./soon-tag";

/**
 * A product mark on its white tile - the same white chip the provider logos sit on in the connect step
 * (components/auth/connect-step.tsx), because the owners ask for their marks on white. Decorative (aria-hidden): the
 * caller names the product next to it or in an accessible label.
 * Third-party trademarks, used only to say she "works with" the product (lib/integrations/catalogue.ts).
 */

export type TileSize = "sm" | "md" | "lg";

/** one corner ratio for every size (about 30% of the side, the app-icon tile) */
const SIZES: Record<TileSize, { tile: string; mono: string }> = {
  sm: { tile: "size-8 rounded-[0.5625rem]", mono: "text-[0.9375rem]" },
  md: { tile: "size-9 rounded-[0.6875rem]", mono: "text-[1.0625rem]" },
  lg: { tile: "size-11 rounded-[0.8125rem]", mono: "text-[1.25rem]" },
};

const TONES: Record<TileTone, string> = {
  night: "shadow-[inset_0_-1px_0_rgb(19_36_28/0.1),0_10px_22px_-12px_rgb(0_0_0/0.9)]",
  paper: "shadow-[0_0_0_1px_rgb(19_36_28/0.12),0_6px_14px_-10px_rgb(19_36_28/0.45)]",
};

/**
 * How much of the tile each mark fills, so they read as one optical size: full-bleed squares (Calendar) sit smaller,
 * tall pages (Docs) and Microsoft's padded 48px grid larger. Percent of the tile's side; default 64.
 */
const OPTICAL: Record<string, number> = {
  "google-calendar": 54,
  gmail: 60,
  "google-drive": 60,
  "google-meet": 60,
  "google-docs": 56,
  "google-sheets": 56,
  "google-slides": 56,
  "google-tasks": 64,
  monday: 66,
};

export function IntegrationTile({
  integration,
  size = "md",
  tone = "night",
  className,
}: {
  integration: Pick<Integration, "id" | "monogram" | "name">;
  size?: TileSize;
  tone?: TileTone;
  className?: string;
}) {
  const Icon = INTEGRATION_ICONS[integration.id];
  const side = `${OPTICAL[integration.id] ?? 64}%`;
  const mono = integration.monogram ?? { text: integration.name.slice(0, 1), color: "#13241C" };
  return (
    <span
      aria-hidden="true"
      data-integration-tile={integration.id}
      className={cn(
        "grid flex-none place-items-center bg-white",
        SIZES[size].tile,
        TONES[tone],
        className,
      )}
    >
      {Icon ? (
        <span
          className="grid place-items-center"
          style={{ width: side, height: side } as CSSProperties}
        >
          <Icon className="size-full" />
        </span>
      ) : (
        <span
          className={cn("font-heading leading-none font-bold tracking-[-0.02em]", SIZES[size].mono)}
          style={{ color: mono.color }}
        >
          {mono.text}
        </span>
      )}
    </span>
  );
}

/** The "+ עוד בהמשך" tile: an open, dashed tile in the stage's colours (nothing to show yet). */
export function MoreTile({ size = "lg", className }: { size?: TileSize; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid flex-none place-items-center border border-dashed border-cream-muted/45 text-cream-muted",
        SIZES[size].tile,
        className,
      )}
    >
      <span className="absolute inset-x-[34%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute inset-x-0 inset-y-[34%] mx-auto w-0.5 rounded-full bg-current" />
    </span>
  );
}
