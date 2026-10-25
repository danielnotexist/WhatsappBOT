import type { MetadataRoute } from "next";
import { PROFESSION_PAGES } from "@/components/brand/landing/profession-pages";
import { absoluteUrl, indexable, LEGAL_INDEXED, PRIVATE_PREFIXES } from "./site";

/**
 * The public pages for the sitemap, and the robots rules (app/sitemap.ts, app/robots.ts). `updated`: when the page's
 * content last changed — move it with the copy, so crawlers come back when there is something new.
 */

type Env = Record<string, string | undefined>;

export interface PublicPage {
  path: string;
  updated: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
  /** a legal draft: listed only once LEGAL_INDEXED */
  legal?: boolean;
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", updated: "2026-10-24", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", updated: "2026-10-23", changeFrequency: "monthly", priority: 0.9 },
  ...PROFESSION_PAGES.map((p) => ({ path: `/for/${p.slug}`, updated: "2026-10-24", changeFrequency: "monthly" as const, priority: 0.8 })),
  { path: "/start", updated: "2026-10-22", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", updated: "2026-10-25", changeFrequency: "yearly", priority: 0.3, legal: true },
  { path: "/terms", updated: "2026-10-22", changeFrequency: "yearly", priority: 0.3, legal: true },
  { path: "/accessibility", updated: "2026-10-22", changeFrequency: "yearly", priority: 0.3, legal: true },
];

export function sitemapEntries(env: Env = process.env, legalIndexed: boolean = LEGAL_INDEXED): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.filter((p) => !p.legal || legalIndexed).map((p) => ({
    url: absoluteUrl(p.path, env),
    lastModified: new Date(`${p.updated}T00:00:00Z`),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}

export function robotsRules(env: Env = process.env): MetadataRoute.Robots {
  if (!indexable(env)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // a robots path is a prefix: "/admin" also closes everything under it
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES] },
    sitemap: absoluteUrl("/sitemap.xml", env),
  };
}
