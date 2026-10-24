import { BRAND } from "@/lib/brand";
import type { MessageRow, MessageType } from "@/lib/db/types";

/**
 * The WhatsApp conversation reader of the admin panel (/admin/users/<id>/conversation): the message as the browser gets
 * it (only what the reader shows — no media URLs, no wa ids), the toolbar's filters and search, the highlight and the
 * stats. Client-safe, pure — tested directly.
 */

export interface ChatMessage {
  id: string;
  /** from עלזה (outbound) */
  out: boolean;
  type: MessageType;
  text: string;
  transcript: string | null;
  tools: string[];
  model: string | null;
  cost: number | null;
  /** stored but never in the model's history (agent management, 0006) */
  hidden: boolean;
  agent: string | null;
  at: string;
}

export function toChatMessage(m: MessageRow): ChatMessage {
  return {
    id: m.id,
    out: m.direction === "out",
    type: m.type,
    text: m.text?.trim() ?? "",
    transcript: m.transcript?.trim() || null,
    tools: m.tools ?? [],
    model: m.model_used,
    cost: typeof m.cost_usd === "number" ? m.cost_usd : null,
    hidden: Boolean(m.hidden_from_model),
    agent: m.agent_key,
    at: m.created_at,
  };
}

// ---------- the tools, in words ----------

const TOOL_LABEL: Record<string, string> = {
  create_reminder: "תזכורת חדשה",
  cancel_reminder: "ביטול תזכורת",
  list_reminders: "רשימת תזכורות",
  create_event: "אירוע ביומן",
  gcal_create_event: "אירוע ביומן",
  update_event: "עדכון אירוע",
  gcal_update_event: "עדכון אירוע",
  delete_event: "מחיקת אירוע",
  gcal_delete_event: "מחיקת אירוע",
  list_events: "קריאת היומן",
  gcal_list_events: "קריאת היומן",
  gcal_free_slots: "זמנים פנויים",
  draft_email: "טיוטת מייל",
  gmail_draft_email: "טיוטת מייל",
  forward_email: "העברת מייל",
  get_email: "קריאת מייל",
  gmail_get_email: "קריאת מייל",
  gmail_get_thread: "שרשור מייל",
  search_emails: "חיפוש במייל",
  gmail_search_emails: "חיפוש במייל",
  gmail_awaiting_reply: "ממתינים לתשובה",
  gmail_read_status: "הרשאת המייל",
  search_files: "חיפוש קבצים",
  gdrive_list_files: "חיפוש קבצים",
  get_file_text: "קריאת קובץ",
  gdrive_get_file_text: "קריאת קובץ",
  sharepoint_get_file_text: "קריאת קובץ",
  sharepoint_search: "חיפוש ב-SharePoint",
  gdrive_save_doc: "שמירת מסמך",
  gdrive_read_status: "הרשאת הקבצים",
  todo_create_task: "משימה חדשה",
  gtasks_create_task: "משימה חדשה",
  todo_list_tasks: "רשימת משימות",
  gtasks_list_tasks: "רשימת משימות",
  remember_fact: "שמירת פרט",
  set_morning_time: "שעת סיכום הבוקר",
  start_agent_creation: "יצירת סוכן",
  start_upgrade: "שדרוג",
  pro_feature: "יכולת של פרו",
  meeting_summary: "סיכום פגישה",
};

/** A tool's name in Hebrew; an unknown tool keeps its own name. */
export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool;
}

// ---------- filters and search ----------

export type ChatFilter = "all" | "user" | "alze" | "tools" | "voice";

export const CHAT_FILTERS: readonly { id: ChatFilter; label: string }[] = [
  { id: "all", label: "הכול" },
  { id: "user", label: "רק הלקוח" },
  { id: "alze", label: `רק ${BRAND.name}` },
  { id: "tools", label: "עם כלים" },
  { id: "voice", label: "קוליות" },
];

export function matchesFilter(m: ChatMessage, f: ChatFilter): boolean {
  switch (f) {
    case "user":
      return !m.out;
    case "alze":
      return m.out;
    case "tools":
      return m.tools.length > 0;
    case "voice":
      return m.type === "audio";
    default:
      return true;
  }
}

/** Lower case, no niqqud or cantillation, one space: "שָׁלוֹם  World" → "שלום world". */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The text, the transcript and the tools' names (raw and in Hebrew) are searched. */
export function matchesQuery(m: ChatMessage, q: string): boolean {
  const needle = normalizeSearch(q);
  if (!needle) return true;
  const hay = normalizeSearch([m.text, m.transcript ?? "", ...m.tools, ...m.tools.map(toolLabel)].join(" \n "));
  return hay.includes(needle);
}

export function filterMessages(messages: readonly ChatMessage[], opts: { filter: ChatFilter; q: string }): ChatMessage[] {
  return messages.filter((m) => matchesFilter(m, opts.filter) && matchesQuery(m, opts.q));
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * The text cut around the matches of `q` (case-insensitive), for <mark>. Matches on the raw text only — a query with
 * niqqud differences still filters (matchesQuery), it just is not marked.
 */
export function highlightParts(text: string, q: string): TextPart[] {
  const needle = q.trim().replace(/\s+/g, " ");
  if (!needle || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const parts: TextPart[] = [];
  let from = 0;
  for (let i = lower.indexOf(n); i !== -1; i = lower.indexOf(n, from)) {
    if (i > from) parts.push({ text: text.slice(from, i), hit: false });
    parts.push({ text: text.slice(i, i + n.length), hit: true });
    from = i + n.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

// ---------- the stats rail ----------

export interface ConversationStats {
  total: number;
  inbound: number;
  outbound: number;
  voice: number;
  first: string | null;
  last: string | null;
  cost: number;
  topTools: { tool: string; label: string; count: number }[];
}

/** Over the messages given (any order). */
export function conversationStats(messages: readonly ChatMessage[], top = 5): ConversationStats {
  let first: string | null = null;
  let last: string | null = null;
  let cost = 0;
  let inbound = 0;
  let voice = 0;
  const tools = new Map<string, number>();
  for (const m of messages) {
    if (!first || m.at < first) first = m.at;
    if (!last || m.at > last) last = m.at;
    cost += m.cost ?? 0;
    if (!m.out) inbound += 1;
    if (m.type === "audio") voice += 1;
    for (const t of m.tools) tools.set(t, (tools.get(t) ?? 0) + 1);
  }
  const topTools = [...tools.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([tool, count]) => ({ tool, label: toolLabel(tool), count }));
  return { total: messages.length, inbound, outbound: messages.length - inbound, voice, first, last, cost, topTools };
}

/** How many messages the reader loads at a time, and how far back the stats look. */
export const CHAT_PAGE = 120;
export const STATS_CAP = 1000;
