import type { ModelConfig } from '../models.js';
import { createOpenAICompatProvider } from './openai.js';
import type { Provider } from './types.js';

/** OpenRouter = OpenAI-compatible endpoint; `usage.cost` (USD) is returned when usage.include=true. */
export function createOpenRouterProvider(cfg: ModelConfig): Provider {
  return createOpenAICompatProvider(cfg, {
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    apiKeyEnv: 'OPENROUTER_API_KEY',
    extraHeaders: { 'HTTP-Referer': 'https://github.com/whatsappbot/hebrew-eval', 'X-Title': 'hebrew-eval' },
    includeUsageCost: true,
  });
}
