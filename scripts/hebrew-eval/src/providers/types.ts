import type { Usage } from '../types.js';

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: JsonSchemaObject;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  output: unknown;
  isError?: boolean;
}

/** Provider-neutral conversation. `raw` keeps the provider-native assistant turn so thinking blocks / thought signatures are replayed unchanged. */
export type NeutralMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: 'tool'; results: ToolResult[] };

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  latencyMs: number;
  costUsd: number | null;
  stopReason?: string;
  /** Provider-native assistant content, to be passed back as `raw` on the next turn. */
  raw?: unknown;
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Provider {
  /** Local id from models.json */
  id: string;
  name: string;
  /** Provider API model id */
  model: string;
  run(system: string, messages: NeutralMessage[], tools: ToolDef[], opts?: RunOptions): Promise<ProviderResponse>;
}
