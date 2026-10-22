/**
 * Site typography rules for text (Daniel, 22.10.2026): the site uses the short hyphen "-" as its only dash — no em
 * dash "—" and no en dash "–" in anything a visitor reads. The WhatsApp copy (lib/copy/bot*.ts) is not site text.
 * Text written by hand in app/ and components/ is kept clean by lib/design/dashes.test.tsx; text that comes from
 * documents (the legal drafts in docs/legal) passes through `siteDashes` when it is rendered.
 */
export function siteDashes(text: string): string {
  return text.replace(/[–—]/g, "-");
}
