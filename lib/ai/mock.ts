import type { AiProvider, CompletionRequest, CompletionResponse, ToolCall } from "./types";

type Scripted = Partial<CompletionResponse> | ((req: CompletionRequest) => Partial<CompletionResponse>);

const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Deterministic provider for tests and `DATA_MODE=memory` dev runs. Two modes:
 *   - scripted: push responses with `enqueue()`; each `complete()` consumes one.
 *   - heuristic (default): keyword rules in Hebrew that mimic the router / strong behaviour
 *     (classification JSON, tool calls for drafts/meetings, short Hebrew replies).
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly calls: CompletionRequest[] = [];
  private queue: Scripted[] = [];

  enqueue(...responses: Scripted[]): this {
    this.queue.push(...responses);
    return this;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(req);
    const base: CompletionResponse = { text: "", toolCalls: [], stopReason: "end_turn", usage: zeroUsage, costUsd: 0, model: `mock-${req.tier}` };
    const scripted = this.queue.shift();
    if (scripted) return { ...base, ...(typeof scripted === "function" ? scripted(req) : scripted) };
    return { ...base, ...heuristic(req) };
  }
}

function lastUserText(req: CompletionRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    if (m.role === "user") return m.content;
  }
  return "";
}

function hasToolResult(req: CompletionRequest, name: string): boolean {
  return req.messages.some((m) => m.role === "tool" && m.results.some((r) => r.name === name));
}

/** the `reply` a tool suggested (reminder tools return the exact Hebrew answer); `key: "say"` for a consent/status line */
function toolReply(req: CompletionRequest, names: string[], key: "reply" | "say" = "reply"): string | null {
  for (const m of req.messages) {
    if (m.role !== "tool") continue;
    for (const r of m.results) {
      const reply = (r.output as Record<string, unknown> | null)?.[key];
      if (names.includes(r.name) && typeof reply === "string") return reply;
    }
  }
  return null;
}

/** the output of a tool already called this turn */
function toolOutput(req: CompletionRequest, names: string[]): Record<string, unknown> | null {
  for (const m of req.messages) {
    if (m.role !== "tool") continue;
    for (const r of m.results) if (names.includes(r.name)) return (r.output as Record<string, unknown> | null) ?? {};
  }
  return null;
}

const TASK_TOOLS = { create: ["todo_create_task", "gtasks_create_task"], list: ["todo_list_tasks", "gtasks_list_tasks"] };

function heuristic(req: CompletionRequest): Partial<CompletionResponse> {
  const text = lastUserText(req);
  if (req.json) {
    // router classification
    const simple = /^(תודה|היי|שלום|בוקר טוב|ערב טוב|מה שלומך|אוקיי|סבבה|בסדר)/.test(text.trim()) || text.trim().length < 4;
    const intent = /מייל|תנסח|תכתוב|תשלח/.test(text) ? "email" : /פגישה|יומן|תקבע|מחר/.test(text) ? "calendar" : /תזכיר/.test(text) ? "reminder" : /קובץ|מסמך/.test(text) ? "files" : simple ? "smalltalk" : "other";
    return { text: JSON.stringify({ intent, complexity: simple ? "simple" : "tool", needs_tools: !simple, reply: simple ? "בשמחה. אם צריך משהו — אני כאן." : null }) };
  }
  const tools = new Set((req.tools ?? []).map((t) => t.name));
  // reminders (Milestone 5): pass the whole message as `when`; the parser finds the time and the text
  const reminderReply = toolReply(req, ["create_reminder", "list_reminders", "cancel_reminder"]);
  if (reminderReply) return { text: reminderReply };
  // tasks (Microsoft To Do / Google Tasks): a consent line, the "added" echo, or the open tasks as a list
  const taskSay = toolReply(req, [...TASK_TOOLS.create, ...TASK_TOOLS.list], "say") ?? toolReply(req, TASK_TOOLS.create);
  if (taskSay) return { text: taskSay };
  const listed = toolOutput(req, TASK_TOOLS.list) as { tasks?: { title: string; due: string | null }[] } | null;
  if (listed) {
    const rows = (listed.tasks ?? []).slice(0, 8).map((t) => `• ${t.title}${t.due ? ` (עד ${Number(t.due.slice(8, 10))}.${Number(t.due.slice(5, 7))})` : ""}`);
    return { text: rows.length ? `המשימות הפתוחות:\n${rows.join("\n")}` : "אין משימות פתוחות." };
  }
  const createTask = TASK_TOOLS.create.find((t) => tools.has(t));
  if (createTask && /משימה/.test(text) && /תוסיפ|להוסיף|הוסיפ|חדשה/.test(text)) {
    const title = text.replace(/^.*?משימה\s*(חדשה)?\s*[:,-]?\s*/, "").trim() || text;
    return { toolCalls: [{ id: "call_task_1", name: createTask, input: { title, notes: "", due_date: "" } }], stopReason: "tool_use", text: "" };
  }
  const listTasks = TASK_TOOLS.list.find((t) => tools.has(t));
  if (listTasks && /משימות/.test(text)) {
    return { toolCalls: [{ id: "call_tasks_1", name: listTasks, input: { include_completed: false } }], stopReason: "tool_use", text: "" };
  }
  if (tools.has("create_reminder") && /תזכיר|תזכורת ל/.test(text)) {
    return { toolCalls: [{ id: "call_reminder_1", name: "create_reminder", input: { text: "", when: text } }], stopReason: "tool_use", text: "" };
  }
  if (tools.has("list_reminders") && /(אילו|איזה|מה ה)\s*תזכורות|תזכורות פתוחות/.test(text)) {
    return { toolCalls: [{ id: "call_reminders_1", name: "list_reminders", input: {} }], stopReason: "tool_use", text: "" };
  }
  if (tools.has("draft_email") && /מייל|תנסח|תכתוב/.test(text) && !hasToolResult(req, "draft_email")) {
    const to = (text.match(/ל([א-ת]{2,})/)?.[1] ?? "לקוח").replace(/^ל/, "");
    const call: ToolCall = { id: "call_draft_1", name: "draft_email", input: { to_name: to, to_email: `${to}@example.com`, subject: "בהמשך לשיחתנו", body: `שלום ${to},\n\n${text}\n\nבברכה` } };
    return { toolCalls: [call], stopReason: "tool_use", text: "" };
  }
  if (tools.has("create_event") && /תקבע|קבע לי|פגישה חדשה/.test(text) && !hasToolResult(req, "create_event")) {
    const call: ToolCall = { id: "call_event_1", name: "create_event", input: { title: "פגישה", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: [] } };
    return { toolCalls: [call], stopReason: "tool_use", text: "" };
  }
  if (hasToolResult(req, "draft_email")) return { text: "הכנתי טיוטה — לשלוח?" };
  if (hasToolResult(req, "create_event")) return { text: "הפרטים למעלה — לקבוע?" };
  if (/מה יש לי מחר/.test(text)) return { text: "כדי לראות את היומן צריך לחבר את Microsoft 365 או Google. לכתוב \"לחבר את המייל\" ואשלח קישור." };
  return { text: "קיבלתי. מה עוד אפשר לעזור?" };
}
