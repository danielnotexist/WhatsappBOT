import { randomUUID } from "node:crypto";
import type { BotContext } from "@/lib/bot/context";
import { welcomeLinkedPhone } from "@/lib/bot/linking";
import { awaitingAnswer } from "@/lib/bot/onboarding";
import { parseButtonId } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import type { Db, UserRow } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/wa/types";
import { demoChatPhone, isDemoChatPhone } from "./phone";
import { ChatTranscript, demoMediaId, rowItem } from "./transcript";
import type { ChatItem } from "./types";

/**
 * The website chat (/demo/chat, DEMO_MODE only): the signed-in person talks to the same pipeline as WhatsApp
 * (`processInbound`), from a virtual number of their own. Replies are recorded per request (ChatTranscript), returned to
 * the page and stored for the history.
 */

export type ChatInput =
  | { kind: "text"; text: string }
  | { kind: "audio"; bytes: Uint8Array; mimeType: string; durationMs?: number | null }
  | { kind: "reply"; id: string; title: string; list: boolean };

export type ChatOutcome =
  | { ok: true; user: ChatItem | null; replies: ChatItem[]; awaiting: boolean; note?: string }
  | { ok: false; code: "forbidden" | "blocked" | "not_linked"; message: string };

export const CHAT_ERRORS = {
  forbidden: "הכפתור הזה לא שייך לשיחה הזו.",
  blocked: "המספר של הצ'אט חסום בחשבון הזה.",
  not_linked: "כדי לדבר כאן, צריך קודם לחבר את הוואטסאפ לחשבון מהאזור האישי.",
} as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID_SHAPE = /^[a-z]{2,8}(:[A-Za-z0-9_.-]{1,64}){1,4}$/;
const BARE_ID = /^[a-z][a-z0-9]{1,15}_[a-z0-9_]{1,24}$/;

/**
 * May this person press this button? Only ids the bot hands out, and every id that names a row (a pending action, a
 * reminder, a billing approval, an agent) only when that row is the person's own — checked here, before the pipeline.
 */
export async function replyAllowed(db: Db, userId: string, id: string): Promise<boolean> {
  if (BARE_ID.test(id)) return true; // onboarding list rows (pain_email, mt_0700…): the person's own state only
  if (id.length > 256 || !ID_SHAPE.test(id)) return false;
  const prefix = id.split(":")[0]!;
  if (prefix === "pa") {
    const parsed = parseButtonId(id);
    if (!parsed) return false;
    const action = await db.getPendingAction(parsed.actionId);
    return action?.user_id === userId;
  }
  if (prefix === "rem") {
    const m = id.match(new RegExp(`^rem:(?:done|hour|tmrw):(${UUID})$`));
    if (!m) return false;
    return (await db.getReminder(m[1]!))?.user_id === userId;
  }
  if (prefix === "bill") {
    const m = id.match(new RegExp(`^bill:(?:ok|no):(${UUID})$`));
    if (m) return (await db.getBillingApproval(m[1]!))?.user_id === userId;
    return !new RegExp(UUID).test(id); // bill:card, bill:cancel:yes|no — the person's own subscription
  }
  if (prefix === "ag") {
    const m = id.match(new RegExp(UUID));
    return m ? (await db.getAgent(userId, m[0])) !== null : true; // ag:save, ag:tpl:secretary, builtin keys…
  }
  if (prefix === "onb") return !new RegExp(UUID).test(id);
  return false;
}

/**
 * The account's chat number. In the demo (`virtual`): any active number, else a virtual +999 one linked now (the
 * WhatsApp welcome and onboarding run as after a link). Outside the demo (WEB_CHAT=1): only the account's own real,
 * already linked WhatsApp number — never a virtual one, never linked from here.
 */
