import "server-only";
import { integrationsMocked } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { WaClient } from "./client";
import { RecordingWaSender, type WaSender } from "./sender";

export type { WaSender } from "./sender";

const NAME = "wa-sender";

/** `DATA_MODE=memory` or `DEMO_MODE=1` (`integrationsMocked()` — the demo even when keys exist) → recording sender (console); otherwise the real client (Hebrew EnvError when tokens are missing). */
export function getWaSender(): WaSender {
  return globalSingleton<WaSender>(NAME, () => (integrationsMocked() ? new RecordingWaSender() : WaClient.fromEnv()));
}

export function setWaSenderForTests(sender: WaSender | undefined): void {
  setGlobalSingleton(NAME, sender);
}
