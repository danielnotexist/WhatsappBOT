import { ViewTransition, type ReactNode } from "react";

/**
 * The page transition (Daniel, 28.10.2026): moving between pages, the wordmark stays exactly where it is
 * (`view-transition-name: alze-wordmark` on the header's Wordmark, held still in app/globals.css) while the page under
 * it changes — the old page fades and drifts a few pixels toward the reading end, the new one fades in and rises into
 * place, ~360ms, ease-out. `nav-back` (the wordmark's link home) drifts the other way.
 *
 * React's <ViewTransition> (the View Transitions API under Next's navigations): it animates only when this boundary
 * enters or leaves — when its page (or the layout it tops) mounts or is hidden. Inside one layout (the signup steps)
 * nothing here runs; the step card's own morph does the work. `default="none"`: updates, Suspense
 * reveals, a tab inside the same page — no transition.
 * Off for reduced motion (the device's setting, or the site's "עצירת אנימציות"), and where the browser has no View
 * Transitions the navigation is simply instant. Nothing here waits or delays the navigation.
 */
export const PAGE_ENTER = { "nav-back": "page-in-back", default: "page-in" } as const;
export const PAGE_EXIT = { "nav-back": "page-out-back", default: "page-out" } as const;

/**
 * Wrap the page's OUTERMOST element — the boundary must come before any DOM node of the route (React runs enter / exit
 * only for a <ViewTransition> at the top of the inserted or removed tree; inside a <div> it never fires). One element
 * inside it = one snapshot (React names each direct DOM child). The wordmark inside keeps its own name, so it is cut
 * out of this snapshot and stays still while the rest of the page moves.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={PAGE_ENTER} exit={PAGE_EXIT} default="none">
      {children}
    </ViewTransition>
  );
}

/** The wordmark's transition name (app/globals.css holds this group still). */
export const WORDMARK_TRANSITION_NAME = "alze-wordmark";
