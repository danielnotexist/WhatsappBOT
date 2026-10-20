import type { Usage } from './types.js';

/** USD per 1M tokens. */
export interface Price {
  in: number;
  out: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** true = not verified; update from the provider's pricing page or override via env. */
  placeholder?: boolean;
  note?: string;
}

/**
 * Anthropic prices come from the claude-api skill (cached 2026-10-06):
 *   Haiku 5.5  $0.10 / $0.50  (prompt <= 100K tokens; cache read 0.1x, 5-min cache write 1.25x)
 *   Sonnet 5.5 $2.00 / $10.00 (cache read $0.20, 5-min cache write $2.50)
 *
 * OpenAI / Gemini / OpenRouter: TODO placeholders — verify on the provider's pricing page
 * (openai.com/api/pricing, ai.google.dev/pricing, openrouter.ai/models) and override via env:
 *   PRICE_<MODEL>_IN / PRICE_<MODEL>_OUT / PRICE_<MODEL>_CACHE_READ / PRICE_<MODEL>_CACHE_WRITE
 * where <MODEL> is the model id upper-cased with every non-alphanumeric char replaced by "_"
 * (e.g. gemini-3.1-flash-lite -> PRICE_GEMINI_3_1_FLASH_LITE_IN).
 */
export const PRICING: Record<string, Price> = {
  // ---- Anthropic (verified via claude-api skill) ----
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125, note: 'prompt ≤100K tokens' },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },

  // ---- Google Gemini (TODO: verify) ----
  'gemini-3.1-flash-lite': { in: 0.1, out: 0.4, cacheRead: 0.025, placeholder: true, note: 'TODO verify at ai.google.dev/pricing' },
  'gemini-3.8-flash': { in: 0.3, out: 2.5, cacheRead: 0.075, placeholder: true, note: 'TODO verify at ai.google.dev/pricing' },

  // ---- OpenAI (TODO: verify) ----
  'gpt-5.6-luna': { in: 0.25, out: 2, cacheRead: 0.025, placeholder: true, note: 'TODO verify at openai.com/api/pricing' },
  'gpt-5.6-terra': { in: 1.25, out: 10, cacheRead: 0.125, placeholder: true, note: 'TODO verify at openai.com/api/pricing' },
};

export function envKey(modelId: string, suffix: string): string {
  return `PRICE_${modelId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${suffix}`;
}

function envNum(key: string): number | undefined {
  const v = process.env[key];
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Table price with env overrides applied. */
export function getPrice(modelId: string): Price | undefined {
  const base = PRICING[modelId];
  const inOverride = envNum(envKey(modelId, 'IN'));
  const outOverride = envNum(envKey(modelId, 'OUT'));
  const crOverride = envNum(envKey(modelId, 'CACHE_READ'));
  const cwOverride = envNum(envKey(modelId, 'CACHE_WRITE'));
  if (!base && (inOverride === undefined || outOverride === undefined)) return undefined;
  const price: Price = { ...(base ?? { in: 0, out: 0 }) };
  if (inOverride !== undefined) price.in = inOverride;
  if (outOverride !== undefined) price.out = outOverride;
  if (crOverride !== undefined) price.cacheRead = crOverride;
  if (cwOverride !== undefined) price.cacheWrite = cwOverride;
  if (inOverride !== undefined && outOverride !== undefined) price.placeholder = false;
  return price;
}

/** Cost in USD for one call; null when no price is known. */
export function computeCost(modelId: string, usage: Usage): number | null {
  const p = getPrice(modelId);
  if (!p) return null;
  const cacheRead = p.cacheRead ?? p.in * 0.1;
  const cacheWrite = p.cacheWrite ?? p.in * 1.25;
  return (usage.in * p.in + usage.out * p.out + usage.cacheRead * cacheRead + usage.cacheWrite * cacheWrite) / 1_000_000;
}
