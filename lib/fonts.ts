import { Varela_Round } from "next/font/google";

/**
 * One family for the whole site: Varela Round (Daniel's choice, 21.10). next/font downloads the file at build time
 * and serves it from our domain (self-host): no request to Google, no layout shift, hebrew + latin subsets only.
 *
 * Varela Round ships a single weight (400). Headings, the handwritten tag lines and the body all use it; hierarchy
 * comes from size and colour, and faux bold is switched off in app/globals.css (`font-synthesis-weight: none`).
 * The light word of a headline keeps the honey colour (`.headline-light`).
 *
 * The CSS variable (--font-body) feeds Tailwind's font-sans / font-heading / font-hand in app/globals.css.
 */
export const bodyFont = Varela_Round({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-body",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

/** For <html className> — defines the CSS variable for the whole tree. */
export const fontVariables = bodyFont.variable;

/** The active families (for docs / design pages). */
export const activeFonts = {
  heading: "Varela Round",
  hand: "Varela Round",
  body: "Varela Round",
} as const;
