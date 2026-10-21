import type { Db, MessageType, UserRow } from "@/lib/db/types";
import { WaApiError } from "@/lib/wa/client";
import type { WaSender } from "@/lib/wa/sender";
import type { ReplyButton } from "@/lib/wa/types";
import type { TemplateSend } from "@/lib/wa/templates";

/** PLAN §5: free-form messages only within 24 hours of the user's last message. */
export const WINDOW_MS = 24 * 3_600_000;
/** Meta: "Re-engagement message" — the window is closed after all (clock skew, a message we did not store). */
const WINDOW_CLOSED_CODE = 131047;

export interface ProactiveDeps {
  db: Db;
  wa: WaSender;
  now: () => Date;
}

export async function activePhone(db: Db, userId: string): Promise<string | null> {
  return (await db.listWaIdentities(userId)).find((w) => w.status === "active")?.phone_e164 ?? null;
}

/** Last inbound message time (the last 50 rows are plenty: if it is older, the window is closed anyway). */
export async function lastInboundAt(db: Db, userId: string): Promise<Date | null> {
  const recent = await db.recentMessages(userId, 50);
  const last = [...recent].reverse().find((m) => m.direction === "in");
  return last ? new Date(last.created_at) : null;
}

export async function isWindowOpen(db: Db, userId: string, now: Date): Promise<boolean> {
  const last = await lastInboundAt(db, userId);
  return last !== null && now.getTime() - last.getTime() < WINDOW_MS;
}

export interface ProactiveMessage {
  /** the free-form text (inside the window) — also what we store in `messages` */
  text: string;
  /** reply buttons for the free-form version (≤ 3) */
  buttons?: ReplyButton[];
  /** the approved template for outside the window */
  template: TemplateSend;
}

export type ProactiveResult = { sent: true; mode: "text" | "template"; messageId: string } | { sent: false; reason: "no_phone" };

/**
 * Sends a bot-initiated message: free text (with buttons) inside the 24-hour window, otherwise the UTILITY
 * template. Stores the outbound row. Throws on WhatsApp errors so the job is retried.
 */
export async function sendProactive(deps: ProactiveDeps, user: UserRow, msg: ProactiveMessage): Promise<ProactiveResult> {
  const phone = await activePhone(deps.db, user.id);
  if (!phone) return { sent: false, reason: "no_phone" };

  const sendTemplate = () => deps.wa.sendTemplate(phone, msg.template.name, msg.template.params.map((text) => ({ type: "text" as const, text })), msg.template.buttons);
  let mode: "text" | "template" = (await isWindowOpen(deps.db, user.id, deps.now())) ? "text" : "template";
  let messageId: string;
  if (mode === "text") {
    try {
      messageId = (msg.buttons?.length ? await deps.wa.sendButtons(phone, msg.text, msg.buttons) : await deps.wa.sendText(phone, msg.text)).messageId;
    } catch (e) {
      if (!(e instanceof WaApiError && e.code === WINDOW_CLOSED_CODE)) throw e;
      mode = "template";
      messageId = (await sendTemplate()).messageId;
    }
  } else {
    messageId = (await sendTemplate()).messageId;
  }

  const type: MessageType = mode === "template" ? "template" : msg.buttons?.length ? "button" : "text";
  await deps.db.insertMessage({ user_id: user.id, direction: "out", type, text: msg.text, wa_message_id: messageId || null });
  return { sent: true, mode, messageId };
}
