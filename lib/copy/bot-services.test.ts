import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopy } from "./bot-services";

const doc = readFileSync(new URL("../../docs/copy/bot-copy-services.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

describe("services bot copy (Microsoft To Do, SharePoint)", () => {
  it("every id is documented in docs/copy/bot-copy-services.md", () => {
    expect(Object.keys(scopy).filter((id) => !documented.has(id))).toEqual([]);
  });

  it("links carry the 30-minute line and the admin note; the 'no link' lines name a phrase the bot understands", () => {
    expect(scopy["s.todo.consent"]("https://x/l")).toContain("https://x/l\n");
    expect(scopy["s.todo.consent"]("https://x/l")).toContain("הקישור עובד ל-30 הדקות הקרובות.");
    expect(scopy["s.sharepoint.consent"]("https://x/l")).toContain("אישור מנהל");
    // lib/bot/connect-intent.ts answers "לחבר את Microsoft 365" with a Microsoft link
    expect(scopy["s.todo.consent_no_link"]()).toContain('"לחבר את Microsoft 365"');
    expect(scopy["s.todo.created"]("להתקשר לבנק", "Tasks", null)).toBe("נוספה משימה ל-Microsoft To Do (Tasks): להתקשר לבנק.");
    expect(scopy["s.todo.created"]("להתקשר לבנק", "Tasks", "24.10")).toBe("נוספה משימה ל-Microsoft To Do (Tasks): להתקשר לבנק, עד 24.10.");
  });

  it("uses neutral phrasing and the short hyphen only", () => {
    for (const [id, fn] of Object.entries(scopy)) {
      const text = (fn as (...a: unknown[]) => string)("x", "y", "z");
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toMatch(/[–—]/);
    }
  });
});
