import "server-only";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { sttFromEnv } from "./env";
import type { SttProvider } from "./types";

export type { SttProvider, Transcript } from "./types";

const NAME = "stt-provider";

/** Lazily built from env (lib/stt/env.ts) — a missing key surfaces on the first voice note, as a Hebrew EnvError. */
export function getSttProvider(): SttProvider {
  return globalSingleton<SttProvider>(NAME, () => sttFromEnv());
}

export function setSttProviderForTests(provider: SttProvider | undefined): void {
  setGlobalSingleton(NAME, provider);
}
