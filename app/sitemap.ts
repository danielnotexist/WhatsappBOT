import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo/sitemap";

/** /sitemap.xml: the public pages, each with when its content last changed (lib/seo/sitemap.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
