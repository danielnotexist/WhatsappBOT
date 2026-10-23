import { tileSrc } from "@/lib/integrations/tiles";
import type { ServiceId } from "./services";

/**
 * How the "חיבורים" icon row draws a service (components/brand/service-row.tsx). A trial from Daniel (23.10): "tiles" —
 * the illustrated product tiles of the dark set (public/brand/integrations/night/*.webp); "glyphs" — our own solid
 * glyphs (components/brand/service-icons.tsx), kept so one change here switches back. The status styling (opacity, the
 * honey dot and ring, the dashed edge), the names and the tooltips are the same in both.
 */
export const SERVICE_ICON_STYLE: "tiles" | "glyphs" = "tiles";

/** The dark-set tile of each service (public/brand/integrations/night/<file>.webp). */
export const SERVICE_TILE: Record<ServiceId, string> = {
  gmail: "gmail",
  google_calendar: "google-calendar",
  google_tasks: "google-tasks",
  google_drive: "google-drive",
  google_docs: "google-docs",
  google_sheets: "google-sheets",
  google_slides: "google-slides",
  outlook: "outlook",
  outlook_calendar: "ms-calendar",
  onedrive: "onedrive",
  sharepoint: "sharepoint",
  microsoft_todo: "todo",
  office_files: "word",
};

export function serviceTileSrc(id: ServiceId): string {
  return tileSrc(SERVICE_TILE[id], "night");
}
