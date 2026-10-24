import { describe, expect, it } from "vitest";
import type { MessageRow } from "@/lib/db/types";
import { CHAT_FILTERS, conversationStats, filterMessages, highlightParts, matchesFilter, matchesQuery, normalizeSearch, toChatMessage, toolLabel, type ChatMessage } from "./conversation";

const row = (over: Partial<MessageRow>): MessageRow => ({
  id: over.id ?? "m",
  user_id: "u",
  wa_message_id: "wamid.secret",
  direction: "in",
  type: "text",
  text: null,
  media_url: "https://media.example/secret",
  transcript: null,
  model_used: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  agent_key: null,
  hidden_from_model: false,
  tools: [],
  created_at: "2026-10-24T08:00:00.000Z",
  ...over,
});

const msgs: ChatMessage[] = [
  row({ id: "1", text: "מה יש לי מחר ביומן?", created_at: "2026-10-22T07:00:00.000Z" }),
  row({ id: "2", direction: "out", text: "מחר שלוש פגישות.", tools: ["gcal_list_events"], model_used: "claude-sonnet-5-5", cost_usd: 0.014, created_at: "2026-10-22T07:00:05.000Z" }),
  row({ id: "3", type: "audio", transcript: "תזכירי לי להתקשר לשמעוני", created_at: "2026-10-23T09:00:00.000Z" }),
  row({ id: "4", direction: "out", type: "button", text: "קבעתי תזכורת. Done?", tools: ["create_reminder", "gcal_list_events"], cost_usd: 0.002, created_at: "2026-10-23T09:00:04.000Z" }),
  row({ id: "5", direction: "out", text: "http://localhost:3000/api/auth/google/start?t=OTI0Yjky", created_at: "2026-10-24T10:00:00.000Z" }),
].map(toChatMessage);

describe("the reader's message", () => {
  it("carries only what the reader shows (no media URL, no WhatsApp id)", () => {
    const m = toChatMessage(row({ id: "x", text: "  שלום  ", hidden_from_model: true }));
    expect(m).toEqual({ id: "x", out: false, type: "text", text: "שלום", transcript: null, tools: [], model: null, cost: null, hidden: true, agent: null, at: "2026-10-24T08:00:00.000Z" });
    expect(JSON.stringify(m)).not.toContain("secret");
  });

  it("tools in words; an unknown tool keeps its name", () => {
    expect(toolLabel("gcal_list_events")).toBe("קריאת היומן");
    expect(toolLabel("create_reminder")).toBe("תזכורת חדשה");
    expect(toolLabel("brand_new_tool")).toBe("brand_new_tool");
  });
});

describe("filters", () => {
  const ids = (list: ChatMessage[]) => list.map((m) => m.id);

  it("הכול / רק הלקוח / רק עלזה / עם כלים / קוליות", () => {
    expect(CHAT_FILTERS.map((f) => f.id)).toEqual(["all", "user", "alze", "tools", "voice"]);
    expect(ids(filterMessages(msgs, { filter: "all", q: "" }))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(filterMessages(msgs, { filter: "user", q: "" }))).toEqual(["1", "3"]);
    expect(ids(filterMessages(msgs, { filter: "alze", q: "" }))).toEqual(["2", "4", "5"]);
    expect(ids(filterMessages(msgs, { filter: "tools", q: "" }))).toEqual(["2", "4"]);
    expect(ids(filterMessages(msgs, { filter: "voice", q: "" }))).toEqual(["3"]);
    expect(matchesFilter(msgs[0]!, "alze")).toBe(false);
  });

  it("search: the text, the transcript and the tools (raw and in Hebrew), case and niqqud aside", () => {
    expect(ids(filterMessages(msgs, { filter: "all", q: "שמעוני" }))).toEqual(["3"]);
    expect(ids(filterMessages(msgs, { filter: "all", q: "done" }))).toEqual(["4"]);
    expect(ids(filterMessages(msgs, { filter: "all", q: "קריאת היומן" }))).toEqual(["2", "4"]);
    expect(ids(filterMessages(msgs, { filter: "all", q: "create_reminder" }))).toEqual(["4"]);
    expect(ids(filterMessages(msgs, { filter: "user", q: "מחר" }))).toEqual(["1"]);
    expect(matchesQuery(msgs[0]!, "   ")).toBe(true);
    expect(normalizeSearch("שָׁלוֹם   World")).toBe("שלום world");
    expect(matchesQuery(toChatMessage(row({ text: "שָׁלוֹם" })), "שלום")).toBe(true);
  });

  it("marks every match, case-insensitive, and keeps the text whole", () => {
    expect(highlightParts("Done and done", "done")).toEqual([
      { text: "Done", hit: true },
      { text: " and ", hit: false },
      { text: "done", hit: true },
    ]);
    expect(highlightParts("שלום", "")).toEqual([{ text: "שלום", hit: false }]);
    expect(highlightParts("אין כאן", "xyz")).toEqual([{ text: "אין כאן", hit: false }]);
    const parts = highlightParts(msgs[4]!.text, "google");
    expect(parts.map((p) => p.text).join("")).toBe(msgs[4]!.text);
  });
});

describe("stats", () => {
  it("counts, first and last, the cost and the most used tools", () => {
    const s = conversationStats(msgs);
    expect(s).toMatchObject({ total: 5, inbound: 2, outbound: 3, voice: 1, first: "2026-10-22T07:00:00.000Z", last: "2026-10-24T10:00:00.000Z" });
    expect(s.cost).toBeCloseTo(0.016);
    expect(s.topTools).toEqual([
      { tool: "gcal_list_events", label: "קריאת היומן", count: 2 },
      { tool: "create_reminder", label: "תזכורת חדשה", count: 1 },
    ]);
    expect(conversationStats([])).toMatchObject({ total: 0, first: null, last: null, cost: 0, topTools: [] });
  });
});
