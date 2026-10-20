import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ListRow } from "@/lib/wa/types";
import { buttons, copy, lists } from "./bot";

const doc = readFileSync(new URL("../../docs/copy/bot-copy.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

describe("bot copy", () => {
  it("every id used in code is documented in docs/copy/bot-copy.md", () => {
    const missing = Object.keys(copy).filter((id) => !documented.has(id));
    expect(missing).toEqual([]);
  });

  it("renders placeholders and keeps the trust line, with no gendered slash forms", () => {
    const welcome = copy["onb.welcome"]("דנה");
    expect(welcome).toContain("שלום דנה");
    expect(welcome).toContain("רואה רק מה ששולחים לי כאן");
    expect(copy["onb.welcome"](null).startsWith("ברוכים הבאים")).toBe(true);
    const draft = copy["act.mail.draft"]({ toName: "רונית", toEmail: "r@x.co", subject: "נושא", body: "שורה 1\nשורה 2" });
    expect(draft).toContain("אל: רונית (r@x.co)");
    expect(draft).toContain("> שורה 1\n> שורה 2");
    const sample = { toName: "רונית", toEmail: "r@x.co", subject: "s", body: "b", title: "t", date: "d", start: "09:00", end: "10:00" };
    for (const [id, fn] of Object.entries(copy)) {
      const f = fn as (...a: unknown[]) => string;
      let text: string;
      try {
        text = f("x", "y", "z");
      } catch {
        text = f(sample);
      }
      expect(text, id).not.toMatch(/\/[יה]\b/);
    }
  });

  it("button and list ids follow the webhook conventions", () => {
    expect(buttons.approve("abc").map((b) => b.id)).toEqual(["pa:approve:abc", "pa:edit:abc", "pa:cancel:abc"]);
    expect(buttons.approve("abc", "קבע")[0]!.title).toBe("קבע");
    for (const b of [...buttons.welcome, ...buttons.connect, ...buttons.approve("1")]) expect(b.title.length).toBeLessThanOrEqual(20);
    for (const r of [...lists.pain.rows, ...lists.morningTime.rows] as ListRow[]) {
      expect(r.title.length).toBeLessThanOrEqual(24);
      if (r.description) expect(r.description.length).toBeLessThanOrEqual(72);
    }
  });
});
