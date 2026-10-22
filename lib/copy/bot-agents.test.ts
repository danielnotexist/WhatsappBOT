import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_BUNDLES } from "@/lib/agents/capabilities";
import { BUILTIN_AGENTS, BUILTIN_ORDER } from "@/lib/agents/templates";
import { PRODUCT_NAME } from "@/lib/brand";
import type { ListRow, ReplyButton } from "@/lib/wa/types";
import { acopy, agentButtons, agentLists } from "./bot-agents";

const doc = readFileSync(new URL("../../docs/copy/bot-copy-agents.md", import.meta.url), "utf8");
const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));
const KEY = "custom:123e4567-e89b-42d3-a456-426614174000";

const args: Partial<Record<keyof typeof acopy, unknown[]>> = {
  "agent.not_found": ["שיווק", ["מזכירה", "חשבוניות"]],
  "agent.list": [[{ name: "מזכירה", capsLine: "קריאת יומן", state: "active" }, { name: "חשבוניות", capsLine: "קריאת מייל", state: "locked" }], "סוכנים משלך: 1 מתוך 1."],
  "agent.quota.basic": [1],
  "agent.quota.pro": [2],
  "agent.new.ask_name": [null],
  "agent.new.summary": [{ name: "חשבוניות", templateName: "מנהלת חשבונות", capsLine: "קריאת מייל", recipients: ["office@barak-cpa.example"], instructions: "קצר" }],
  "agent.edit.ask_instructions": ["מזכירה", true],
  "act.mail.forward_confirm": [{ subject: "חשבונית 2291", from: "ספק (billing@x.co)", attachments: ["invoice.pdf"], to: "office@barak-cpa.example", comment: "לטיפולך" }],
};
const render = (id: keyof typeof acopy) => (acopy[id] as (...a: unknown[]) => string)(...(args[id] ?? ["חשבוניות", "https://app.example.co.il/pay/x"]));

describe("agent copy", () => {
  it("every id is documented in docs/copy/bot-copy-agents.md", () => {
    expect(Object.keys(acopy).filter((id) => !documented.has(id))).toEqual([]);
  });

  it("uses neutral phrasing, no undefined, and the product name only from lib/brand.ts", () => {
    for (const id of Object.keys(acopy) as (keyof typeof acopy)[]) {
      const text = render(id);
      expect(text, id).not.toMatch(/\/[יהת]\b/);
      expect(text, id).not.toContain("undefined");
      expect(text.length, id).toBeGreaterThan(2);
    }
    expect(acopy["agent.back_to_main"]()).toBe(`כאן ${PRODUCT_NAME}. במה לעזור?`);
    expect(readFileSync(new URL("./bot-agents.ts", import.meta.url), "utf8")).not.toContain(PRODUCT_NAME);
  });

  it("renders the documented shapes", () => {
    expect(acopy["agent.reply_header"]("מזכירה")).toBe("*מזכירה:*");
    expect(acopy["agent.hello"]("מזכירה", "קריאת יומן ותזכורות")).toBe("*מזכירה:*\nכאן. במה לעזור? בתפקיד הזה אני מטפלת בקריאת יומן ותזכורות.");
    expect(render("agent.list")).toBe(
      "*הסוכנים שלך*\n\n• @מזכירה — קריאת יומן\n• @חשבוניות — קריאת מייל (נעול)\n\nסוכנים משלך: 1 מתוך 1.\n\nלפנות לסוכן: ״@שם״ בתחילת ההודעה. ליצירה: ״סוכן חדש״. לעריכה: ״עריכת סוכן <שם>״.",
    );
    expect(render("act.mail.forward_confirm")).toBe("*העברת מייל*\nנושא: חשבונית 2291\nמאת: ספק (billing@x.co)\nקבצים: invoice.pdf\nאל: office@barak-cpa.example\n\n> לטיפולך\n\nלהעביר?");
    expect(acopy["act.mail.forward_confirm"]({ subject: "", from: "", attachments: [], to: "a@b.co", comment: "" })).toBe("*העברת מייל*\nנושא: (בלי נושא)\nאל: a@b.co\n\nלהעביר?");
    expect(acopy["agent.not_found"]("שיווק", [])).toContain("״סוכן חדש״ יוצר אחד");
    expect(acopy["agent.limit.trial"]("https://x/pay/t")).toContain("@מזכירה מה יש לי מחר?");
  });

  it("buttons and lists fit WhatsApp's limits (≤ 3 buttons of ≤ 20 characters; ≤ 10 rows, titles ≤ 24, descriptions ≤ 72)", () => {
    const buttonSets: ReplyButton[][] = [
      agentButtons.instructionsNone,
      agentButtons.tools,
      agentButtons.recipientsNone,
      agentButtons.save,
      agentButtons.cancel,
      agentButtons.deleteConfirm("123e4567-e89b-42d3-a456-426614174000"),
      agentButtons.forward("123e4567-e89b-42d3-a456-426614174000"),
      [...agentButtons.tools, ...agentButtons.cancel],
      [...agentButtons.instructionsNone, ...agentButtons.cancel],
      [...agentButtons.recipientsNone, ...agentButtons.cancel],
    ];
    for (const set of buttonSets) {
      expect(set.length).toBeLessThanOrEqual(3);
      for (const b of set) {
        expect(b.title.length, b.title).toBeLessThanOrEqual(20);
        expect(b.id.length).toBeLessThanOrEqual(256);
      }
    }
    const templateRows: ListRow[] = [...BUILTIN_ORDER.map((r) => ({ id: `ag:tpl:${r}`, title: BUILTIN_AGENTS[r].name, description: BUILTIN_AGENTS[r].summary })), agentLists.blankRow];
    const lists: ListRow[][] = [templateRows, agentLists.editRows(KEY, false, "disable"), agentLists.editRows("builtin:secretary", true, "enable"), TOOL_BUNDLES.map((b) => ({ id: `ag:tb:${b.id}`, title: b.title }))];
    for (const rows of lists) {
      expect(rows.length).toBeLessThanOrEqual(10);
      for (const r of rows) {
        expect(r.title.length, r.title).toBeLessThanOrEqual(24);
        if (r.description) expect(r.description.length, r.description).toBeLessThanOrEqual(72);
        expect(r.id.length).toBeLessThanOrEqual(200);
      }
    }
    for (const t of [agentLists.templateButton, agentLists.toolsButton, agentLists.editButton]) expect(t.length).toBeLessThanOrEqual(20);
    for (const t of [agentLists.templateTitle, agentLists.toolsTitle, agentLists.editTitle]) expect(t.length).toBeLessThanOrEqual(24);
    expect(agentLists.editRows("builtin:secretary", true, "disable").some((r) => r.id.startsWith("ag:ed:delete"))).toBe(false);
  });
});
