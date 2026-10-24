/**
 * "לילה ירוק" — the design tokens (round plan §2). The CSS custom properties in app/globals.css must match
 * these values; lib/design/tokens.test.ts checks both the match and the WCAG contrast of every pair below.
 *
 * Design plan (frontend-design skill, first pass):
 *  - Colour: a bottle-green night (not black) with cream type; honey is the one warm accent (CTAs, the light word
 *    of a headline); sage/mint is the quiet secondary (handwritten tags, ticks). Signup steps are one card that
 *    changes paper: cream paper → dusty pink → sage → back to night for the confetti moment.
 *  - Type: Varela Round (one weight) everywhere — headlines, tag lines and body; the key word of a headline in
 *    honey; tabular digits.
 *  - Layout: one centred card on a dark stage (full-screen on phones); intro and "ready" pair type with a phone.
 *  - Principles: one memorable thing per screen, no gradients-as-decoration, no icon-card grids, motion only to
 *    show what changed (the card morph) plus one entrance moment; reduced motion = no motion.
 */

export const palette = {
  /** page background — deep bottle green */
  night: "#0F1C17",
  /** raised surface on the night background (cards on dark, phone chrome) */
  night2: "#16261F",
  /** hairlines on dark */
  line: "#26382F",
  /** primary text on dark */
  cream: "#EFE9DC",
  /** secondary text on dark */
  creamMuted: "#A3AE9F",
  /** the accent: CTAs, the light word in headlines, focus ring on dark */
  honey: "#E7B65C",
  /** secondary accent on dark: handwritten tags, ticks */
  sage: "#9CC9A8",
  /** text on light surfaces */
  ink: "#13241C",
  /** secondary text / input borders on light surfaces */
  inkMuted: "#2E3D35",
  /** step cards */
  paper: "#F2EADA",
  dust: "#D8A99C",
  moss: "#9DB8A0",
  /** errors */
  errorOnDark: "#F2A08B",
  errorOnLight: "#7A2414",
} as const;

export type PaletteName = keyof typeof palette;

/** WhatsApp (dark) colours inside the phone mockups — `--wa-*` in app/globals.css. */
export const waMockup = {
  bg: "#0B141A",
  in: "#202C33",
  out: "#005C4B",
  fg: "#E9EDEF",
  head: "#1F2C34",
  link: "#53BDEB",
  time: "#8696A0",
  chip: "#182229",
  metaIn: "#8696A0",
  metaOut: "#BFD6CF",
} as const;

/** The card colour per signup step (round plan §2/§3). */
export const cardTones = {
  email: { bg: palette.paper, fg: palette.ink, muted: palette.inkMuted, light: true },
  code: { bg: palette.dust, fg: palette.ink, muted: palette.inkMuted, light: true },
  connect: { bg: palette.moss, fg: palette.ink, muted: palette.inkMuted, light: true },
  ready: { bg: palette.night2, fg: palette.cream, muted: palette.creamMuted, light: false },
  night: { bg: palette.night2, fg: palette.cream, muted: palette.creamMuted, light: false },
} as const;

export type CardTone = keyof typeof cardTones;

/** CSS custom property name for each palette entry (kebab-case, prefixed). */
export function cssVar(name: PaletteName): string {
  return `--alze-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every text/background (and UI-component) pair the design uses. min = 4.5 for body text, 3 for large text
 * (≥ 24px, or ≥ 18.66px bold) and for non-text UI such as input borders and focus rings (WCAG 1.4.3 / 1.4.11).
 */
export const contrastPairs: { label: string; fg: string; bg: string; min: number }[] = [
  // dark stage
  { label: "body on night", fg: palette.cream, bg: palette.night, min: 4.5 },
  { label: "muted on night", fg: palette.creamMuted, bg: palette.night, min: 4.5 },
  { label: "honey word on night", fg: palette.honey, bg: palette.night, min: 4.5 },
  { label: "sage tag on night", fg: palette.sage, bg: palette.night, min: 4.5 },
  { label: "body on night2", fg: palette.cream, bg: palette.night2, min: 4.5 },
  { label: "muted on night2", fg: palette.creamMuted, bg: palette.night2, min: 4.5 },
  { label: "honey on night2", fg: palette.honey, bg: palette.night2, min: 4.5 },
  { label: "sage on night2", fg: palette.sage, bg: palette.night2, min: 4.5 },
  { label: "honey CTA label", fg: palette.night, bg: palette.honey, min: 4.5 },
  { label: "error on night", fg: palette.errorOnDark, bg: palette.night, min: 4.5 },
  { label: "error on night2", fg: palette.errorOnDark, bg: palette.night2, min: 4.5 },
  { label: "focus ring (honey) on night", fg: palette.honey, bg: palette.night, min: 3 },
  { label: "input border on night2", fg: palette.creamMuted, bg: palette.night2, min: 3 },
  // light cards
  ...(["paper", "dust", "moss"] as const).flatMap((tone) => [
    { label: `ink on ${tone}`, fg: palette.ink, bg: palette[tone], min: 4.5 },
    { label: `ink muted on ${tone}`, fg: palette.inkMuted, bg: palette[tone], min: 4.5 },
    { label: `error on ${tone}`, fg: palette.errorOnLight, bg: palette[tone], min: 4.5 },
    { label: `input border / focus ring on ${tone}`, fg: palette.inkMuted, bg: palette[tone], min: 3 },
    { label: `ink CTA label on ${tone}`, fg: palette.cream, bg: palette.ink, min: 4.5 },
  ]),
  // the pro plan card on /pay (a honey paper)
  { label: "ink on honey (pro plan card)", fg: palette.ink, bg: palette.honey, min: 4.5 },
  { label: "ink muted on honey (pro plan card)", fg: palette.inkMuted, bg: palette.honey, min: 4.5 },
  { label: "focus ring / outline on honey", fg: palette.inkMuted, bg: palette.honey, min: 3 },
  // the price cards' feature checks (components/brand/plan-features.tsx): an ink circle with a honey check on the honey
  // pro card, a moss circle with an ink check on the cream paper (non-text graphics, 3:1; the check is what carries it)
  { label: "ink check circle on honey (pro card)", fg: palette.ink, bg: palette.honey, min: 3 },
  { label: "honey check in the ink circle", fg: palette.honey, bg: palette.ink, min: 3 },
  { label: "ink check in the moss circle (paper card)", fg: palette.ink, bg: palette.moss, min: 3 },
  { label: "ink check against the paper around its circle", fg: palette.ink, bg: palette.paper, min: 3 },
  // WhatsApp mockups (bubbles, timestamps, buttons)
  { label: "wa text on incoming", fg: waMockup.fg, bg: waMockup.in, min: 4.5 },
  { label: "wa text on outgoing", fg: waMockup.fg, bg: waMockup.out, min: 4.5 },
  { label: "wa time on incoming", fg: waMockup.metaIn, bg: waMockup.in, min: 4.5 },
  { label: "wa time on outgoing", fg: waMockup.metaOut, bg: waMockup.out, min: 4.5 },
  { label: "wa button label", fg: waMockup.link, bg: waMockup.in, min: 4.5 },
  { label: "wa chip / status", fg: waMockup.time, bg: waMockup.chip, min: 4.5 },
  { label: "wa header status", fg: waMockup.time, bg: waMockup.head, min: 4.5 },
  // the light transition screen (/connect/[provider])
  { label: "ink on cream", fg: palette.ink, bg: palette.cream, min: 4.5 },
  { label: "ink muted on cream", fg: palette.inkMuted, bg: palette.cream, min: 4.5 },
];
