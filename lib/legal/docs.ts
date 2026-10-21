import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The legal drafts shown on the site (round plan §3): source of truth stays in docs/legal. */
export const LEGAL_DOCS = {
  terms: { file: "terms-of-service-he.md", title: "תנאי שימוש" },
  privacy: { file: "privacy-policy-he.md", title: "מדיניות פרטיות" },
  accessibility: { file: "accessibility-statement-he.md", title: "הצהרת נגישות" },
} as const;

export type LegalDoc = keyof typeof LEGAL_DOCS;

/** Read at build time (synchronously, so the page prerenders as static HTML). */
export function legalSource(doc: LegalDoc): string {
  return readFileSync(join(process.cwd(), "docs", "legal", LEGAL_DOCS[doc].file), "utf8");
}
