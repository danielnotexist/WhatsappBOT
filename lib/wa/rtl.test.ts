import { describe, expect, it } from "vitest";
import { rtlLines } from "./rtl";

describe("rtlLines — a Hebrew line that opens in English keeps its right-to-left layout", () => {
  it("prefixes an RLM to Hebrew lines whose first letter is Latin (the live Drive/Meet answer, 23.10.2026)", () => {
    const text = "יש לי גישה חלקית:\n• *Google Drive:* רק קבצים שנוצרו או נפתחו דרכי.\n• Google Meet: כן, דרך היומן.\nOutlook מחובר.";
    expect(rtlLines(text).split("\n")).toEqual(["יש לי גישה חלקית:", "‏• *Google Drive:* רק קבצים שנוצרו או נפתחו דרכי.", "‏• Google Meet: כן, דרך היומן.", "‏Outlook מחובר."]);
  });

  it("leaves Hebrew-first lines, English-only lines and links alone, and is idempotent", () => {
    const text = "מייל מ-John Smith\nThanks, see you tomorrow\nhttps://app.example.co.il/x?t=1 קישור\n• 10:30 — פגישה";
    expect(rtlLines(text)).toBe(text);
    const once = rtlLines("Gmail מחובר");
    expect(rtlLines(once)).toBe(once);
  });
});
