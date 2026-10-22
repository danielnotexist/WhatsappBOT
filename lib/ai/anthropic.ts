import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { liveAiInDemo, requireEnv } from "@/lib/env";
import { AiProviderError, type AiProvider, type ChatMessage, type CompletionRequest, type CompletionResponse, type ModelTier, type ToolCall } from "./types";

/**
 * Model ids per tier — locked by the Hebrew eval (docs/hebrew-eval-report.md, run m0-20261020, 21.10.2026):
 *  - router = Claude Haiku 5.5, adaptive thinking, effort low: classifies every message and answers only the simple
 *    ones itself. On the 17 simple messages it scored 3.81 overall / safety 5.00 (Sonnet: 3.79 / 5.00) at $0.0005 per
 *    message (15× cheaper); with thinking off it leaked English in 14/100 answers, with adaptive in 1/100.
 *    It does NOT pass the bar for tool/complex work (Hebrew 3.73 < 4.0) — those always go to the strong tier.
 *  - strong = Claude Sonnet 5.5, adaptive thinking, effort low: best overall (3.89; Hebrew 4.03; 0 sends without approval).
 * Override with AI_ROUTER_MODEL / AI_STRONG_MODEL.
 */
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  router: process.env.AI_ROUTER_MODEL || "claude-haiku-5-5",
  strong: process.env.AI_STRONG_MODEL || "claude-sonnet-5-5",
};

/** USD per 1M tokens — verified 2026-10-20 (claude-api skill). */
const PRICING: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

/** The output ceiling of a request (thinking tokens count toward it) — also the spend guard's upper bound. */
export function maxTokensFor(req: Pick<CompletionRequest, "tier" | "maxTokens">): number {
  return req.maxTokens ?? (req.tier === "router" ? 1024 : 4096);
}

/**
 * The SDK's per-request timeout and retries. The live demo answers inside one web request (app/api/demo/chat,
 * maxDuration 60 s) with up to six model calls per message, so it waits less and retries once; the spend guard's
 * per-turn deadline (lib/ai/budget.ts) aborts whatever is still running before the platform kills the function.
 */
export const ANTHROPIC_REQUEST = { timeoutMs: 60_000, maxRetries: 2 } as const;
export const ANTHROPIC_REQUEST_DEMO = { timeoutMs: 25_000, maxRetries: 1 } as const;

function toAnthropicMessages(messages: ChatMessage[]): MessageParam[] {
  return messages.map((m): MessageParam => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "assistant") {
      // Replay the raw content when we have it (keeps thinking blocks intact for the model that produced them).
      if (Array.isArray(m.raw)) return { role: "assistant", content: m.raw as MessageParam["content"] };
      const content: Exclude<MessageParam["content"], string> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      return { role: "assistant", content };
    }
    return {
      role: "user",
      content: m.results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: typeof r.output === "string" ? r.output : JSON.stringify(r.output),
        ...(r.isError ? { is_error: true } : {}),
      })),
    };
  });
}

/**
 * Anthropic Messages API via the official SDK. Adaptive thinking at low effort on both tiers
 * (thinking-off leaked English reasoning in the Hebrew eval), prompt caching on the system block,
 * strict tools with tool_choice auto (forced tool_choice is rejected on Sonnet 5.5).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(opts: { apiKey: string; fetch?: typeof fetch; models?: Partial<Record<ModelTier, string>>; baseURL?: string; timeoutMs?: number; maxRetries?: number }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetch, baseURL: opts.baseURL, maxRetries: opts.maxRetries ?? ANTHROPIC_REQUEST.maxRetries, timeout: opts.timeoutMs ?? ANTHROPIC_REQUEST.timeoutMs });
    this.models = { ...DEFAULT_MODELS, ...opts.models };
  }

  readonly models: Record<ModelTier, string>;

  /** Hebrew EnvError when ANTHROPIC_API_KEY is missing. The live demo gets the shorter timeout and fewer retries. */
  static fromEnv(fetchImpl?: typeof fetch, source: Record<string, string | undefined> = process.env): AnthropicProvider {
    const request = liveAiInDemo(source) ? ANTHROPIC_REQUEST_DEMO : ANTHROPIC_REQUEST;
    return new AnthropicProvider({ apiKey: requireEnv(["ANTHROPIC_API_KEY"], source).ANTHROPIC_API_KEY, fetch: fetchImpl, ...request });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const model = this.models[req.tier];
    const tools: Tool[] = (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Tool["input_schema"], strict: true }));
    try {
      const res = await this.client.messages.create(
        {
          model,
          // Thinking tokens count toward max_tokens (adaptive is on for both tiers) — keep headroom.
          max_tokens: maxTokensFor(req),
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: toAnthropicMessages(req.messages),
          ...(tools.length ? { tools, tool_choice: { type: "auto" } } : {}),
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
        },
        req.signal ? { signal: req.signal } : undefined,
      );
      const text = res.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const toolCalls: ToolCall[] = res.content
        .filter((b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
      const usage = {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      };
      return { text, toolCalls, stopReason: res.stop_reason ?? "end_turn", usage, costUsd: costUsd(model, usage), model, raw: res.content };
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        const status = e.status ?? 0;
        throw new AiProviderError(`Anthropic ${status}: ${e.message}`, status === 429 || status >= 500 || status === 408, status);
      }
      if (e instanceof Anthropic.APIConnectionError) throw new AiProviderError(`Anthropic connection: ${e.message}`, true);
      throw e;
    }
  }
}
