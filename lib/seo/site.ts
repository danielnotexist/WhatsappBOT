import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

/**
 * SEO in one place (round plan "אנליטיקה ו-SEO"): the site's address, each public page's metadata (title, description,
 * canonical, Open Graph in he_IL, a large Twitter card with the page's share image), noindex for private pages, and
 * whether this deployment may be indexed at all (robots.ts, sitemap.ts).
 * Pure: env is read from the argument (process.env by default), so the tests set it per case.
 */

type Env = Record<string, string | undefined>;

/** https://alze.ai — APP_URL (server), else NEXT_PUBLIC_APP_URL, else the dev server. No trailing slash. */
export function siteOrigin(env: Env = process.env): string {
  for (const raw of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    if (!raw) continue;
    try {
      return new URL(raw).origin;
    } catch {
      // a bad value is reported by lib/env.ts; try the next one
    }
  }
  return "http://localhost:3000";
}

export function absoluteUrl(path: string, env: Env = process.env): string {
  return new URL(path, `${siteOrigin(env)}/`).toString();
}

/**
 * The site still answers on Vercel's own address (APP_URL on *.vercel.app): not the real domain yet, so never indexed —
 * with the demo on or off.
 */
export function onVercelAppHost(env: Env = process.env): boolean {
  for (const raw of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    if (!raw) continue;
    try {
      const host = new URL(raw).hostname.toLowerCase();
      return host === "vercel.app" || host.endsWith(".vercel.app");
    } catch {
      // a bad value is reported by lib/env.ts; try the next one
    }
  }
  return false;
}

/**
 * Only the production deployment on the real domain is indexed: a Vercel preview (VERCEL_ENV=preview), a local run (no
 * VERCEL_ENV), the demo (DEMO_MODE=1) and an APP_URL on *.vercel.app all tell crawlers to stay out, so the test site
 * never shows up in search.
 */
export function indexable(env: Env = process.env): boolean {
  const demo = (env.DEMO_MODE ?? "").trim().toLowerCase();
  return env.VERCEL_ENV === "production" && demo !== "1" && demo !== "true" && !onVercelAppHost(env);
}

/**
 * The legal pages are drafts until a lawyer signs off (app/(legal)/layout.tsx): noindex and out of the sitemap until
 * this is true. They still carry full metadata and a canonical.
 */
export const LEGAL_INDEXED = false;

export const NOINDEX = { index: false, follow: false } as const;

/**
 * Never indexed: robots.txt disallows them, proxy.ts adds `X-Robots-Tag: noindex` to every answer under them (route
 * handlers too, such as the invoice link), and the pages carry robots noindex. `/r` — the personal "חבר מביא חבר"
 * links (round 3): a redirect that sets the referral cookie, never a page to index.
 */
export const PRIVATE_PREFIXES = ["/admin", "/account", "/api", "/pay", "/invoice", "/login", "/demo", "/r"] as const;

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export interface PageSeo {
  /** the path of the page: "/pricing" */
  path: string;
  /** the page's own title; the root layout's template adds " · עלזה" (`absolute`: the whole title as given) */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** the share image's route: "/opengraph-image" (the site's), "/pricing/opengraph-image"… */
  image?: string;
  imageAlt?: string;
  /** false → noindex, nofollow */
  index?: boolean;
}

export const SITE_IMAGE = "/opengraph-image";

/**
 * A public page's metadata. Every field is set here because Next merges metadata shallowly: a page that sets
 * `openGraph` replaces the layout's whole object, the image included — so the image is named explicitly.
 */
export function pageMetadata(p: PageSeo): Metadata {
  const fullTitle = p.absoluteTitle ? p.title : `${p.title} · ${BRAND.name}`;
  const image = { url: p.image ?? SITE_IMAGE, width: 1200, height: 630, alt: p.imageAlt ?? fullTitle, type: "image/png" };
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: p.path },
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: BRAND.name,
      url: p.path,
      title: fullTitle,
      description: p.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: p.description,
      images: [image],
    },
    ...(p.index === false ? { robots: NOINDEX } : {}),
  };
}

/** A private page (the personal area, the panel, payment and sign-in links): a title, never indexed. */
export function privateMetadata(title: string): Metadata {
  return { title, robots: NOINDEX };
}

/** The home page's title and the site default: "עלזה - העוזרת האישית שלך, בוואטסאפ." */
export const HOME_TITLE = `${BRAND.name} - ${BRAND.tagline}`;
