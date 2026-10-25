import { BRAND } from "@/lib/brand";
import { PLANS, type PaidPlan } from "@/lib/billing/plans";
import { absoluteUrl, siteOrigin } from "./site";

/**
 * Structured data for the home page (schema.org, as JSON-LD — node_modules/next/dist/docs/01-app/02-guides/json-ld.md):
 * the Organization behind the site and the SoftwareApplication it sells, with one Offer per plan from
 * lib/billing/plans.ts (monthly, in shekels, VAT included - lib/billing/money.ts and the price list say the same).
 */

type Env = Record<string, string | undefined>;

export function organizationJsonLd(env: Env = process.env) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteOrigin(env)}/#organization`,
    name: BRAND.name,
    alternateName: BRAND.latin,
    url: absoluteUrl("/", env),
    // app/icon.png, served by Next at /icon.png
    logo: absoluteUrl("/icon.png", env),
    description: BRAND.description,
  };
}

function offer(plan: PaidPlan, env: Env) {
  const p = PLANS[plan];
  return {
    "@type": "Offer",
    name: p.nameHe,
    price: p.priceIls,
    priceCurrency: "ILS",
    url: absoluteUrl("/pricing", env),
    availability: "https://schema.org/InStock",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: p.priceIls,
      priceCurrency: "ILS",
      unitCode: "MON",
      valueAddedTaxIncluded: true,
    },
  };
}

export function softwareApplicationJsonLd(env: Env = process.env) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    alternateName: BRAND.latin,
    url: absoluteUrl("/", env),
    description: BRAND.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "WhatsApp",
    inLanguage: "he",
    publisher: { "@id": `${siteOrigin(env)}/#organization` },
    offers: (["basic", "pro"] as const).map((plan) => offer(plan, env)),
  };
}

/** The script body: JSON with "<" escaped, so no string in it can close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
