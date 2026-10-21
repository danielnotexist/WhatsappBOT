import type { Metadata } from "next";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";

export const metadata: Metadata = { title: LEGAL_DOCS.privacy.title };

/** Rendered from docs/legal/privacy-policy-he.md (draft — see the banner in the layout). */
export default function PrivacyPage() {
  return <Markdown source={legalSource("privacy")} />;
}
