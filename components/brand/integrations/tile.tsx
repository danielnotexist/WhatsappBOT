import Image from "next/image";
import type { CSSProperties } from "react";
import type { Integration } from "@/lib/integrations/catalogue";
import { INTEGRATION_MARK_STYLE, MORE_TILE, integrationTileSrc, tileSrc } from "@/lib/integrations/tiles";
import { cn } from "@/lib/utils";
import { INTEGRATION_ICONS } from "./icons";
import type { TileTone } from "./soon-tag";

export { SoonTag, type TileTone } from "./soon-tag";

/**
 * A system's tile. Two styles behind one switch (lib/integrations/tiles.ts INTEGRATION_MARK_STYLE):
 *  - "tiles": our own illustrated icon tile from the set of the surface it stands on (night / paper). The picture
 *    carries its own rounded square, so nothing is drawn around it - no white chip.
 *  - "svg": the owner's product mark on a white tile - the same white chip the provider logos sit on in the connect
 *    step (components/auth/connect-step.tsx), because the owners ask for their marks on white.
 * Decorative (aria-hidden): the caller names the product next to it or in an accessible label.
 * Third-party trademarks, used only to say she "works with" the product (lib/integrations/catalogue.ts).
 */

export type TileSize = "xs" | "sm" | "md" | "lg";
export type MarkStyle = "tiles" | "svg";

/** one corner ratio for every size (about 30% of the side, the app-icon tile) */
const SIZES: Record<TileSize, { box: string; round: string; mono: string; px: number }> = {
  xs: { box: "size-7", round: "rounded-[0.5rem]", mono: "text-[0.8125rem]", px: 28 },
  sm: { box: "size-8", round: "rounded-[0.5625rem]", mono: "text-[0.9375rem]", px: 32 },
  md: { box: "size-9", round: "rounded-[0.6875rem]", mono: "text-[1.0625rem]", px: 36 },
  lg: { box: "size-11", round: "rounded-[0.8125rem]", mono: "text-[1.25rem]", px: 44 },
};

const TONES: Record<TileTone, string> = {
  night: "shadow-[inset_0_-1px_0_rgb(19_36_28/0.1),0_10px_22px_-12px_rgb(0_0_0/0.9)]",
  paper: "shadow-[0_0_0_1px_rgb(19_36_28/0.12),0_6px_14px_-10px_rgb(19_36_28/0.45)]",
};

/**
 * The illustrated tiles: the picture's own square is a little less round than our chips, with a hairline rim about
 * 1.5% in from its edge, so it is scaled up a touch and clipped at the rim's radius (the corners outside the rim are
 * the generator's background, not the page's). A soft drop on the night stage, a fainter one on paper.
 */
const PICTURE_TONES: Record<TileTone, string> = {
  night: "shadow-[0_10px_22px_-14px_rgb(0_0_0/0.95)]",
  paper: "shadow-[0_6px_14px_-12px_rgb(19_36_28/0.5)]",
};

function TilePicture({ src, size, tone, id, className }: { src: string; size: TileSize; tone: TileTone; id?: string; className?: string }) {
  const { box, px } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      data-integration-tile={id}
      data-mark="tile"
      className={cn("relative block flex-none overflow-hidden rounded-[19%]", box, PICTURE_TONES[tone], className)}
    >
      <Image src={src} alt="" width={px} height={px} sizes={`${px}px`} draggable={false} className="block size-full scale-[1.035] select-none" />
    </span>
  );
}

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
  mark = INTEGRATION_MARK_STYLE,
  className,
}: {
  integration: Pick<Integration, "id" | "monogram" | "name">;
  size?: TileSize;
  tone?: TileTone;
  /** the drawing style; the default is the site-wide switch */
  mark?: MarkStyle;
  className?: string;
}) {
  const picture = mark === "tiles" ? integrationTileSrc(integration.id, tone) : null;
  if (picture) return <TilePicture src={picture} size={size} tone={tone} id={integration.id} className={className} />;

  const Icon = INTEGRATION_ICONS[integration.id];
  const side = `${OPTICAL[integration.id] ?? 64}%`;
  const mono = integration.monogram ?? { text: integration.name.slice(0, 1), color: "#13241C" };
  return (
    <span
      aria-hidden="true"
      data-integration-tile={integration.id}
      data-mark="svg"
      className={cn("grid flex-none place-items-center bg-white", SIZES[size].box, SIZES[size].round, TONES[tone], className)}
    >
      {Icon ? (
        <span className="grid place-items-center" style={{ width: side, height: side } as CSSProperties}>
          <Icon className="size-full" />
        </span>
      ) : (
        <span className={cn("font-heading leading-none font-bold tracking-[-0.02em]", SIZES[size].mono)} style={{ color: mono.color }}>
          {mono.text}
        </span>
      )}
    </span>
  );
}

/**
 * The "ועוד בהמשך" tile: with the illustrated set, its own "more" picture; otherwise an open, dashed tile in the stage's
 * colours (nothing to show yet).
 */
export function MoreTile({
  size = "lg",
  tone = "night",
  mark = INTEGRATION_MARK_STYLE,
  className,
}: {
  size?: TileSize;
  tone?: TileTone;
  mark?: MarkStyle;
  className?: string;
}) {
  if (mark === "tiles") return <TilePicture src={tileSrc(MORE_TILE, tone)} size={size} tone={tone} className={className} />;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid flex-none place-items-center border border-dashed border-cream-muted/45 text-cream-muted",
        SIZES[size].box,
        SIZES[size].round,
        className,
      )}
    >
      <span className="absolute inset-x-[34%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute inset-x-0 inset-y-[34%] mx-auto w-0.5 rounded-full bg-current" />
    </span>
  );
}
