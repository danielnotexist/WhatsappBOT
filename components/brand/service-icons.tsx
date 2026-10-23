import type { ServiceIcon } from "@/lib/connections/services";
import { cn } from "@/lib/utils";

/**
 * Our own solid glyphs for the services behind a connection (the "חיבורים" icon row) — not the vendors' logos: one
 * 24px grid, filled shapes in the current colour, details knocked out (even-odd), 2px corner radii, the same 2.5px
 * inner margin. Drawn for "לילה ירוק": they sit as night-coloured marks on solid sage tiles (connected) or as muted
 * marks on a dark tile. Decorative: the button around each one carries the name ("Gmail - מחובר").
 */
const PATHS: Record<ServiceIcon, { d: string; extra?: string }> = {
  // an envelope, the flap's V knocked out
  mail: { d: "M5 4.5h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Zm-.4 3.1-.9 1.3 8.3 5.6 8.3-5.6-.9-1.3-7.4 5Z" },
  // a calendar page: two rings on top, the header line and five day cells knocked out
  calendar: {
    d: "M6 4.5h12a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3ZM3 8.6v1.5h18V8.6ZM6.6 12.2v2.2h2.2v-2.2Zm4.3 0v2.2h2.2v-2.2Zm4.3 0v2.2h2.2v-2.2ZM6.6 16v2.2h2.2V16Zm4.3 0v2.2h2.2V16Z",
    extra: "M7 2.2a1.1 1.1 0 0 1 2.2 0v3.6a1.1 1.1 0 0 1-2.2 0Zm7.8 0a1.1 1.1 0 0 1 2.2 0v3.6a1.1 1.1 0 0 1-2.2 0Z",
  },
  // a round check: a task done
  tasks: { d: "M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm4.1 5.6-5.7 5.7-2.5-2.5-1.5 1.5 4 4 7.2-7.2Z" },
  // a folder, the back flap separated by a knocked-out line
  folder: { d: "M5 4.5h4.4a2 2 0 0 1 1.5.7L12.4 7H19a2 2 0 0 1 2 2v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18V6.5a2 2 0 0 1 2-2Zm-2 5.2v1.4h18V9.7Z" },
  // a page with a folded corner and three text lines knocked out
  doc: {
    d: "M6.5 2.5H13V7a2 2 0 0 0 2 2h5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5ZM7.5 11.4v1.6h9v-1.6Zm0 3.3v1.6h9v-1.6Zm0 3.3v1.6h5.6V18Z",
    extra: "M14.6 2.6 19.9 7.9h-4.3a1 1 0 0 1-1-1Z",
  },
  // the same page with a 2×2 table knocked out
  sheet: {
    d: "M6.5 2.5H13V7a2 2 0 0 0 2 2h5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5ZM7.3 11v3.1h4v-3.1Zm5.4 0v3.1h4v-3.1Zm-5.4 4.5v3.1h4v-3.1Zm5.4 0v3.1h4v-3.1Z",
    extra: "M14.6 2.6 19.9 7.9h-4.3a1 1 0 0 1-1-1Z",
  },
  // the same page with a framed slide
  slides: {
    d: "M6.5 2.5H13V7a2 2 0 0 0 2 2h5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5ZM7.2 11v7.4h9.6V11Zm1.6 1.6h6.4v4.2H8.8Z",
    extra: "M14.6 2.6 19.9 7.9h-4.3a1 1 0 0 1-1-1Z",
  },
  // a cloud
  cloud: { d: "M6.6 19.5a4.6 4.6 0 0 1-.9-9.1A6.4 6.4 0 0 1 17.9 9a5.3 5.3 0 0 1-.3 10.5Z" },
  // stacked layers: sites and their libraries
  sites: { d: "M12 2.6 21.4 7.7 12 12.8 2.6 7.7Zm-7.7 8.5L12 15.3l7.7-4.2 1.7.9-9.4 5.1L2.6 12Zm0 4.3L12 19.6l7.7-4.2 1.7.9-9.4 5.1-9.4-5.1Z" },
  // two pages, the back one stepping out of the way of the front one
  files: {
    d: "M10.5 7h6l3.5 3.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 19V9.5A2.5 2.5 0 0 1 10.5 7Zm.3 6v1.5h6.4V13Zm0 3v1.5h6.4V16Z",
    extra: "M6.5 2.5h6A2.5 2.5 0 0 1 15 5v.5H9.8A3.3 3.3 0 0 0 6.5 8.8V17A2.5 2.5 0 0 1 4 14.5V5a2.5 2.5 0 0 1 2.5-2.5Z",
  },
};

export function ServiceGlyph({ icon, className }: { icon: ServiceIcon; className?: string }) {
  const p = PATHS[icon];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("block fill-current", className)} data-icon={icon}>
      <path fillRule="evenodd" clipRule="evenodd" d={p.d} />
      {p.extra ? <path d={p.extra} /> : null}
    </svg>
  );
}
