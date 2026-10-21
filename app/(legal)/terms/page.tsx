import type { Metadata } from "next";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";

export const metadata: Metadata = { title: LEGAL_DOCS.terms.title };

/** Rendered from docs/legal/terms-of-service-he.md (draft — see the banner in the layout). */
export default function TermsPage() {
  return <Markdown source={legalSource("terms")} />;
}
