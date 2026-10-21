import type { Metadata } from "next";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";

export const metadata: Metadata = { title: LEGAL_DOCS.accessibility.title };

/** Rendered from docs/legal/accessibility-statement-he.md (draft — see the banner in the layout). */
export default function AccessibilityPage() {
  return <Markdown source={legalSource("accessibility")} />;
}
