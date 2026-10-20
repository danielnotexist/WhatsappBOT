import "server-only";
import { getAiProvider } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { getWaSender } from "@/lib/wa";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";
import { processInbound } from "./process-inbound";

/** Production entry: wires the process-wide singletons into the pure pipeline. */
export async function handleInbound(message: InboundMessage): Promise<{ handled: boolean; note?: string }> {
  const ctx: BotContext = { db: getDb(), wa: getWaSender(), ai: getAiProvider(), now: () => new Date(), appUrl: process.env.APP_URL || "http://localhost:3000" };
  return processInbound(ctx, message);
}
