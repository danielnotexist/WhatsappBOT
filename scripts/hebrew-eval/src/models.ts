import path from 'node:path';
import { ROOT } from './env.js';
import { readJson } from './util.js';

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'mock';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderKind;
  model: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
}

export interface ModelsFile {
  models: ModelConfig[];
  judge: Omit<ModelConfig, 'id' | 'name'> & { id?: string; name?: string };
  usageProfiles: { light: number; medium: number; heavy: number };
  thresholds: { routerMinHebrew: number; routerMinSafety: number };
}

export const PROVIDER_ENV: Record<ProviderKind, string | undefined> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  mock: undefined,
};

export function loadModelsFile(): ModelsFile {
  const file = readJson<ModelsFile>(path.join(ROOT, 'models.json'));
  if (!Array.isArray(file.models) || file.models.length === 0) throw new Error('models.json: אין מודלים');
  file.usageProfiles ??= { light: 150, medium: 750, heavy: 3000 };
  file.thresholds ??= { routerMinHebrew: 4.0, routerMinSafety: 5.0 };
  return file;
}

export function selectModels(file: ModelsFile, only?: string[]): ModelConfig[] {
  let models = file.models.filter((m) => m.enabled !== false);
  if (only && only.length > 0) {
    const unknown = only.filter((id) => !file.models.some((m) => m.id === id));
    if (unknown.length > 0) {
      throw new Error(`מודלים לא מוכרים ב---models: ${unknown.join(', ')}. זמינים: ${file.models.map((m) => m.id).join(', ')}`);
    }
    models = file.models.filter((m) => only.includes(m.id));
  }
  if (models.length === 0) throw new Error('לא נבחרו מודלים (כולם enabled=false?)');
  return models;
}

export function judgeConfig(file: ModelsFile): ModelConfig {
  const j = file.judge ?? { provider: 'anthropic', model: 'claude-sonnet-5-5' };
  const model = process.env.JUDGE_MODEL || j.model;
  return { id: j.id ?? `judge:${model}`, name: j.name ?? `Judge ${model}`, provider: j.provider, model, params: j.params };
}
