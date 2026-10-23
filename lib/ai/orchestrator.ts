import { toolsForAgent } from "@/lib/agents/capabilities";
import { dailyCapMessage, guardAgentAction } from "@/lib/agents/guard";
import { maxOutboundPerDay, type ResolvedAgent } from "@/lib/agents/policy";
import { agentChoices, buildAgentSection, buildRouterAgentBlock } from "@/lib/agents/prompt";
import { AgentDailyCapError } from "@/lib/db/errors";
import type { AgentKey, ConnectionRow, Db, PendingActionRow, UserRow } from "@/lib/db/types";
import { loadMemory } from "./memory";
import { ROUTER_INSTRUCTIONS, buildSystemPrompt } from "./system-prompt";
import { BASE_TOOLS, toolDefinitions, type OnlineMeetingCheck, type Tool, type ToolContext } from "./tools";
import type { AiProvider, ChatMessage, CompletionResponse, ToolCall, Usage } from "./types";

/** How an agent turn was chosen: an explicit address (§5.2), the sticky agent, or the router's pick (§5.4). */
export type AgentVia = "mention" | "command" | "vocative" | "sticky" | "router";

export interface AssistantInput {
  db: Db;
  ai: AiProvider;
  user: UserRow;
  connections: ConnectionRow[];
  /** the new inbound message text (or transcript) — after an explicit address, only the rest */
  text: string;
  now?: Date;
  /** extra tools (Graph/Google) registered by later milestones */
  tools?: Tool[];
  /** asks the account whether it can create an online meeting before a draft names one (ToolContext.onlineMeetingCheck) */
  onlineMeetingCheck?: OnlineMeetingCheck;
  maxRounds?: number;
  /** an explicitly addressed, available agent ("@מזכירה …") — the router is skipped */
  agent?: ResolvedAgent | null;
  agentVia?: "mention" | "command" | "vocative";
  /** the user's available agents (active only); the router may pick one when the message clearly belongs to it */
  agentChoices?: ResolvedAgent[];
  /** the last agent that answered, while still sticky (10 minutes) — a hint for the router */
  activeAgentKey?: string | null;
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
  /** the agent that answered (the pipeline adds its header), or null for the main assistant */
  agent: { key: AgentKey; name: string } | null;
  agentVia: AgentVia | null;
}

export const PENDING_TTL_MS = 10 * 60_000;

interface RouterVerdict {
  intent: string;
  complexity: "simple" | "tool";
  needs_tools: boolean;
  reply: string | null;
  /** a1…aN from the agent block, only when it names an offered choice; anything else → null */
  agent: string | null;
}

export function parseRouterVerdict(text: string, choiceIds: readonly string[] = []): RouterVerdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<RouterVerdict>;
    const complexity = j.complexity === "simple" ? "simple" : "tool";
    const agent = typeof j.agent === "string" && choiceIds.includes(j.agent) ? j.agent : null;
    return { intent: String(j.intent ?? "other"), complexity, needs_tools: Boolean(j.needs_tools), reply: typeof j.reply === "string" && j.reply.trim() ? j.reply.trim() : null, agent };
  } catch {
    return null;
  }
}

const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });

