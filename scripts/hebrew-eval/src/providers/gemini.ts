import type { ModelConfig } from '../models.js';
import type { Usage } from '../types.js';
import { computeCost } from '../pricing.js';
import { postJson } from './http.js';
import type { NeutralMessage, Provider, ProviderResponse, RunOptions, ToolCall, ToolDef } from './types.js';

/**
 * Gemini API (generativelanguage.googleapis.com, v1beta generateContent).
 * params.generationConfig is passed through (maxOutputTokens, thinkingConfig: {thinkingBudget | thinkingLevel}, ...).
 */
export interface GeminiParams {
  generationConfig?: Record<string, unknown>;
  apiVersion?: string;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Gemini's OpenAPI-subset schema rejects additionalProperties/$schema — strip them recursively. */
function cleanSchema(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(cleanSchema);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema') continue;
      out[k] = cleanSchema(val);
    }
    return out;
  }
  return v;
}

function toContents(messages: NeutralMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', parts: [{ text: m.content }] };
    if (m.role === 'assistant') {
      if (m.raw) return { role: 'model', parts: m.raw };
      const parts: GeminiPart[] = [];
      if (m.content.trim()) parts.push({ text: m.content });
      for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.input } });
      return { role: 'model', parts };
    }
    return {
      role: 'user',
      parts: m.results.map<GeminiPart>((r) => ({
        functionResponse: {
          name: r.name,
          response: r.isError ? { error: r.output } : typeof r.output === 'object' && r.output !== null ? (r.output as Record<string, unknown>) : { result: r.output },
        },
      })),
    };
  });
}

export function createGeminiProvider(cfg: ModelConfig): Provider {
  const params = (cfg.params ?? {}) as GeminiParams;
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const version = params.apiVersion ?? 'v1beta';
  return {
    id: cfg.id,
    name: cfg.name,
    model: cfg.model,
    async run(system, messages, tools, opts: RunOptions = {}) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY חסר');
      const body: Record<string, unknown> = {
        system_instruction: { parts: [{ text: system }] },
        contents: toContents(messages),
        ...(tools.length
          ? {
              tools: [{ function_declarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: cleanSchema(t.input_schema) })) }],
              tool_config: { function_calling_config: { mode: 'AUTO' } },
            }
          : {}),
        generationConfig: { maxOutputTokens: 4096, ...(params.generationConfig ?? {}) },
      };
      const url = `${base}/${version}/models/${encodeURIComponent(cfg.model)}:generateContent`;
      const { json, latencyMs } = await postJson<GeminiResponse>(url, { 'x-goog-api-key': apiKey }, body, opts.timeoutMs ?? 90_000, opts.signal);
      if (json.error?.message) throw new Error(`provider error: ${json.error.message}`);
      const cand = json.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      const text = parts
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text as string)
        .join('\n')
        .trim();
      const toolCalls: ToolCall[] = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({ id: p.functionCall?.id || `call_${i}`, name: p.functionCall!.name, input: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
      const u = json.usageMetadata ?? {};
      const cached = u.cachedContentTokenCount ?? 0;
      const usage: Usage = {
        in: Math.max(0, (u.promptTokenCount ?? 0) - cached),
        out: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        cacheRead: cached,
        cacheWrite: 0,
      };
      const stopReason = json.promptFeedback?.blockReason ? `blocked:${json.promptFeedback.blockReason}` : cand?.finishReason;
      const resp: ProviderResponse = { text, toolCalls, usage, latencyMs, costUsd: computeCost(cfg.model, usage), stopReason, raw: parts };
      return resp;
    },
  };
}
