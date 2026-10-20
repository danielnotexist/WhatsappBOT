import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { MockProvider } from "./mock";
import { MEMORY, maybeSummarize, parseSummary, toHistory } from "./memory";
import type { MessageRow } from "@/lib/db/types";

const row = (direction: "in" | "out", text: string, i: number): MessageRow => ({ id: `m${i}`, user_id: "u", wa_message_id: direction === "in" ? `w${i}` : null, direction, type: "text", text, media_url: null, transcript: null, model_used: null, tokens_in: null, tokens_out: null, cost_usd: null, created_at: new Date(2026, 9, 20, 8, i).toISOString() });

describe("memory", () => {
  it("builds alternating history starting with the user and merges consecutive turns", () => {
    const h = toHistory([row("out", "ברוכים הבאים", 0), row("in", "היי", 1), row("in", "מה יש לי מחר", 2), row("out", "כלום", 3)]);
    expect(h).toEqual([
      { role: "user", content: "היי\nמה יש לי מחר" },
      { role: "assistant", content: "כלום" },
    ]);
  });

  it("parses the summary and trailing facts JSON", () => {
    expect(parseSummary('סיכום בשורה.\n{"facts": ["הרו\\"ח הוא ברק", "סיכום בוקר ב-7"]}')).toEqual({ summary: "סיכום בשורה.", facts: ['הרו"ח הוא ברק', "סיכום בוקר ב-7"] });
    expect(parseSummary("רק סיכום")).toEqual({ summary: "רק סיכום", facts: [] });
  });

  it("summarizes every 20 messages and keeps facts across runs", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider();
    for (let i = 0; i < MEMORY.summarizeEvery - 1; i++) await db.insertMessage({ user_id: user.id, direction: i % 2 ? "out" : "in", wa_message_id: i % 2 ? null : `w${i}`, text: `הודעה ${i}` });
    expect(await maybeSummarize(db, ai, user)).toBe(false);
    await db.insertMessage({ user_id: user.id, direction: "out", text: "אחרונה" });
    ai.enqueue({ text: 'המשתמש ביקש סיכומים.\n{"facts": ["עובדת עם Outlook"]}' });
    expect(await maybeSummarize(db, ai, user)).toBe(true);
    const state = await db.getConversationState(user.id);
    expect(state?.summary).toBe("המשתמש ביקש סיכומים.");
    expect(state?.facts).toEqual(["עובדת עם Outlook"]);
    expect(state?.last_summarized_msg_id).toBeTruthy();
    // nothing new → no second summary
    expect(await maybeSummarize(db, ai, user)).toBe(false);
    expect(ai.calls).toHaveLength(1);
  });
});
