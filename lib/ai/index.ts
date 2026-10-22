import "server-only";
import { aiMocked } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AiProvider } from "./types";

export type { AiProvider } from "./types";

const NAME = "ai-provider";

/**
 * `DATA_MODE=memory` or `DEMO_MODE=1` (`aiMocked()` — the demo even when keys exist) → MockProvider; otherwise Anthropic
 * (Hebrew EnvError without ANTHROPIC_API_KEY). `DEMO_MODE=1` + `LIVE_AI=1` → Anthropic too, under the daily spend cap
 * that the pipeline applies per turn (lib/ai/budget.ts).
 */
export function getAiProvider(): AiProvider {
  return globalSingleton<AiProvider>(NAME, () => (aiMocked() ? new MockProvider() : AnthropicProvider.fromEnv()));
}

export function setAiProviderForTests(provider: AiProvider | undefined): void {
  setGlobalSingleton(NAME, provider);
}
