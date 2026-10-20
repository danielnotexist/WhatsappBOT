import type { ModelConfig } from '../models.js';
import type { Usage } from '../types.js';
import { computeCost } from '../pricing.js';
import { postJson, stringifyToolOutput } from './http.js';
import type { NeutralMessage, Provider, ProviderResponse, RunOptions, ToolCall, ToolDef } from './types.js';

/**
 * Anthropic Messages API (raw fetch). Parameters per the claude-api skill (2026-10):
 *  - thinking: "disabled" (Haiku 5.5, effort <= high) | "adaptive" | "between_tools" (Sonnet 5.5 only) | "omit"
 *  - effort: low | medium | high | xhigh | max  -> output_config.effort
 *  - forced tool_choice is rejected on Sonnet 5.5 -> always tool_choice:auto + strict:true tools
 *  - prompt caching: cache_control on the system block (covers tools + system prefix; min 512 tokens on 5.5 models)
 */
export interface AnthropicParams {
  thinking?: 'disabled' | 'adaptive' | 'between_tools' | 'omit';
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  max_tokens?: number;
  betas?: string[];
  /** Extra top-level request fields (escape hatch). */
  request?: Record<string, unknown>;
}

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [k: string]: unknown;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicBlock[];
  stop_reason: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string } | null;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function toAnthropicMessages(messages: NeutralMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      if (m.raw) return { role: 'assistant', content: m.raw };
      const blocks: unknown[] = [];
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      return { role: 'assistant', content: blocks };
    }
    return {
      role: 'user',
      content: m.results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: stringifyToolOutput(r.output),
        ...(r.isError ? { is_error: true } : {}),
      })),
    };
  });
}

export function anthropicRequestBody(model: string, params: AnthropicParams, system: string, messages: NeutralMessage[], tools: ToolDef[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: params.max_tokens ?? 4096,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: toAnthropicMessages(messages),
  };
  if (tools.length > 0) {
    body['tools'] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true }));
    body['tool_choice'] = { type: 'auto' };
  }
  const thinking = params.thinking ?? 'adaptive';
  if (thinking === 'disabled') body['thinking'] = { type: 'disabled' };
  else if (thinking === 'adaptive') body['thinking'] = { type: 'adaptive' };
  else if (thinking === 'between_tools') body['thinking'] = { type: 'between_tools' };
  if (params.effort) body['output_config'] = { effort: params.effort };
  if (params.request) Object.assign(body, params.request);
  return body;
}

export function parseAnthropicResponse(model: string, json: AnthropicResponse, latencyMs: number): ProviderResponse {
  const content = Array.isArray(json.content) ? json.content : [];
  const text = content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
  const toolCalls: ToolCall[] = content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: String(b.id), name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> }));
  const u = json.usage ?? {};
  const usage: Usage = {
    in: u.input_tokens ?? 0,
    out: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
  const stopReason =
    json.stop_reason === 'refusal'
      ? `refusal${json.stop_details?.category ? `:${json.stop_details.category}` : ''}`
      : (json.stop_reason ?? undefined);
  return { text, toolCalls, usage, latencyMs, costUsd: computeCost(model, usage), stopReason, raw: content };
}

export function createAnthropicProvider(cfg: ModelConfig): Provider {
  const params = (cfg.params ?? {}) as AnthropicParams;
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  return {
    id: cfg.id,
    name: cfg.name,
    model: cfg.model,
    async run(system, messages, tools, opts: RunOptions = {}) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY חסר');
      const headers: Record<string, string> = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
      if (params.betas?.length) headers['anthropic-beta'] = params.betas.join(',');
      const body = anthropicRequestBody(cfg.model, params, system, messages, tools);
      const { json, latencyMs } = await postJson<AnthropicResponse>(`${baseUrl}/v1/messages`, headers, body, opts.timeoutMs ?? 90_000, opts.signal);
      return parseAnthropicResponse(cfg.model, json, latencyMs);
    },
  };
}
