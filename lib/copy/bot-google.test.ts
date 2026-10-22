import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOOGLE_SCOPES } from "@/lib/google/oauth";
import { gcopy } from "./bot-google";

const doc = readFileSync(new URL("../../docs/copy/bot-copy-google.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));
const ALL = [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend];

describe("Google bot copy", () => {
  it("every id is documented in docs/copy/bot-copy-google.md", () => {
    expect(Object.keys(gcopy).filter((id) => !documented.has(id))).toEqual([]);
  });

  it("lists exactly the granted capabilities and never promises Gmail reading in phase 1", () => {
    const done = gcopy["g.connect_done"]("dana.levi@gmail.com", ["openid", ...ALL]);
    expect(done.split("\n").filter((l) => l.startsWith("• "))).toHaveLength(3);
    expect(done).toContain("לא קוראת");
    expect(gcopy["g.connect_done"]("a@gmail.com", ["openid", GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly])).not.toContain("לא קוראת");
    expect(gcopy["g.connect_partial"]([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend], "L")).toContain("לא אוכל לנהל את היומן ולשלוח מיילים מ-Gmail");
    expect(gcopy["g.mail.sent"]("יוסי", "a@gmail.com")).not.toContain("אעדכן");
  });

  it("uses neutral phrasing (no gendered slash forms)", () => {
    const args: Record<string, unknown[]> = { "g.connect_done": ["a@gmail.com", ALL], "g.connect_partial": [ALL, "https://x"], "g.web.connected_partial": ["a@gmail.com", ALL], "g.err.missing_scope": [GOOGLE_SCOPES.driveFile, "https://x"] };
    for (const [id, fn] of Object.entries(gcopy)) {
      const text = (fn as (...a: unknown[]) => string)(...(args[id] ?? ["x", "y"]));
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text.length, id).toBeGreaterThan(10);
    }
  });
});
