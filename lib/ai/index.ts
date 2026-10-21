import "server-only";
import { integrationsMocked } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AiProvider } from "./types";

export type { AiProvider } from "./types";

const NAME = "ai-provider";

/** `DATA_MODE=memory` or `DEMO_MODE=1` (`integrationsMocked()` — the demo even when keys exist) → MockProvider; otherwise Anthropic (Hebrew EnvError without ANTHROPIC_API_KEY). */
export function getAiProvider(): AiProvider {
  return globalSingleton<AiProvider>(NAME, () => (integrationsMocked() ? new MockProvider() : AnthropicProvider.fromEnv()));
}

export function setAiProviderForTests(provider: AiProvider | undefined): void {
  setGlobalSingleton(NAME, provider);
}
