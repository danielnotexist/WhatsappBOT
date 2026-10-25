import type { Metadata } from "next";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFESSION_PAGES } from "@/components/brand/landing/profession-pages";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/billing/plans";
import { jsonLdString, organizationJsonLd, softwareApplicationJsonLd } from "./json-ld";
import { PROFESSION_SLUGS, unknownProfessionPath } from "./professions";
import { absoluteUrl, indexable, isPrivatePath, pageMetadata, siteOrigin } from "./site";
import { robotsRules, sitemapEntries } from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

const PROD = { VERCEL_ENV: "production", APP_URL: "https://alze.ai" };

type Og = { locale?: string; url?: string; images?: { url: string; width: number; height: number }[] };
const og = (m: Metadata) => m.openGraph as Og;
const robotsOf = (m: Metadata) => m.robots as { index?: boolean; follow?: boolean } | undefined;

describe("the site's address and indexing", () => {
  it("APP_URL, else NEXT_PUBLIC_APP_URL, else the dev server; absolute URLs from it", () => {
    expect(siteOrigin({ APP_URL: "https://alze.ai/", NEXT_PUBLIC_APP_URL: "https://other.example" })).toBe("https://alze.ai");
    expect(siteOrigin({ APP_URL: "not a url", NEXT_PUBLIC_APP_URL: "https://pub.example/x" })).toBe("https://pub.example");
    expect(siteOrigin({})).toBe("http://localhost:3000");
    expect(absoluteUrl("/pricing", PROD)).toBe("https://alze.ai/pricing");
  });

  it("only the production deployment is indexable — never a preview, a local run or the demo", () => {
    expect(indexable(PROD)).toBe(true);
    expect(indexable({ VERCEL_ENV: "preview" })).toBe(false);
    expect(indexable({ VERCEL_ENV: "development" })).toBe(false);
    expect(indexable({})).toBe(false);
    expect(indexable({ ...PROD, DEMO_MODE: "1" })).toBe(false);
  });

  it("the private prefixes, and nothing that only starts with the same letters", () => {
    for (const p of ["/admin", "/admin/users/1", "/account", "/api/a", "/pay/x", "/invoice/t", "/login", "/login/w/t", "/demo/chat", "/r/ABCDEFG"]) expect(isPrivatePath(p)).toBe(true);
    for (const p of ["/", "/pricing", "/for/lawyers", "/start", "/privacy", "/accountants", "/payments"]) expect(isPrivatePath(p)).toBe(false);
  });
});

describe("pageMetadata", () => {
  it("title (the template adds the name), description, canonical, Open Graph he_IL with the image, a large Twitter card", () => {
    const m = pageMetadata({ path: "/pricing", title: "מחירים", description: "d", image: "/pricing/opengraph-image" });
    expect(m.title).toBe("מחירים");
    expect(m.alternates).toEqual({ canonical: "/pricing" });
    expect(og(m)).toMatchObject({ type: "website", locale: "he_IL", siteName: BRAND.name, url: "/pricing", title: `מחירים · ${BRAND.name}`, description: "d" });
    expect(og(m).images![0]).toMatchObject({ url: "/pricing/opengraph-image", width: 1200, height: 630 });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: `מחירים · ${BRAND.name}` });
    expect(m.robots).toBeUndefined();
    expect(robotsOf(pageMetadata({ path: "/x", title: "x", description: "d", index: false }))).toEqual({ index: false, follow: false });
  });
});

