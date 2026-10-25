import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LEGAL_DOCS, legalSource } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";
import { LEGAL_INDEXED, pageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata({ path: "/privacy", title: LEGAL_DOCS.privacy.title, description: `מדיניות הפרטיות של ${BRAND.name}: איזה מידע נשמר, למה, איפה ולכמה זמן, ואיך מוחקים אותו.`, index: LEGAL_INDEXED });

/** Rendered from docs/legal/privacy-policy-he.md (draft — see the banner in the layout). */
export default function PrivacyPage() {
  return <Markdown source={legalSource("privacy")} />;
}
