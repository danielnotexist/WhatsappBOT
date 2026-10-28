/** Shared class strings for the landing sections, so the type scale and the grid stay one system. */

import { FRAME } from "@/components/brand/frame";

/** the page grid: 84rem wide, 16px gutter on phones (WCAG reflow at 320px), 48px on desktops */
export const CONTAINER = FRAME;

/** section headline: Varela Round, 36 → 72px */
export const H2 =
  "text-[clamp(2.25rem,1.35rem+3.6vw,4.5rem)] leading-[1.03] font-bold tracking-[-0.012em]";

/** the paragraph under a section headline */
export const LEDE = "text-lede text-cream-muted";