export async function ensureChatIdentity(ctx: BotContext, user: UserRow, opts: { virtual?: boolean } = {}): Promise<{ phone: string; linkedNow: boolean } | { blocked: true } | { notLinked: true }> {
  const virtual = opts.virtual ?? true;
  const identities = await ctx.db.listWaIdentities(user.id);
  const active = identities.find((w) => w.status === "active" && (virtual || !isDemoChatPhone(w.phone_e164)));
  if (active) return { phone: active.phone_e164, linkedNow: false };
  if (!virtual) return { notLinked: true };
  if (identities.some((w) => w.status === "blocked")) return { blocked: true };
  const phone = demoChatPhone(user.id);
  await ctx.db.createWaIdentity(user.id, phone, user.name);
  await welcomeLinkedPhone(ctx, user, phone, "demo_chat");
  return { phone, linkedNow: true };
}

/** Is the chat started (an active number on the account; outside the demo a real one)? */
export async function chatLinked(db: Db, userId: string, opts: { virtual?: boolean } = {}): Promise<boolean> {
  const virtual = opts.virtual ?? true;
  return (await db.listWaIdentities(userId)).some((w) => w.status === "active" && (virtual || !isDemoChatPhone(w.phone_e164)));
}

/** The history: the last messages of the account, as the chat shows them. */
export async function chatHistory(db: Db, userId: string, limit = 120): Promise<ChatItem[]> {
  return (await db.recentMessages(userId, limit)).map(rowItem).filter((m): m is ChatItem => m !== null);
}

/**
 * One request of the chat. `makeCtx` builds the bot context around the transcript's data layer and sender (the
 * production wiring in the route, the in-memory stack in tests). `input: null` = start the chat (link + welcome).
 */
export async function runChat(opts: { base: Db; user: UserRow; input: ChatInput | null; makeCtx: (t: { db: Db; wa: ChatTranscript["wa"] }) => BotContext; virtual?: boolean }): Promise<ChatOutcome> {
  const { base, user, input } = opts;
  if (input?.kind === "reply" && !(await replyAllowed(base, user.id, input.id))) return { ok: false, code: "forbidden", message: CHAT_ERRORS.forbidden };

  const transcript = new ChatTranscript(base, user.id);
  const ctx = opts.makeCtx({ db: transcript.db, wa: transcript.wa });
  const identity = await ensureChatIdentity(ctx, user, { virtual: opts.virtual });
  if ("blocked" in identity) return { ok: false, code: "blocked", message: CHAT_ERRORS.blocked };
  if ("notLinked" in identity) return { ok: false, code: "not_linked", message: CHAT_ERRORS.not_linked };

  let note: string | undefined;
  let userItem: ChatItem | null = null;
  // a person's first message, sent before the chat was started, is not lost: the link answers first, then the message
  if (input) {
    const msg = inboundFor(identity.phone, user, input, ctx.now());
    if (input.kind === "audio") transcript.wa.media.set(msg.mediaId!, { bytes: input.bytes, mimeType: input.mimeType });
    try {
      note = (await processInbound(ctx, msg)).note;
    } finally {
      await transcript.flush();
    }
    const stored = (await base.recentMessages(user.id, 40)).find((m) => m.wa_message_id === msg.waMessageId);
    userItem = stored ? rowItem(stored) : null;
  } else {
    await transcript.flush();
    note = identity.linkedNow ? "linked" : "already linked";
  }
  const fresh = await base.getUser(user.id);
  return { ok: true, user: userItem, replies: transcript.items(ctx.now()), awaiting: fresh ? awaitingAnswer(fresh) : false, note };
}

function inboundFor(phone: string, user: UserRow, input: ChatInput, now: Date): InboundMessage {
  const base: InboundMessage = {
    waMessageId: `demo.${randomUUID()}`,
    from: phone.replace(/^\+/, ""),
    fromE164: phone,
    profileName: user.name,
    timestamp: now,
    type: "text",
    text: null,
    mediaId: null,
    mimeType: null,
    reply: null,
    contextMessageId: null,
    raw: { source: "demo-chat" },
    phoneNumberId: "demo-chat",
  };
  if (input.kind === "text") return { ...base, type: "text", text: input.text };
  if (input.kind === "audio") return { ...base, type: "audio", mediaId: demoMediaId(input.durationMs ?? null), mimeType: input.mimeType };
  return { ...base, type: input.list ? "list" : "button", text: input.title, reply: { id: input.id, title: input.title } };
}
