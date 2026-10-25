import { describe, expect, it } from "vitest";
import { rtlUnits, visualWord } from "./rtl";

describe("Hebrew in the share images: visual order for satori (no bidi of its own)", () => {
  it("a Hebrew word is drawn reversed, so it reads right to left", () => {
    expect(visualWord("עלזה")).toBe("הזלע");
    expect(visualWord("בוואטסאפ.")).toBe(".פאסטאווב");
  });

  it("Latin and numbers inside a Hebrew word keep their own order; brackets mirror", () => {
    expect(visualWord("ב-Outlook")).toBe("Outlook-ב");
    expect(visualWord("ב-09:30")).toBe("09:30-ב");
    expect(visualWord("(עלזה)")).toBe("(הזלע)");
    expect(visualWord("״שלח״")).toBe("״חלש״");
  });

  it("a Latin word in a Hebrew line: its letters in order, the punctuation on the Hebrew side", () => {
    expect(visualWord("Outlook,")).toBe(",Outlook");
    expect(visualWord("365.")).toBe(".365");
    expect(visualWord("₪,")).toBe(",₪");
    expect(visualWord("alze.ai")).toBe("alze.ai");
  });

  it("units in reading order (the first is the rightmost); Latin words in a row stay one unit", () => {
    expect(rtlUnits("העוזרת האישית שלך, בוואטסאפ.")).toEqual(["תרזועה", "תישיאה", ",ךלש", ".פאסטאווב"]);
    expect(rtlUnits("עם Microsoft 365 ו-Google")).toEqual(["םע", "Microsoft 365", "Google-ו"]);
    expect(rtlUnits("בסיסי 99 ₪, פרו 299 ₪ לחודש.")).toEqual(["יסיסב", "99", ",₪", "ורפ", "299", "₪", ".שדוחל"]);
    expect(rtlUnits("  ")).toEqual([]);
  });
});
