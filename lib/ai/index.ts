import "server-only";
import { dataMode } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AiProvider } from "./types";

export type { AiProvider } from "./types";

const NAME = "ai-provider";

/** `DATA_MODE=memory` → MockProvider; otherwise Anthropic (Hebrew EnvError without ANTHROPIC_API_KEY). */
export function getAiProvider(): AiProvider {
  return globalSingleton<AiProvider>(NAME, () => (dataMode() === "memory" ? new MockProvider() : AnthropicProvider.fromEnv()));
}

export function setAiProviderForTests(provider: AiProvider | undefined): void {
  setGlobalSingleton(NAME, provider);
}
