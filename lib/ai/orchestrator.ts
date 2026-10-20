import type { ConnectionRow, Db, PendingActionRow, UserRow } from "@/lib/db/types";
import { loadMemory } from "./memory";
import { ROUTER_INSTRUCTIONS, buildSystemPrompt } from "./system-prompt";
import { BASE_TOOLS, toolDefinitions, type Tool, type ToolContext } from "./tools";
import type { AiProvider, ChatMessage, CompletionResponse, ToolCall, Usage } from "./types";

export interface AssistantInput {
  db: Db;
  ai: AiProvider;
  user: UserRow;
  connections: ConnectionRow[];
  /** the new inbound message text (or transcript) */
  text: string;
  now?: Date;
  /** extra tools (Graph/Google) registered by later milestones */
  tools?: Tool[];
  maxRounds?: number;
}

export interface AssistantOutput {
  text: string;
  /** actions created during this turn, to render with approval buttons */
  pendingActions: PendingActionRow[];
  model: string;
  usage: Usage;
  costUsd: number | null;
  route: "router" | "strong";
  intent: string;
}

export const PENDING_TTL_MS = 10 * 60_000;

interface RouterVerdict {
  intent: string;
  complexity: "simple" | "tool";
  needs_tools: boolean;
  reply: string | null;
}

export function parseRouterVerdict(text: string): RouterVerdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<RouterVerdict>;
    const complexity = j.complexity === "simple" ? "simple" : "tool";
    return { intent: String(j.intent ?? "other"), complexity, needs_tools: Boolean(j.needs_tools), reply: typeof j.reply === "string" && j.reply.trim() ? j.reply.trim() : null };
  } catch {
    return null;
  }
}

const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });

/**
 * PLAN §2.1: router (cheap) classifies; simple → its own reply; otherwise the strong model runs a bounded
 * tool loop. Outbound tools only create pending actions — execution happens after the user's button press.
 */
export async function runAssistant(input: AssistantInput): Promise<AssistantOutput> {
  const now = input.now ?? new Date();
  const memory = await loadMemory(input.db, input.user.id);
  const system = buildSystemPrompt({
    name: input.user.name,
    businessName: input.user.business_name,
    businessType: input.user.business_type,
    timezone: input.user.timezone,
    morningTime: input.user.morning_time,
    connections: input.connections.filter((c) => c.status === "active").map((c) => ({ provider: c.provider, accountEmail: c.account_email })),
    profile: input.user.profile,
    summary: memory.summary,
    facts: memory.facts,
    now,
  });
  const history: ChatMessage[] = [...memory.history, { role: "user", content: input.text }];
  let usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let cost: number | null = 0;
  const addCost = (r: CompletionResponse) => {
    usage = addUsage(usage, r.usage);
    cost = cost === null || r.costUsd === null ? null : cost + r.costUsd;
  };

  // 1. router
  const routed = await input.ai.complete({ tier: "router", system: `${system}\n\n${ROUTER_INSTRUCTIONS}`, messages: history, json: true, maxTokens: 400 });
  addCost(routed);
  const verdict = parseRouterVerdict(routed.text);
  if (verdict && verdict.complexity === "simple" && verdict.reply) {
    return { text: verdict.reply, pendingActions: [], model: routed.model, usage, costUsd: cost, route: "router", intent: verdict.intent };
  }

  // 2. strong model with tools
  const tools = [...BASE_TOOLS, ...(input.tools ?? [])];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const pendingActions: PendingActionRow[] = [];
  const toolCtx: ToolContext = {
    db: input.db,
    userId: input.user.id,
    now,
    async createPending(kind, payload) {
      const row = await input.db.createPendingAction(input.user.id, kind, payload, new Date(now.getTime() + PENDING_TTL_MS));
      pendingActions.push(row);
      return row;
    },
  };
  const messages: ChatMessage[] = [...history];
  const maxRounds = input.maxRounds ?? 4;
  let last = await input.ai.complete({ tier: "strong", system, messages, tools: toolDefinitions(tools) });
  addCost(last);
  let rounds = 0;
  let text = last.text;
  while (last.toolCalls.length && rounds < maxRounds) {
    rounds++;
    const results = await Promise.all(last.toolCalls.map((c) => runTool(c, byName, toolCtx)));
    messages.push({ role: "assistant", content: last.text, toolCalls: last.toolCalls, raw: last.raw });
    messages.push({ role: "tool", results });
    last = await input.ai.complete({ tier: "strong", system, messages, tools: toolDefinitions(tools) });
    addCost(last);
    text = last.text || text;
  }
  if (!text.trim()) text = pendingActions.length ? "" : "לא הצלחתי להשלים את זה. אפשר לנסח את הבקשה אחרת?";
  return { text, pendingActions, model: last.model, usage, costUsd: cost, route: "strong", intent: verdict?.intent ?? "other" };
}

async function runTool(call: ToolCall, byName: Map<string, Tool>, ctx: ToolContext) {
  const tool = byName.get(call.name);
  if (!tool) return { id: call.id, name: call.name, output: { error: `unknown tool ${call.name}` }, isError: true };
  try {
    return { id: call.id, name: call.name, output: await tool.run(call.input, ctx) };
  } catch (e) {
    return { id: call.id, name: call.name, output: { error: (e as Error).message }, isError: true };
  }
}
