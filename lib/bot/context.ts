import type { AiProvider } from "@/lib/ai/types";
import type { Db } from "@/lib/db/types";
import type { WaSender } from "@/lib/wa/sender";

/** Everything a bot handler needs — injected so tests run with MemoryDb + RecordingWaSender + MockProvider. */
export interface BotContext {
  db: Db;
  wa: WaSender;
  ai: AiProvider;
  now: () => Date;
  /** public site URL (APP_URL) for links sent in chat */
  appUrl: string;
}

export const LINK = {
  maxTokenAttempts: 3,
  blockMs: 24 * 3_600_000,
} as const;

export function siteLink(ctx: BotContext, path: string): string {
  return new URL(path, ctx.appUrl).toString();
}

export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length < 7 ? "***" : `${d.slice(0, 3)}-***-${d.slice(-4)}`;
}
