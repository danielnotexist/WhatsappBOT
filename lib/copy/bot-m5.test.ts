import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copyM5, morningClosers, reminderButtons } from "./bot-m5";

const ids = (file: string) => new Set([...readFileSync(new URL(`../../docs/copy/${file}`, import.meta.url), "utf8").matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));
const documented = new Set([...ids("bot-copy.md"), ...ids("bot-copy-m5.md")]);

describe("bot copy — Milestone 5", () => {
  it("every id is documented in bot-copy.md or bot-copy-m5.md", () => {
    expect(Object.keys(copyM5).filter((id) => !documented.has(id))).toEqual([]);
  });

  it("renders the documented shapes", () => {
    expect(copyM5["act.reminder.set"]("מחר, 9:00", "להתקשר לבנק")).toBe("אזכיר: להתקשר לבנק\nמחר, 9:00");
    expect(copyM5["act.reminder.fired"]("להתקשר לבנק")).toBe("⏰ תזכורת: להתקשר לבנק");
    expect(copyM5["act.reminder.list"]([{ whenAbs: "מחר, 9:00", text: "בנק" }])).toBe("*תזכורות פתוחות*\n• מחר, 9:00 — בנק\n\nלמחוק או להזיז אחת מהן — פשוט לכתוב.");
    const summary = copyM5["act.morning.summary"]({ dayLabel: "יום ג׳ 22.10", meetings: ["• 10:00 פגישה עם כהן"], emails: [], reminders: ["• 14:00 להתקשר לבנק"], closer: morningClosers.default });
    expect(summary).toBe("*בוקר טוב. יום ג׳ 22.10*\n\n*פגישות היום*\n• 10:00 פגישה עם כהן\n\n*תזכורות*\n• 14:00 להתקשר לבנק\n\nשיהיה יום טוב.");
    expect(summary).not.toContain("מיילים"); // an empty section is omitted entirely
  });

  it("uses neutral phrasing (no slash gender forms) and WhatsApp button limits", () => {
    const lines = [{ whenAbs: "מחר, 9:00", text: "x" }];
    const args: Partial<Record<keyof typeof copyM5, unknown[]>> = {
      "act.reminder.list": [lines],
      "act.reminder.which": [lines],
      "act.morning.summary": [{ dayLabel: "d", meetings: ["• a"], emails: ["• b"], reminders: ["• c"], closer: morningClosers.emails }],
    };
    for (const [id, fn] of Object.entries(copyM5)) {
      const text = (fn as (...a: unknown[]) => string)(...(args[id as keyof typeof copyM5] ?? ["x", "y", "z"]));
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toContain("undefined");
    }
    for (const b of reminderButtons.fired("00000000-0000-4000-8000-000000000000")) {
      expect(b.title.length).toBeLessThanOrEqual(20);
      expect(b.id).toMatch(/^rem:(done|hour|tmrw):/);
    }
  });
});
