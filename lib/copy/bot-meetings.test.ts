import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mcopy, meetingButtons } from "./bot-meetings";

const doc = readFileSync(new URL("../../docs/copy/bot-copy-meetings.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

const view = { title: "x", when: "y", date: "z", signature: "דנה", platform: "Teams", summary: "s", decisions: ["d"], actions: ["a"], questions: ["q"] };
const sample = (fn: unknown): string => {
  const f = fn as (...a: unknown[]) => string;
  // the summary and the mail take one object; the rest take strings / numbers
  try {
    const out = f(view);
    if (typeof out === "string" && !out.includes("[object Object]")) return out;
  } catch {
    /* takes strings */
  }
  return f("x", ["y"], ["z"]);
};

describe("bot copy — meeting summaries", () => {
  it("every id is documented in docs/copy/bot-copy-meetings.md, and every documented id exists", () => {
    expect(Object.keys(mcopy).filter((id) => !documented.has(id))).toEqual([]);
    expect([...documented].filter((id) => !(id! in mcopy))).toEqual([]);
  });

  it("neutral phrasing, no slash gender forms, no undefined", () => {
    for (const [id, fn] of Object.entries(mcopy)) {
      const text = sample(fn);
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toContain("undefined");
      expect(text, id).not.toMatch(/\b(תרצה|תרצי|אתה|תשלח|תכתוב)\b/u);
    }
    expect(mcopy["mt.mail.body"]({ title: "t", date: "d", summary: "s", decisions: [], actions: [], questions: [], signature: "דנה" })).toBe("שלום לכולם,\n\nתודה על הפגישה (t, d). הנה סיכום קצר:\n\ns\n\nאם משהו חסר או לא מדויק, אשמח לתיקון.\n\nבברכה,\nדנה");
  });

  it("an action line: the owner and the date only when they were said", () => {
    expect(mcopy["mt.action_line"]("לשלוח הצעה", "יוסי", "יום ה׳ 22.10")).toBe("לשלוח הצעה (יוסי, עד יום ה׳ 22.10)");
    expect(mcopy["mt.action_line"]("לשלוח הצעה", null, "יום ה׳ 22.10")).toBe("לשלוח הצעה (עד יום ה׳ 22.10)");
    expect(mcopy["mt.action_line"]("לשלוח הצעה", null, null)).toBe("לשלוח הצעה");
    expect(mcopy["mt.tasks.added"](1, "Google Tasks", ["א"])).toBe("הוספתי משימה אחת ל-Google Tasks:\n• א");
  });

  it("WhatsApp limits: button titles ≤ 20 characters", () => {
    for (const t of Object.values(meetingButtons)) expect(t.length, t).toBeLessThanOrEqual(20);
  });
});
