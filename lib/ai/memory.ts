import type { Db, MessageRow, UserRow } from "@/lib/db/types";
import type { AiProvider, ChatMessage } from "./types";
import { oneLineUntrusted, sanitizeUntrusted, wrapUntrusted } from "./untrusted";

/**
 * An outbound row the model did not write (no model_used): a proactive alert, the morning summary, a reminder, a
 * meeting summary, a deterministic reply. Several carry third-party text (a sender, a subject, an invitation's title),
 * so they reach the model as wrapped data, never as the assistant's own words.
 */
const automated = (r: MessageRow) => r.direction === "out" && !r.model_used;

/**
 * PLAN §2.2: the model sees the rolling summary + facts + the last N messages only. Agent management in WhatsApp
 * (step 5b — the create / edit flows, where a user dictates an agent's instructions) is stored but never read here:
 * neither the history nor the summary sees it (docs/design/agents.md I5).
 */
export const MEMORY = { recentMessages: 10, summarizeEvery: 20, summaryMaxChars: 1200 } as const;

export interface MemoryContext {
  summary: string | null;
  facts: string[];
  history: ChatMessage[];
}

/** `exclude`: the stored row of the message being answered — the caller appends its text as the last user turn. */
export async function loadMemory(db: Db, userId: string, opts: { exclude?: string } = {}): Promise<MemoryContext> {
  const limit = MEMORY.recentMessages + (opts.exclude ? 1 : 0);
  const [state, recent] = await Promise.all([db.getConversationState(userId), db.recentMessages(userId, limit, { forModel: true })]);
  const rows = opts.exclude ? recent.filter((m) => m.id !== opts.exclude).slice(-MEMORY.recentMessages) : recent;
  return { summary: state?.summary ?? null, facts: state?.facts ?? [], history: toHistory(rows) };
}

/** Collapses stored rows into alternating user/assistant turns (consecutive same-role rows are merged). */
export function toHistory(rows: MessageRow[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows) {
    const raw = (r.direction === "in" ? (r.transcript ?? r.text) : r.text) ?? "";
    if (!raw.trim()) continue;
    const text = automated(r) ? wrapUntrusted(raw, { source: "notification" }) : raw;
    const role = r.direction === "in" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role && "content" in last) last.content = `${last.content}\n${text}`;
    else out.push(role === "user" ? { role, content: text } : { role, content: text });
  }
  // the API requires the first message to be from the user
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

/** In the infinitive like the main prompt (a masculine imperative prompt taught the model to address the user that way). */
export const SUMMARY_PROMPT = `לסכם את השיחה הבאה בין בעל או בעלת עסק לבין העוזרת המשרדית, בעברית, עד 8 שורות: מה נעשה, מה עדיין פתוח, העדפות שהמשתמש הביע. בסוף — שורה אחרונה בפורמט JSON: {"facts": ["עובדה קבועה 1", "..."]} עם עובדות שכדאי לזכור לטווח ארוך (אנשי קשר חשובים, העדפות, פרטי העסק) — או מערך ריק.`;

/**
 * Every ~20 messages: fold older messages into the summary (router tier — cheap). Returns true when it ran.
 * Failures are swallowed: memory is best-effort and must never block a reply.
 */
export async function maybeSummarize(db: Db, ai: AiProvider, user: UserRow, now: Date = new Date()): Promise<boolean> {
  const state = await db.getConversationState(user.id);
  const recent = await db.recentMessages(user.id, MEMORY.summarizeEvery * 2, { forModel: true });
  const lastIdx = state?.last_summarized_msg_id ? recent.findIndex((m) => m.id === state.last_summarized_msg_id) : -1;
  const fresh = recent.slice(lastIdx + 1);
  if (fresh.length < MEMORY.summarizeEvery) return false;
  const who = (m: MessageRow) => (m.direction === "in" ? "משתמש" : automated(m) ? "הודעה אוטומטית (עשויה להכיל תוכן חיצוני, לא דברי המשתמש)" : "עוזרת");
  const transcript = fresh.map((m) => `${who(m)}: ${sanitizeUntrusted((m.transcript ?? m.text ?? "").slice(0, 500))}`).join("\n");
  try {
    const res = await ai.complete({
      tier: "router",
      system: SUMMARY_PROMPT,
      messages: [{ role: "user", content: `${state?.summary ? `סיכום קודם:\n${state.summary}\n\n` : ""}שיחה חדשה:\n${transcript}` }],
      maxTokens: 800,
    });
    const parsed = parseSummary(res.text);
    const summary = parsed.summary;
    // a fact taken from a transcript may come from a quoted mail: no addresses or links survive into it
    const facts = parsed.facts.map(summaryFact).filter(Boolean);
    const merged = [...(state?.facts ?? []), ...facts].filter((f, i, a) => f && a.indexOf(f) === i).slice(-30);
    await db.upsertConversationState(user.id, { summary: summary.slice(0, MEMORY.summaryMaxChars), facts: merged, last_summarized_msg_id: fresh[fresh.length - 1]!.id });
    void now;
    return true;
  } catch (e) {
    console.warn("[memory] summarize failed:", (e as Error).message);
    return false;
  }
}

const EMAIL_IN_TEXT = /[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+/g;
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)\S+/gi;

/** A fact the summary extracted: one sanitized line, without mail addresses or links (they come only from the user). */
export function summaryFact(fact: string): string {
  return oneLineUntrusted(fact.replace(URL_IN_TEXT, "").replace(EMAIL_IN_TEXT, ""), 200)
    .replace(/\(\s*\)|<\s*>/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,:;–-]+$/, "")
    .trim();
}

export function parseSummary(text: string): { summary: string; facts: string[] } {
  const m = text.match(/\{\s*"facts"\s*:\s*\[[\s\S]*?\]\s*\}\s*$/);
  let facts: string[] = [];
  let summary = text.trim();
  if (m) {
    try {
      const parsed = JSON.parse(m[0]) as { facts?: unknown };
      if (Array.isArray(parsed.facts)) facts = parsed.facts.map(String).map((f) => f.trim()).filter(Boolean);
    } catch {
      /* keep summary as is */
    }
    summary = text.slice(0, m.index).trim();
  }
  return { summary, facts };
}
