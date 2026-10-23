import { tileSrc } from "@/lib/integrations/tiles";
import type { ServiceId } from "./services";

/**
 * How the "חיבורים" icon row draws a service (components/brand/service-row.tsx). Daniel (23.10, round 3): "marks" -
 * the owners' official product marks in colour, straight on the night surface (components/brand/integrations/icons.tsx,
 * through SERVICE_MARK). Kept so one change here switches back: "tiles" - the illustrated product tiles of the dark set
 * (public/brand/integrations/night/*.webp); "glyphs" - our own solid glyphs (components/brand/service-icons.tsx). The
 * status styling (opacity, the honey dot and ring, the dashed edge), the names and the tooltips are the same in all.
 */
export const SERVICE_ICON_STYLE: "marks" | "tiles" | "glyphs" = "marks";

/**
 * The product mark of each service: a catalogue id (lib/integrations/catalogue.ts, a key of INTEGRATION_ICONS).
 * Outlook's calendar lives inside Outlook, so it carries Outlook's mark; the Office files carry Word's.
 */
export const SERVICE_MARK: Record<ServiceId, string> = {
  gmail: "gmail",
  google_calendar: "google-calendar",
  google_tasks: "google-tasks",
  google_drive: "google-drive",
  google_docs: "google-docs",
  google_sheets: "google-sheets",
  google_slides: "google-slides",
  outlook: "outlook",
  outlook_calendar: "outlook",
  onedrive: "onedrive",
  sharepoint: "sharepoint",
  microsoft_todo: "todo",
  office_files: "word",
};

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
