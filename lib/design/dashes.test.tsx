// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { cleanup, render } from "@testing-library/react";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { LEGAL_DOCS, legalSource, type LegalDoc } from "@/lib/legal/docs";
import { Markdown } from "@/lib/legal/markdown";
import { siteDashes } from "./typography";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..");

/** Site text written by hand: every source file under app/ and components/, plus the lib modules the site renders. */
const SITE_LIB = ["lib/brand.ts", "lib/copy/auth-sso.ts", "lib/demo.ts", "lib/agents/templates.ts", "lib/support/types.ts", "lib/support/knowledge.ts", "lib/support/http.ts", "lib/support/system-request.ts", "lib/connections/services.ts", "lib/integrations/catalogue.ts", "lib/billing/compare.ts"];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const TEXT_KINDS = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText]);

/** "file:line: text" for every string, template or JSX text with an em / en dash (comments are not text). */
function dashesIn(file: string): string[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  if (!/[–—]/.test(src)) return [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (TEXT_KINDS.has(node.kind)) {
      const text = node.getText(sf);
      if (/[–—]/.test(text)) found.push(`${relative(ROOT, join(ROOT, file))}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${text.trim().slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("site text uses the short hyphen only (Daniel, 22.10.2026)", () => {
  it("no em dash or en dash in the text of app/, components/ and the site's lib modules (comments may keep them)", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components"), ...SITE_LIB];
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap(dashesIn)).toEqual([]);
  });

  it("the scanner sees strings, templates and JSX text, and skips comments", () => {
    const sf = (code: string) => {
      const s = ts.createSourceFile("x.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const hits: ts.SyntaxKind[] = [];
      const visit = (n: ts.Node) => {
        if (TEXT_KINDS.has(n.kind) && /[–—]/.test(n.getText(s))) hits.push(n.kind);
        ts.forEachChild(n, visit);
      };
      visit(s);
      return hits;
    };
    expect(sf(`// a — comment\nconst a = "x — y"; const b = \`\${a} – z\`; const c = <p>a — b</p>;`)).toEqual([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText]);
  });

  it("the legal drafts render with short hyphens, wording unchanged", () => {
    expect(siteDashes("א — ב, 09:00–10:00")).toBe("א - ב, 09:00-10:00");
    for (const doc of Object.keys(LEGAL_DOCS) as LegalDoc[]) {
      const source = legalSource(doc);
      const { container } = render(<Markdown source={source} />);
      expect(container.textContent, doc).not.toMatch(/[–—]/);
      cleanup();
    }
  });
});
