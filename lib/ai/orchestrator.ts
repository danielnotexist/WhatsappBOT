import { toolsForAgent } from "@/lib/agents/capabilities";
import { dailyCapMessage, guardAgentAction } from "@/lib/agents/guard";
import { maxOutboundPerDay, type ResolvedAgent } from "@/lib/agents/policy";
import { agentChoices, buildAgentSection, buildRouterAgentBlock } from "@/lib/agents/prompt";
import { connectionsInForce, providerGate } from "@/lib/billing/plans";
import { activeServicesFor, envReadGates } from "@/lib/connections/services";
import { AgentDailyCapError } from "@/lib/db/errors";
import type { AgentKey, ConnectionRow, Db, PendingActionRow, UserRow } from "@/lib/db/types";
import type { ReplyButton } from "@/lib/wa/types";
import type { AccountContext } from "./account-context";
import { loadMemory } from "./memory";
import { toolsForPlan } from "./plan-tools";
import { ROUTER_INSTRUCTIONS, buildSystemPrompt } from "./system-prompt";
import { BASE_TOOLS, toolDefinitions, type AssistantFlow, type OnlineMeetingCheck, type Tool, type ToolContext } from "./tools";
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
  /** the plan in force and what is left of it (lib/ai/account-context.ts) — the facts behind "איזה מנוי אני?" */
  account?: AccountContext | null;
  /**
   * the stored row of this inbound message: memory leaves it out, because `text` is appended as the last user turn (it
   * is the transcript, or the rest after an agent address) — otherwise the model saw every message twice
   */
  inboundId?: string;
}

export interface AssistantOutput {
  text: string;
  /** actions created during this turn, to render with approval buttons */
  pendingActions: PendingActionRow[];
  /** flows the pipeline runs after the turn (start_upgrade / start_agent_creation); their messages are the answer */
  flows: AssistantFlow[];
  /**
   * with a flow: the text answers something besides it (another tool ran — "the last mail, and how do I upgrade?" —
   * and the text is not a one-liner), so the pipeline sends it before the flow's messages
   */
  textBeyondFlows: boolean;
  /** the tools that ran in this turn, by name (the pipeline: set_morning_time answered the open onboarding question) */
  toolsUsed: string[];
  /** quick-reply buttons for the reply (a reminder set after midnight: "move it to the next date") */
  replyButtons: ReplyButton[];
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

/** The router's verdict as a JSON schema — sent as structured output, so the reply is always parseable JSON. */
export const ROUTER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["email", "calendar", "files", "reminder", "summary", "account", "smalltalk", "meta", "control", "other"] },
    complexity: { type: "string", enum: ["simple", "tool"] },
    needs_tools: { type: "boolean" },
    reply: { anyOf: [{ type: "string" }, { type: "null" }] },
    agent: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["intent", "complexity", "needs_tools", "reply", "agent"],
  additionalProperties: false,
};

/**
 * Questions the router may never answer itself, whatever it returned: the plan, upgrading, agents, permissions of a
 * connection (Drive, Meet, Teams). Those answers come from the strong model with the account facts and its tools —
 * Haiku's own "simple" replies here were "לא, אני לא יכולה ליצור סוכנים" and "כתוב 'מנוי פרו'".
 */
