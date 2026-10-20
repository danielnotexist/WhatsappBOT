import type { ModelConfig } from '../models.js';
import type { Usage } from '../types.js';
import { computeCost } from '../pricing.js';
import { postJson, stringifyToolOutput } from './http.js';
import type { NeutralMessage, Provider, ProviderResponse, RunOptions, ToolCall, ToolDef } from './types.js';

/**
 * OpenAI-compatible Chat Completions client (also used by OpenRouter).
 * params.request = extra body fields (e.g. reasoning_effort, max_completion_tokens, verbosity).
 */
export interface OpenAIParams {
  request?: Record<string, unknown>;
}

export interface OpenAICompatOptions {
  baseUrl: string;
  apiKeyEnv: string;
  extraHeaders?: Record<string, string>;
  /** OpenRouter: ask for usage.cost in the response. */
  includeUsageCost?: boolean;
  /** Prompt caching hint: OpenAI caches automatically; OpenRouter passes through. */
}

interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatResponse {
  choices?: Array<{
    message?: { role: string; content?: string | null; tool_calls?: ChatToolCall[]; reasoning?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cost?: number;
  };
  error?: { message?: string };
}

function toChatMessages(system: string, messages: NeutralMessage[]): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      if (m.raw) out.push(m.raw);
      else
        out.push({
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls.length
            ? {
                tool_calls: m.toolCalls.map<ChatToolCall>((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: JSON.stringify(c.input) },
                })),
              }
            : {}),
        });
    } else {
      for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: stringifyToolOutput(r.output) });
    }
  }
  return out;
}

function safeParseArgs(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return { _unparsed: args };
  }
}

export function createOpenAICompatProvider(cfg: ModelConfig, o: OpenAICompatOptions): Provider {
  const params = (cfg.params ?? {}) as OpenAIParams;
  return {
    id: cfg.id,
    name: cfg.name,
    model: cfg.model,
    async run(system, messages, tools, opts: RunOptions = {}) {
      const apiKey = process.env[o.apiKeyEnv];
      if (!apiKey) throw new Error(`${o.apiKeyEnv} חסר`);
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: toChatMessages(system, messages),
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.input_schema },
              })),
              tool_choice: 'auto',
            }
          : {}),
        ...(o.includeUsageCost ? { usage: { include: true } } : {}),
        ...(params.request ?? {}),
      };
      const headers: Record<string, string> = { authorization: `Bearer ${apiKey}`, ...(o.extraHeaders ?? {}) };
      const { json, latencyMs } = await postJson<ChatResponse>(`${o.baseUrl}/chat/completions`, headers, body, opts.timeoutMs ?? 90_000, opts.signal);
      if (json.error?.message) throw new Error(`provider error: ${json.error.message}`);
      const choice = json.choices?.[0];
      const msg = choice?.message;
      const text = (msg?.content ?? '').trim();
      const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((c, i) => ({
        id: c.id || `call_${i}`,
        name: c.function?.name ?? '',
        input: safeParseArgs(c.function?.arguments ?? '{}'),
      }));
      const u = json.usage ?? {};
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
      const usage: Usage = { in: Math.max(0, (u.prompt_tokens ?? 0) - cached), out: u.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 };
      const costUsd = typeof u.cost === 'number' ? u.cost : computeCost(cfg.model, usage);
      // raw assistant turn for replay (keeps tool_calls exactly as the API produced them)
      const raw = msg ? { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) } : undefined;
      return { text, toolCalls, usage, latencyMs, costUsd, stopReason: choice?.finish_reason, raw };
    },
  };
}

export function createOpenAIProvider(cfg: ModelConfig): Provider {
  return createOpenAICompatProvider(cfg, {
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKeyEnv: 'OPENAI_API_KEY',
  });
}
