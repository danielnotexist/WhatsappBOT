import type { ModelConfig } from '../models.js';
import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';
import { createOpenRouterProvider } from './openrouter.js';
import type { Provider } from './types.js';

export function createProvider(cfg: ModelConfig, opts: { dryRun?: boolean } = {}): Provider {
  if (opts.dryRun || cfg.provider === 'mock') return createMockProvider(cfg);
  switch (cfg.provider) {
    case 'anthropic':
      return createAnthropicProvider(cfg);
    case 'openai':
      return createOpenAIProvider(cfg);
    case 'gemini':
      return createGeminiProvider(cfg);
    case 'openrouter':
      return createOpenRouterProvider(cfg);
    default:
      throw new Error(`ספק לא מוכר: ${String(cfg.provider)} (מודל ${cfg.id})`);
  }
}

export type { Provider, NeutralMessage, ToolDef, ToolCall, ToolResult, ProviderResponse } from './types.js';
