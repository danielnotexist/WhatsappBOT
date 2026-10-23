import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertButtons, pcopy, phishingReasons } from "./bot-proactive";

const doc = readFileSync(new URL("../../docs/copy/bot-copy-proactive.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

describe("bot copy — proactive alerts and phishing warnings", () => {
  it("every id is documented in docs/copy/bot-copy-proactive.md, and every documented id exists", () => {
    expect(Object.keys(pcopy).filter((id) => !documented.has(id))).toEqual([]);
    expect([...documented].filter((id) => !(id! in pcopy))).toEqual([]);
  });

  it("neutral phrasing, no slash gender forms, no undefined, the short hyphen in what she writes", () => {
    for (const [id, fn] of Object.entries(pcopy)) {
      const text = (fn as (...a: unknown[]) => string)("x", "y", 2, false);
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toContain("undefined");
      expect(text, id).not.toMatch(/\b(תרצה|תרצי|אתה|תשלח|תכתוב)\b/u);
    }
    for (const [id, fn] of Object.entries(phishingReasons)) expect(fn("x.co.il"), id).not.toContain("undefined");
  });

  it("WhatsApp limits: button titles ≤ 20 characters", () => {
    for (const t of Object.values(alertButtons)) expect(t.length, t).toBeLessThanOrEqual(20);
  });

  it("the warning opens with '⚠️ שימו לב:' and asks to verify by phone", () => {
    expect(pcopy["alert.phishing.warning"]("מבקשים לשנות פרטי חשבון בנק לתשלום")).toBe("⚠️ שימו לב: מבקשים לשנות פרטי חשבון בנק לתשלום. כדאי לאמת בטלפון, מול מספר מוכר, לפני כל תשלום, ולא ללחוץ על קישורים במייל.");
  });
});
