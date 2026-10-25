import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";
import { LEGAL_INDEXED, pageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata({ path: "/terms", title: LEGAL_DOCS.terms.title, description: `תנאי השימוש ב-${BRAND.name}: המסלולים והתשלום, מה העוזרת עושה בשם המשתמש ומה האחריות של כל צד.`, index: LEGAL_INDEXED });

/** Rendered from docs/legal/terms-of-service-he.md (draft — see the banner in the layout). */
export default function TermsPage() {
  return <Markdown source={legalSource("terms")} />;
}
