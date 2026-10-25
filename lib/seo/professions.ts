/**
 * The "לפי מקצוע" pages' addresses (/for/<slug>). Dependency-free: proxy.ts imports it to answer a real 404 for any
 * other slug before the page renders (with Cache Components a notFound() after `await params` for an unknown slug
 * cannot be prerendered). The copy of each page: components/brand/landing/profession-pages.ts (a test keeps the two
 * lists equal).
 */
export const PROFESSION_SLUGS = ["lawyers", "accountants", "consultants", "clinics"] as const;
export type ProfessionSlug = (typeof PROFESSION_SLUGS)[number];

/** /for, /for/<unknown>, /for/<unknown>/opengraph-image… → true (a 404); a known profession's page or image → false. */
export function unknownProfessionPath(path: string): boolean {
  const m = /^\/for(?:\/([^/]*))?(?:\/.*)?$/.exec(path);
  if (!m) return false;
  return !(PROFESSION_SLUGS as readonly string[]).includes(m[1] ?? "");
}
