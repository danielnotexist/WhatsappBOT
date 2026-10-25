import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/seo/sitemap";

/**
 * /robots.txt (lib/seo/sitemap.ts robotsRules): on the production deployment the public pages are open and the private
 * ones closed, with the sitemap's address; anywhere else (a Vercel preview, a local run, the demo) everything is closed,
 * so the test site is never indexed. Built once per deployment (VERCEL_ENV is fixed for its build).
 */
export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