/**
 * PLAN §2.1: router (cheap) classifies; simple → its own reply; otherwise the strong model runs a bounded
 * tool loop. Outbound tools only create pending actions — execution happens after the user's button press.
 *
 * Agents (docs/design/agents.md §7.1): an explicit address skips the router; otherwise the router may pick one of the
 * offered agents. In an agent turn the system prompt gets the agent section at the end, the tools are filtered by the
 * agent's capabilities (the definitions sent to the model AND the lookup that runs them — I2), and every draft passes
 * guardAgentAction and carries the agent's key and name. Main-assistant turns are unchanged.
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

  let agent: ResolvedAgent | null = input.agent ?? null;
  let via: AgentVia | null = agent ? (input.agentVia ?? "mention") : null;
  let verdict: RouterVerdict | null = null;

  // 1. router — skipped when the user addressed an agent explicitly (saves a call and the wait)
  if (!agent) {
    const choices = agentChoices((input.agentChoices ?? []).filter((a) => a.status === "active" && a.key));
    const activeId = choices.find((c) => c.agent.key === input.activeAgentKey)?.id ?? null;
    const routerSystem = [system, ROUTER_INSTRUCTIONS, buildRouterAgentBlock(choices, activeId)].filter(Boolean).join("\n\n");
    const routed = await input.ai.complete({ tier: "router", system: routerSystem, messages: history, json: true, maxTokens: 1024 }); // adaptive thinking shares this budget (eval p95 ≈ 470 output tokens)
    addCost(routed);
    verdict = parseRouterVerdict(routed.text, choices.map((c) => c.id));
    const picked = verdict?.agent ? (choices.find((c) => c.id === verdict!.agent)?.agent ?? null) : null;
    if (picked) {
      agent = picked;
      via = picked.key === input.activeAgentKey ? "sticky" : "router";
    } else if (verdict && verdict.complexity === "simple" && verdict.reply) {
      return { text: verdict.reply, pendingActions: [], model: routed.model, usage, costUsd: cost, route: "router", intent: verdict.intent, agent: null, agentVia: null };
    }
  }

  // 2. strong model with tools (an agent: its section, its tools, its guard)
  const allTools = [...BASE_TOOLS, ...(input.tools ?? [])];
  const tools = agent ? toolsForAgent(allTools, agent.capabilities) : allTools;
  const strongSystem = agent ? `${system}\n\n${buildAgentSection(agent)}` : system;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const pendingActions: PendingActionRow[] = [];
  const turnAgent = agent;
  // The tool calls of one model response run in parallel (Promise.all below), but drafts are created one at a time:
  // the guard counts the agent's drafts and the insert lands before the next draft is checked, so parallel calls
  // cannot all pass the daily cap. Messages processed at the same time are covered by the database trigger.
  let lane: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = lane.then(fn);
    lane = run.catch(() => undefined);
    return run;
  };
  const toolCtx: ToolContext = {
    db: input.db,
    userId: input.user.id,
    now,
    checksRecipients: Boolean(turnAgent?.permissions.recipients?.length),
    onlineMeetingCheck: input.onlineMeetingCheck,
    createPending: (kind, payload) =>
      oneAtATime(async () => {
        if (turnAgent) {
          const refused = await guardAgentAction(input.db, input.user.id, turnAgent, kind, payload, now, input.user.timezone);
          if (refused) throw new Error(refused);
        }
        const meta = turnAgent ? { agentKey: turnAgent.key, agentName: turnAgent.name } : undefined;
        try {
          const row = await input.db.createPendingAction(input.user.id, kind, payload, new Date(now.getTime() + PENDING_TTL_MS), meta);
          pendingActions.push(row);
          return row;
        } catch (e) {
          if (turnAgent && e instanceof AgentDailyCapError) throw new Error(dailyCapMessage(turnAgent.name, e.cap ?? maxOutboundPerDay(turnAgent.permissions)));
          throw e;
        }
      }),
  };
  const messages: ChatMessage[] = [...history];
  const maxRounds = input.maxRounds ?? 4;
  let last = await input.ai.complete({ tier: "strong", system: strongSystem, messages, tools: toolDefinitions(tools) });
  addCost(last);
  let rounds = 0;
  let text = last.text;
  while (last.toolCalls.length && rounds < maxRounds) {
    rounds++;
    const results = await Promise.all(last.toolCalls.map((c) => runTool(c, byName, toolCtx)));
    messages.push({ role: "assistant", content: last.text, toolCalls: last.toolCalls, raw: last.raw });
    messages.push({ role: "tool", results });
    last = await input.ai.complete({ tier: "strong", system: strongSystem, messages, tools: toolDefinitions(tools) });
    addCost(last);
    text = last.text || text;
  }
  if (!text.trim()) text = pendingActions.length ? "" : "לא הצלחתי להשלים את זה. אפשר לנסח את הבקשה אחרת?";
  return {
    text,
    pendingActions,
    model: last.model,
    usage,
    costUsd: cost,
    route: "strong",
    intent: verdict?.intent ?? "other",
    agent: agent ? { key: agent.key, name: agent.name } : null,
    agentVia: via,
  };
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