describe("the metadata of each page", () => {
  it.each([
    ["/", () => import("@/app/page"), `${BRAND.name} - ${BRAND.tagline}`, "/opengraph-image"],
    ["/pricing", () => import("@/app/pricing/page"), "מחירים", "/pricing/opengraph-image"],
    ["/start", () => import("@/app/(auth)/start/page"), "הרשמה", "/opengraph-image"],
  ] as const)("%s: public, with its canonical and share image", async (path, load, title, image) => {
    const m = (await load()).metadata as Metadata;
    const t = m.title as string | { absolute: string };
    expect(typeof t === "string" ? t : t.absolute).toBe(title);
    expect(m.description).toBeTruthy();
    expect(m.alternates?.canonical).toBe(path);
    expect(og(m).locale).toBe("he_IL");
    expect(og(m).images![0]!.url).toBe(image);
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
    expect(robotsOf(m)?.index).not.toBe(false);
  });

  it.each([
    ["/privacy", () => import("@/app/(legal)/privacy/page")],
    ["/terms", () => import("@/app/(legal)/terms/page")],
    ["/accessibility", () => import("@/app/(legal)/accessibility/page")],
  ] as const)("%s: full metadata and a canonical, noindex while the drafts wait for the lawyer", async (path, load) => {
    const m = (await load()).metadata as Metadata;
    expect(m.alternates?.canonical).toBe(path);
    expect(m.description).toContain(BRAND.name);
    expect(og(m).locale).toBe("he_IL");
    expect(robotsOf(m)).toEqual({ index: false, follow: false });
  });

  it("each profession page: its own title, canonical and share image; an unknown one has none", async () => {
    const { generateMetadata } = await import("@/app/for/[profession]/page");
    for (const p of PROFESSION_PAGES) {
      const m = await generateMetadata({ params: Promise.resolve({ profession: p.slug }), searchParams: Promise.resolve({}) } as never);
      expect(m.title).toBe(p.title);
      expect(m.alternates?.canonical).toBe(`/for/${p.slug}`);
      expect(og(m).images![0]!.url).toBe(`/for/${p.slug}/opengraph-image`);
      expect(m.description).toBe(p.description);
    }
    expect(await generateMetadata({ params: Promise.resolve({ profession: "nope" }), searchParams: Promise.resolve({}) } as never)).toEqual({});
  });

  it.each([
    ["/admin", () => import("@/app/admin/page")],
    ["/account", () => import("@/app/account/page")],
    ["/pay/<token>", () => import("@/app/pay/[token]/page")],
    ["/pay/done", () => import("@/app/pay/done/page")],
    ["/login", () => import("@/app/(auth)/login/page")],
    ["/login/email", () => import("@/app/(auth)/login/(card)/email/page")],
    ["/login/code", () => import("@/app/(auth)/login/(card)/code/page")],
    ["/login/w/<token>", () => import("@/app/(auth)/login/w/[token]/page")],
    ["/demo/chat", () => import("@/app/demo/chat/page")],
    ["/start/email", () => import("@/app/(auth)/start/email/page")],
    ["/start/code", () => import("@/app/(auth)/start/code/page")],
    ["/start/connect", () => import("@/app/(auth)/start/connect/page")],
    ["/start/ready", () => import("@/app/(auth)/start/ready/page")],
  ] as const)("%s: noindex", async (_path, load) => {
    expect(robotsOf((await load()).metadata as Metadata)).toEqual({ index: false, follow: false });
  });

  it("the invoice link (a route handler) and every private path answer X-Robots-Tag: noindex", async () => {
    const { proxy } = await import("@/proxy");
    for (const p of ["/invoice/abc", "/pay/abc", "/account", "/api/health", "/login"]) {
      expect(proxy(new NextRequest(new URL(p, "http://localhost:3000"))).headers.get("x-robots-tag"), p).toBe("noindex, nofollow");
    }
    expect(proxy(new NextRequest(new URL("/pricing", "http://localhost:3000"))).headers.get("x-robots-tag")).toBeNull();
  });
});

describe("sitemap.xml", () => {
  it("the public pages with their last change, absolute, from APP_URL; the legal drafts only once they are indexed", () => {
    const entries = sitemapEntries(PROD);
    expect(entries.map((e) => e.url)).toEqual([
      "https://alze.ai/",
      "https://alze.ai/pricing",
      ...PROFESSION_PAGES.map((p) => `https://alze.ai/for/${p.slug}`),
      "https://alze.ai/start",
    ]);
    for (const e of entries) {
      expect(e.lastModified).toBeInstanceOf(Date);
      expect(Number.isNaN((e.lastModified as Date).getTime())).toBe(false);
    }
    expect(sitemapEntries(PROD, true).map((e) => new URL(e.url).pathname)).toEqual(expect.arrayContaining(["/privacy", "/terms", "/accessibility"]));
    expect(entries.some((e) => isPrivatePath(new URL(e.url).pathname))).toBe(false);
  });
});

describe("robots.txt", () => {
  it("production: open, the private prefixes closed, the sitemap's address", () => {
    expect(robotsRules(PROD)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/pay", "/invoice", "/login", "/demo", "/r/"] },
      sitemap: "https://alze.ai/sitemap.xml",
    });
  });

  it.each([{ VERCEL_ENV: "preview", APP_URL: "https://alze-git-x.vercel.app" }, {}, { ...PROD, DEMO_MODE: "1" }])("a preview, a local run, the demo (%j): everything closed", (env) => {
    expect(robotsRules(env)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("app/robots.ts reads the deployment's env", async () => {
    const { default: robots } = await import("@/app/robots");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://alze.ai");
    vi.stubEnv("DEMO_MODE", "");
    expect((robots().rules as { disallow: string[] }).disallow).toContain("/admin");
  });
});

describe("JSON-LD on the home page", () => {
  it("Organization (name, url, logo) and SoftwareApplication (BusinessApplication, he, an offer per plan in ILS)", () => {
    const org = organizationJsonLd(PROD);
    expect(org).toMatchObject({ "@type": "Organization", name: BRAND.name, url: "https://alze.ai/", logo: "https://alze.ai/icon.png" });
    const app = softwareApplicationJsonLd(PROD);
    expect(app).toMatchObject({ "@type": "SoftwareApplication", name: BRAND.name, applicationCategory: "BusinessApplication", inLanguage: "he" });
    expect(app.offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual([
      [PLANS.basic.nameHe, 99, "ILS"],
      [PLANS.pro.nameHe, 299, "ILS"],
    ]);
  });

  it("the script body cannot close its tag", () => {
    expect(jsonLdString({ a: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("the profession pages' addresses", () => {
  it("the proxy's list and the pages' copy agree", () => {
    expect(PROFESSION_PAGES.map((p) => p.slug)).toEqual([...PROFESSION_SLUGS]);
  });

  it("an unknown slug (or its image) is a 404 before rendering; a known one passes", () => {
    for (const p of ["/for", "/for/", "/for/nope", "/for/nope/opengraph-image"]) expect(unknownProfessionPath(p)).toBe(true);
    for (const p of ["/for/lawyers", "/for/clinics/opengraph-image", "/pricing", "/forms"]) expect(unknownProfessionPath(p)).toBe(false);
  });
});
