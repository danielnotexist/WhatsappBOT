import "server-only";
import { dataMode } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { HypClient, MockHypGateway, type HypGateway } from "./client";

export type { HypGateway } from "./client";

const NAME = "hyp";

/** `DATA_MODE=memory` → mock gateway (no network); otherwise the real client (Hebrew EnvError without HYP_*). */
export function getHyp(): HypGateway {
  return globalSingleton<HypGateway>(NAME, () => (dataMode() === "memory" ? new MockHypGateway(process.env.APP_URL || "http://localhost:3000") : HypClient.fromEnv()));
}

export function setHypForTests(gateway: HypGateway | undefined): void {
  setGlobalSingleton(NAME, gateway);
}
