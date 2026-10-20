import "server-only";
import type { InboundMessage } from "@/lib/wa/types";

/** Placeholder until the conversation pipeline lands (account linking → onboarding → AI). */
export async function handleInbound(message: InboundMessage): Promise<{ handled: boolean; note?: string }> {
  console.info(`[bot] inbound ${message.type} from ${message.fromE164} (${message.waMessageId}) — pipeline not wired yet`);
  return { handled: false, note: "pipeline not wired" };
}
