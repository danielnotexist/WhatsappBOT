// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, parseMarkdown } from "./markdown";

afterEach(cleanup);

const DOC = `# כותרת

> **טיוטה** לבדיקה.

## 1. סעיף

פסקה עם **מודגש**, *נטוי*, \`code\` ו[קישור](https://example.com) ו[פנימי](/privacy) ו[מסוכן](javascript:alert(1)).
שורה שנייה של אותה פסקה.

- פריט א
- פריט ב
  המשך של ב

1. ראשון
2. שני

| עמודה | ערך |
|---|---|
| א | **1** |

---
`;

describe("legal markdown renderer", () => {
  it("parses blocks", () => {
    expect(parseMarkdown(DOC).map((b) => b.kind)).toEqual(["h", "quote", "h", "p", "ul", "ol", "table", "hr"]);
  });

  it("renders headings, lists, tables and safe links only", () => {
    render(<Markdown source={DOC} />);
    expect(screen.getByRole("heading", { level: 1, name: "כותרת" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. סעיף" })).toBeInTheDocument();
    expect(screen.getByText("מודגש").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "קישור" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: "פנימי" })).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("link", { name: "מסוכן" })).toBeNull();
    expect(screen.getByText(/פריט ב המשך של ב/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "עמודה" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders the real drafts without losing headings", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["terms-of-service-he.md", "privacy-policy-he.md", "accessibility-statement-he.md"]) {
      const src = readFileSync(join(process.cwd(), "docs", "legal", f), "utf8");
      const headings = src.split("\n").filter((l) => /^#{1,6}\s/.test(l)).length;
      const { container, unmount } = render(<Markdown source={src} />);
      expect(container.querySelectorAll("h1,h2,h3,h4,h5,h6").length, f).toBe(headings);
      expect(container.innerHTML).not.toMatch(/<script/i);
      unmount();
    }
  });
});
