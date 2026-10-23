/**
 * How the systems she works with are drawn (lib/integrations/catalogue.ts) - the one switch and the one map.
 *
 * "marks" (Daniel, 23.10.2026, round 3): the owners' official product marks in their own colours, drawn in code
 * (components/brand/integrations/icons.tsx) straight on the surface - no chip, no tile behind them - on the night stage
 * and on the cream price sheet alike. A system without a clean mark (Priority, מורנינג, iCount) gets a monogram plate in
 * its brand colour, drawn at the same size and weight.
 * "tiles": our own illustrated icon tiles (Nano Banana), in two sets that carry their own rounded square - `night` for
 * the dark stage and `paper` for the cream price sheet (public/brand/integrations/<set>/). Kept, with the map below, so
 * one change here switches every place back.
 * "svg": the same product marks on a white chip (the earlier trial).
 * The names, tooltips and accessible labels are the same in all three.
 *
 * The services row in /account has its own switch over the same marks and files (lib/connections/service-tiles.ts).
 */
export type MarkStyle = "marks" | "tiles" | "svg";
export const INTEGRATION_MARK_STYLE: MarkStyle = "marks";

/** the surface a tile stands on: the night stage or the paper price sheet (public/brand/integrations/<set>/) */
export type TileSet = "night" | "paper";

/** Catalogue id → tile file (public/brand/integrations/<set>/<file>.webp). Every catalogue system has one. */
export const INTEGRATION_TILE: Readonly<Record<string, string>> = {
  gmail: "gmail",
  "google-calendar": "google-calendar",
  "google-drive": "google-drive",
  "google-docs": "google-docs",
  "google-sheets": "google-sheets",
  "google-slides": "google-slides",
  "google-meet": "google-meet",
  "google-tasks": "google-tasks",
  outlook: "outlook",
  onedrive: "onedrive",
  word: "word",
  excel: "excel",
  powerpoint: "powerpoint",
  sharepoint: "sharepoint",
  teams: "teams",
  todo: "todo",
  monday: "monday",
  priority: "priority",
  morning: "morning",
  icount: "icount",
};

/** the "ועוד בהמשך" tile (the request for a missing system) */
export const MORE_TILE = "more";

/** A tile's address in a set. */
export function tileSrc(file: string, set: TileSet = "night"): string {
  return `/brand/integrations/${set}/${file}.webp`;
}

/** A catalogue system's tile, or null when it has none (the tile then falls back to the drawn mark or monogram). */
export function integrationTileSrc(id: string, set: TileSet = "night"): string | null {
  const file = INTEGRATION_TILE[id];
  return file ? tileSrc(file, set) : null;
}
