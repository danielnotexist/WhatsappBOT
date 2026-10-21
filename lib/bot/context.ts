import type { AiProvider } from "@/lib/ai/types";
import type { ConnectionRow, Db, UserRow } from "@/lib/db/types";
import type { Tool } from "@/lib/ai/tools";
import type { SttProvider } from "@/lib/stt/types";
import type { WaSender } from "@/lib/wa/sender";
import { createConnectLinkToken } from "@/lib/ms/connect-link";

/** Everything a bot handler needs — injected so tests run with MemoryDb + RecordingWaSender + MockProvider. */
export interface BotContext {
  db: Db;
  wa: WaSender;
  ai: AiProvider;
  now: () => Date;
  /** public site URL (APP_URL) for links sent in chat */
  appUrl: string;
  /** provider tools (Graph / Google) for the strong model, by user and connections */
  extraTools?: (user: UserRow, connections: ConnectionRow[]) => Promise<Tool[]>;
  /** speech-to-text for voice notes (lazy: a missing key only fails voice notes); absent → audio is declined */
  stt?: () => SttProvider;
}

export const LINK = {
  maxTokenAttempts: 3,
  blockMs: 24 * 3_600_000,
} as const;

/** One-time 30-minute OAuth start link for the chat: /api/auth/{microsoft|google}/start?t=<signed token>. */
export function connectLinkFor(ctx: BotContext, userId: string, provider: "microsoft" | "google"): string {
  return new URL(`/api/auth/${provider}/start?t=${encodeURIComponent(createConnectLinkToken(userId, provider, { now: ctx.now() }))}`, ctx.appUrl).toString();
}

export function siteLink(ctx: BotContext, path: string): string {
  return new URL(path, ctx.appUrl).toString();
}

export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length < 7 ? "***" : `${d.slice(0, 3)}-***-${d.slice(-4)}`;
}