const ACCOUNT_TOPIC = /(?<![א-ת])(?:[להבוש]?(?:גישה|מנוי|מינוי|מסלול|מסלולים|סוכן|סוכנים|סוכנת|שדרוג|פרו|דרייב|מיט|טימס|תשלום|חיוב)|[א-ת]*שדרג[א-ת]*|[א-ת]*הרשא[א-ת]*)(?![א-ת])|\b(?:drive|meet|teams|upgrade|pro|plan|agents?)\b/i;
/** A router reply that addresses the user by gender ("אם תרצה", "אתה") is not sent; the strong model answers. */
const GENDERED_REPLY = /אם תרצ|תצטר[כך]|תרצי|אחרי שתאשר|(?<![א-ת])(?:אתה|כתוב|כתבי|שלח\/י)(?![א-ת])|(?<![א-ת])את או אתה/;

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
  const memory = await loadMemory(input.db, input.user.id, { exclude: input.inboundId });
  // the plan decides which accounts and services the turn has (lib/billing/plans.ts entitlements; unknown → as given)
  const plan = input.account?.plan ?? null;
  const paused = plan ? providerGate(input.connections, plan).paused : [];
  // only active connections of the accounts in force, the newest per provider — the one the tools use (lib/ms,
  // lib/google active*Connection)
  const active = (plan ? connectionsInForce(input.connections, plan) : input.connections).filter((c) => c.status === "active");
  const inUse = (["microsoft", "google"] as const).map((p) => active.findLast((c) => c.provider === p)).filter((c): c is ConnectionRow => Boolean(c));
  const system = buildSystemPrompt({
    name: input.user.name,
    businessName: input.user.business_name,
    businessType: input.user.business_type,
    timezone: input.user.timezone,
    morningTime: input.user.morning_time,
    connections: inUse.map((c) => ({ provider: c.provider, accountEmail: c.account_email, scopes: c.scopes, services: activeServicesFor(c, envReadGates(), plan ?? "pro") })),
    pausedProviders: paused,
    profile: input.user.profile,
    summary: memory.summary,
    facts: memory.facts,
    now,
    account: input.account ?? null,
    agentNames: (input.agentChoices ?? []).filter((a) => a.status === "active").map((a) => a.name),
    gmailRead: (input.tools ?? []).some((t) => t.name === "gmail_search_emails"),
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
    const routed = await input.ai.complete({ tier: "router", system: routerSystem, messages: history, json: true, jsonSchema: ROUTER_SCHEMA, maxTokens: 1024 }); // adaptive thinking shares this budget (eval p95 ≈ 470 output tokens)
    addCost(routed);
    verdict = parseRouterVerdict(routed.text, choices.map((c) => c.id));
    const picked = verdict?.agent ? (choices.find((c) => c.id === verdict!.agent)?.agent ?? null) : null;
    if (picked) {
      agent = picked;
      via = picked.key === input.activeAgentKey ? "sticky" : "router";
    } else if (verdict && verdict.complexity === "simple" && verdict.reply && routerMayAnswer(verdict, input.text)) {
      return { text: verdict.reply, pendingActions: [], flows: [], textBeyondFlows: false, toolsUsed: [], replyButtons: [], model: routed.model, usage, costUsd: cost, route: "router", intent: verdict.intent, agent: null, agentVia: null };
    }
  }

  // 2. strong model with tools (an agent: its section, its tools, its guard)
  // the plan's gate by tool name (pro tools out, `pro_feature` in), then the agent's capabilities on what is left
  const allTools = toolsForPlan([...BASE_TOOLS, ...(input.tools ?? [])], plan);
  const tools = agent ? toolsForAgent(allTools, agent.capabilities) : allTools;
  const strongSystem = agent ? `${system}\n\n${buildAgentSection(agent)}` : system;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const pendingActions: PendingActionRow[] = [];
  const flows: AssistantFlow[] = [];
  const looseButtons: ReplyButton[] = [];
  const keyedButtons = new Map<string, ReplyButton[]>();
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
    requestFlow: (flow) => {
      if (!flows.includes(flow)) flows.push(flow);
    },
    addReplyButtons: (buttons, key) => {
      if (key) keyedButtons.set(key, buttons);
      else looseButtons.push(...buttons);
    },
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
  let otherTools = false; // a tool besides the account tools ran in this turn
  const toolsUsed = new Set<string>();
  let last = await input.ai.complete({ tier: "strong", system: strongSystem, messages, tools: toolDefinitions(tools) });
  addCost(last);
  let rounds = 0;
  let text = last.text;
  while (last.toolCalls.length && rounds < maxRounds) {
    rounds++;
    if (last.toolCalls.some((c) => !FLOW_TOOLS.has(c.name))) otherTools = true;
    for (const c of last.toolCalls) toolsUsed.add(c.name);
    const results = await Promise.all(last.toolCalls.map((c) => runTool(c, byName, toolCtx)));
    messages.push({ role: "assistant", content: last.text, toolCalls: last.toolCalls, raw: last.raw });
    messages.push({ role: "tool", results });
    last = await input.ai.complete({ tier: "strong", system: strongSystem, messages, tools: toolDefinitions(tools) });
    addCost(last);
    text = last.text || text;
  }
  if (!text.trim()) text = pendingActions.length || flows.length ? "" : "לא הצלחתי להשלים את זה. אפשר לנסח את הבקשה אחרת?";
  return {
    text,
    pendingActions,
    flows,
    textBeyondFlows: flows.length > 0 && otherTools && text.trim().length >= 80,
    toolsUsed: [...toolsUsed],
    replyButtons: distinctButtons([...looseButtons, ...[...keyedButtons.values()].flat()]),
    model: last.model,
    usage,
    costUsd: cost,
    route: "strong",
    intent: verdict?.intent ?? "other",
    agent: agent ? { key: agent.key, name: agent.name } : null,
    agentVia: via,
  };
}

const FLOW_TOOLS = new Set(["start_upgrade", "start_agent_creation"]);

/** The router's own reply is sent only for what it may answer: never the account, upgrade, agents or permissions. */
function routerMayAnswer(verdict: RouterVerdict, text: string): boolean {
  return verdict.intent !== "account" && !ACCOUNT_TOPIC.test(text) && !GENDERED_REPLY.test(verdict.reply ?? "");
}

/** WhatsApp reply buttons: at most 3, distinct ids AND distinct titles (the API rejects two buttons with one title). */
export function distinctButtons(buttons: readonly ReplyButton[]): ReplyButton[] {
  const out: ReplyButton[] = [];
  for (const b of buttons) if (out.length < 3 && !out.some((x) => x.id === b.id || x.title === b.title)) out.push(b);
  return out;
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
