import Image from "next/image";
import type { CSSProperties } from "react";
import type { Integration } from "@/lib/integrations/catalogue";
import { INTEGRATION_MARK_STYLE, MORE_TILE, integrationTileSrc, tileSrc, type MarkStyle } from "@/lib/integrations/tiles";
import { cn } from "@/lib/utils";
import { INTEGRATION_ICONS, MonogramMark } from "./icons";
import type { TileTone } from "./soon-tag";

export { SoonTag, type TileTone } from "./soon-tag";
export type { MarkStyle } from "@/lib/integrations/tiles";

/**
 * A system's tile. Three styles behind one switch (lib/integrations/tiles.ts INTEGRATION_MARK_STYLE):
 *  - "marks": the owner's official product mark in its own colours, straight on the surface - nothing behind it.
 *    Priority, מורנינג and iCount: our monogram plate in their brand colour (icons.tsx MonogramMark).
 *  - "tiles": our own illustrated icon tile from the set of the surface it stands on (night / paper). The picture
 *    carries its own rounded square.
 *  - "svg": the owner's product mark on a white chip.
 * Decorative (aria-hidden): the caller names the product next to it or in an accessible label.
 * Third-party trademarks, used only to say she "works with" the product (lib/integrations/catalogue.ts).
 */

export type TileSize = "xs" | "sm" | "md" | "lg" | "xl";

/** one corner ratio for every size (about 30% of the side, the app-icon tile) */
const SIZES: Record<TileSize, { box: string; round: string; mono: string; px: number }> = {
  xs: { box: "size-7", round: "rounded-[0.5rem]", mono: "text-[0.8125rem]", px: 28 },
  sm: { box: "size-8", round: "rounded-[0.5625rem]", mono: "text-[0.9375rem]", px: 32 },
  md: { box: "size-9", round: "rounded-[0.6875rem]", mono: "text-[1.0625rem]", px: 36 },
  lg: { box: "size-11", round: "rounded-[0.8125rem]", mono: "text-[1.25rem]", px: 44 },
  xl: { box: "size-12", round: "rounded-[0.875rem]", mono: "text-[1.375rem]", px: 48 },
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
 * On a white chip: how much of the tile each mark fills, so they read as one optical size - full-bleed squares
 * (Calendar) smaller, tall pages (Docs) and Microsoft's padded 48px grid larger. Percent of the tile's side; default 64.
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

/**
 * Bare on the surface: the side of the square each mark is fitted into, in percent of the tile, so every mark covers
 * about the same area. The viewBoxes differ - Google's are cropped to the drawing, Microsoft's 48px grid keeps about 4px
 * of air around it, the pages are tall and Gmail, Meet and monday.com wide - and a full square (Calendar, the
 * monograms) looks larger than an open shape of the same width. Default 88.
 */
const BARE: Record<string, number> = {
  gmail: 84,
  "google-calendar": 72,
  "google-drive": 84,
  "google-docs": 80,
  "google-sheets": 80,
  "google-slides": 80,
  "google-meet": 84,
  "google-tasks": 90,
  outlook: 92,
  onedrive: 100,
  word: 92,
  excel: 92,
  powerpoint: 92,
  sharepoint: 92,
  teams: 94,
  todo: 96,
  monday: 88,
  // the monogram plates (a full rounded square, like Calendar)
  priority: 82,
  morning: 82,
  icount: 82,
};

/** The size a mark is drawn at when it stands bare (percent of its tile's side). */
export function bareMarkSide(id: string): number {
  return BARE[id] ?? 88;
}

/**
 * A mark alone - the product's own mark, or the monogram of a system without one - fitted to its optical size inside a
 * square that fills its parent. For callers that draw their own box (the services row in /account).
 */
export function BareMark({ integration, className }: { integration: Pick<Integration, "id" | "monogram" | "name">; className?: string }) {
  const Icon = INTEGRATION_ICONS[integration.id];
  const side = `${bareMarkSide(integration.id)}%`;
  const mono = integration.monogram ?? { text: integration.name.slice(0, 1), color: "#3B4A42" };
  return (
    <span data-glyph className={cn("grid place-items-center", className)} style={{ width: side, height: side } as CSSProperties}>
      {Icon ? <Icon className="size-full" /> : <MonogramMark text={mono.text} color={mono.color} className="size-full" />}
    </span>
  );
}

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

  if (mark === "marks")
    return (
      <span
        aria-hidden="true"
        data-integration-tile={integration.id}
        data-mark="bare"
        className={cn("grid flex-none place-items-center", SIZES[size].box, className)}
      >
        <BareMark integration={integration} />
      </span>
    );

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
 * The "ועוד בהמשך" tile: with the illustrated set, its own "more" picture; otherwise an open, dashed square in the
 * stage's colours with a plus (nothing to show yet).
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
      data-mark="more"
      className={cn(
        "relative grid flex-none place-items-center border-[1.5px] border-dashed",
        tone === "night" ? "border-cream-muted/45 text-cream-muted" : "border-ink/30 text-ink-muted",
        SIZES[size].box,
        SIZES[size].round,
        className,
      )}
    >
      <span className="absolute inset-x-[32%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute inset-x-0 inset-y-[32%] mx-auto w-0.5 rounded-full bg-current" />
    </span>
  );
}
