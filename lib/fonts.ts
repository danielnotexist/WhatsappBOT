import { Assistant, Frank_Ruhl_Libre, Gveret_Levin } from "next/font/google";

/**
 * Fonts for "לילה ירוק" (round plan §2). next/font downloads the files at build time and serves them from our
 * domain (self-host): no request to Google, no layout shift, hebrew + latin subsets only.
 *
 *  - Frank Ruhl Libre 300 / 700 — headlines. The light word of a headline is set in 300 + honey (`.headline-light`):
 *    Hebrew has no true italic, so weight contrast does that job.
 *  - Gveret Levin 400 — one handwritten line above a headline ("קודם כל", "דבר אחרון", "נכנסת."). Verified in
 *    next/font's Google font list (weights: 400; subsets: hebrew, latin).
 *  - Assistant (variable 200–800) — body, buttons, forms. Digits of codes and timers use `tabular-nums`.
 *
 * The CSS variables (--font-heading / --font-hand / --font-body) are mapped to Tailwind's font-heading /
 * font-hand / font-sans in app/globals.css.
 */

export const headingFont = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["300", "700"],
  variable: "--font-heading",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const handFont = Gveret_Levin({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-hand",
  display: "swap",
  fallback: ["Segoe Print", "cursive"],
});

export const bodyFont = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

/** For <html className> — defines the CSS variables for the whole tree. */
export const fontVariables = `${headingFont.variable} ${handFont.variable} ${bodyFont.variable}`;

/** The active families (for docs / design pages). */
export const activeFonts = {
  heading: "Frank Ruhl Libre",
  hand: "Gveret Levin",
  body: "Assistant",
} as const;
