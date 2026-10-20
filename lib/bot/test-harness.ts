import { randomBytes } from "node:crypto";
import { MockProvider } from "@/lib/ai/mock";
import { MemoryDb } from "@/lib/db/memory";
import { RecordingWaSender } from "@/lib/wa/sender";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";

/** In-memory bot stack for tests (used across the bot test files). */
export function makeHarness(start = new Date("2026-10-20T08:00:00Z")) {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64"); // pay links / sessions derive keys from it
  let now = start;
  const db = new MemoryDb();
  db.now = () => now;
  const wa = new RecordingWaSender();
  const ai = new MockProvider();
  const ctx: BotContext = { db, wa, ai, now: () => now, appUrl: "https://app.example.co.il" };
  let n = 0;
  const inbound = (text: string, overrides: Partial<InboundMessage> = {}): InboundMessage => ({
    waMessageId: `wamid.${++n}`,
    from: "972501234567",
    fromE164: "+972501234567",
    profileName: "דנה",
    timestamp: now,
    type: "text",
    text,
    mediaId: null,
    mimeType: null,
    reply: null,
    contextMessageId: null,
    raw: {},
    phoneNumberId: "PNID",
    ...overrides,
  });
  const button = (id: string, title = id) => inbound(title, { type: "button", reply: { id, title } });
  const listReply = (id: string, title = id) => inbound(title, { type: "list", reply: { id, title } });
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { db, wa, ai, ctx, inbound, button, listReply, advance };
}
