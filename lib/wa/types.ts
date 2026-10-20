/**
 * WhatsApp Cloud API (Meta Graph) — the subset of payload shapes we send and receive.
 * Reference: developers.facebook.com/docs/whatsapp/cloud-api (messages, webhooks, media).
 */

export const WA_GRAPH_VERSION = "v21.0";
export const WA_GRAPH_BASE = `https://graph.facebook.com/${WA_GRAPH_VERSION}`;

// ---------- outbound ----------

export interface ReplyButton {
  /** ≤ 256 chars; comes back as `button_reply.id` */
  id: string;
  /** ≤ 20 chars */
  title: string;
}

export interface ListRow {
  id: string;
  /** ≤ 24 chars */
  title: string;
  /** ≤ 72 chars */
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export interface TemplateParam {
  type: "text";
  text: string;
}

export interface TemplateButtonParam {
  index: number;
  /** URL button dynamic suffix, or quick-reply payload */
  subType: "url" | "quick_reply";
  text: string;
}

export interface SendResult {
  messageId: string;
  /** phone number as WhatsApp normalised it (`wa_id`) */
  waId: string | null;
}

export interface MediaInfo {
  id: string;
  url: string;
  mimeType: string;
  sha256: string;
  fileSize: number;
}

// ---------- inbound (webhook) ----------

export type InboundMessageType = "text" | "audio" | "image" | "document" | "button" | "list" | "template_button" | "other";

export interface InboundMessage {
  /** `wamid.…` — unique per message; used for dedupe and for reactions / read receipts */
  waMessageId: string;
  /** sender phone in digits (no +), as Meta sends it */
  from: string;
  /** E.164 with + */
  fromE164: string;
  /** sender's WhatsApp profile name, when present in `contacts` */
  profileName: string | null;
  timestamp: Date;
  type: InboundMessageType;
  text: string | null;
  /** media id for audio/image/document (download with the client) */
  mediaId: string | null;
  mimeType: string | null;
  /** interactive reply (button/list) or template quick-reply payload */
  reply: { id: string; title: string } | null;
  /** the message this one quotes / replies to, if any */
  contextMessageId: string | null;
  /** Meta's raw message object, for the audit trail */
  raw: unknown;
  /** which of our phone numbers received it */
  phoneNumberId: string;
}

export interface InboundStatus {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  recipient: string;
  timestamp: Date;
  errors: { code: number; title: string }[];
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: InboundStatus[];
  /** events we do not handle (e.g. template status updates) — logged, not processed */
  other: string[];
}
