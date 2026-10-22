import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { budgetReply, liveCopy } from "./bot-live";

const documented = new Set([...readFileSync(new URL("../../docs/copy/bot-copy-live.md", import.meta.url), "utf8").matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

describe("bot copy — live AI caps", () => {
  it("every id is documented in docs/copy/bot-copy-live.md", () => {
    expect(Object.keys(liveCopy).filter((id) => !documented.has(id))).toEqual([]);
  });

  it("calm, neutral Hebrew with the short hyphen only (the lines are also shown on the site)", () => {
    for (const [id, fn] of Object.entries(liveCopy)) {
      const text = (fn as (n: number) => string)(60);
      expect(text, id).not.toMatch(/[–—]/);
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toContain("!");
    }
    expect(budgetReply("budget", true, 60)).toBe("הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר.");
    expect(budgetReply("budget", false, null)).toBe("הגענו לתקרת השימוש של היום. אפשר להמשיך מחר.");
    expect(budgetReply("user_messages", true, 60)).toBe("הגענו ל-60 הודעות היום, המכסה של גרסת הבדיקה. אפשר להמשיך מחר.");
  });
});
