/**
 * The brand — the single place for the product name and its public identifiers (round plan §1).
 * Client-safe: constants only, no env reads (the WhatsApp number comes from `WA_PUBLIC_NUMBER`, see lib/wa/public-number.ts).
 *
 * Name: "עלזה" — a play on "עליזה" (cheerful) and "על זה" ("on it"). Chosen by Daniel, 21.10.2026 (docs/naming.md).
 */
export const BRAND = {
  /** Hebrew name, used everywhere in copy. Feminine: the assistant speaks about herself in the feminine. */
  name: "עלזה",
  /** Latin spelling for URLs, email sender names and places where Hebrew cannot appear. */
  latin: "Alze",
  /** One line under the logo / in metadata. */
  tagline: "העוזרת האישית שלך, בוואטסאפ.",
  /** Short description for metadata and link previews. */
  description: "עוזרת אישית בוואטסאפ שמטפלת במייל, ביומן ובקבצים של העסק שלך - בעברית, עם חיבור ל-Microsoft 365 ול-Google.",
  /** Placeholder until the domain is purchased ("probably free" by DNS — verify with the registrar). */
  domain: "alze.ai",
} as const;

/** Kept as a named export for modules that only need the name. */
export const PRODUCT_NAME = BRAND.name;
