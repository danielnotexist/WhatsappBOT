import { describe, expect, it } from "vitest";
import { chatTime, clockDuration, waBlocks, waInline } from "./format";

describe("the chat's WhatsApp formatting", () => {
  it("bold titles, bare links (without the sentence's punctuation) and plain text", () => {
    expect(waInline("*טיוטה למייל*")).toEqual([{ t: "bold", v: "טיוטה למייל" }]);
    expect(waInline("קישור: https://alze.example/api/auth/microsoft/start?t=abc.")).toEqual([
      { t: "text", v: "קישור: " },
      { t: "link", v: "https://alze.example/api/auth/microsoft/start?t=abc" },
      { t: "text", v: "." },
    ]);
    expect(waInline("בלי עיצוב")).toEqual([{ t: "text", v: "בלי עיצוב" }]);
  });

  it("quoted lines become one quote block; dashes become the site's short hyphen", () => {
    const blocks = waBlocks("*טיוטה*\nאל: דנה\n\n> שלום דנה,\n> הפגישה זזה — ליום ה׳\n\nלשלוח כך?");
    expect(blocks.map((b) => b.kind)).toEqual(["line", "line", "line", "quote", "line", "line"]);
    const quote = blocks[3]!;
    expect(quote.kind === "quote" && quote.lines.map((l) => l.map((p) => p.v).join(""))).toEqual(["שלום דנה,", "הפגישה זזה - ליום ה׳"]);
    expect(JSON.stringify(waBlocks("בשמחה. אם צריך משהו — אני כאן, 09:00–10:00"))).not.toMatch(/[–—]/);
  });

  it("times in Israel and recording lengths", () => {
    expect(chatTime("2026-10-22T10:41:00Z")).toBe("13:41");
    expect(chatTime("not a date")).toBe("");
    expect(clockDuration(7_400)).toBe("0:07");
    expect(clockDuration(61_000)).toBe("1:01");
  });
});
