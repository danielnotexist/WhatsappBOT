import type { Metadata } from "next";
import { PageTransition } from "@/components/brand/page-transition";
import { BRAND } from "@/lib/brand";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";
import { LEGAL_INDEXED, pageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata({ path: "/accessibility", title: LEGAL_DOCS.accessibility.title, description: `הצהרת הנגישות של ${BRAND.name}: מה נעשה כדי שהאתר יהיה נגיש, ואיך פונים אם משהו לא עובד.`, index: LEGAL_INDEXED });

/** Rendered from docs/legal/accessibility-statement-he.md (draft — see the banner in the layout). */
export default function AccessibilityPage() {
  return (
    // one snapshot per document: moving between the legal pages the article changes under the still header
    <PageTransition>
      <div>
        <Markdown source={legalSource("accessibility")} />
      </div>
    </PageTransition>
  );
}
