/**
 * Provider-agnostic model layer (PLAN §2.1): a cheap "router" tier classifies and answers simple messages,
 * a "strong" tier runs the tool loop. Implementations: AnthropicProvider (real) and MockProvider (tests, dev).
 */
export type ModelTier = "router" | "strong";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultMessage {
  id: string;
  name: string;
  output: unknown;
  isError?: boolean;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: ToolResultMessage[] };

export interface CompletionRequest {
  tier: ModelTier;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  /** ask for JSON-only output (router classification) */
  json?: boolean;
  /** with `json`: the JSON schema the output must follow (Anthropic: structured outputs, output_config.format) */
  jsonSchema?: Record<string, unknown>;
  /** aborts the call (and the SDK's retries) — the spend guard's per-turn deadline in the demo (lib/ai/budget.ts) */
  signal?: AbortSignal;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CompletionResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage: Usage;
  costUsd: number | null;
  model: string;
  raw?: unknown;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
