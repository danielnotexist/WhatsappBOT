import type { InboundMessage, InboundMessageType, ParsedWebhook } from "./types";

/** Raw webhook body (only the fields we read). */
interface RawWebhook {
  object?: string;
  entry?: {
    id?: string;
    changes?: { field?: string; value?: RawValue }[];
  }[];
}

interface RawValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: RawMessage[];
  statuses?: { id?: string; status?: string; timestamp?: string; recipient_id?: string; errors?: { code?: number; title?: string }[] }[];
}

interface RawMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { text?: string; payload?: string };
  context?: { id?: string; from?: string };
}

export function toE164(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d ? `+${d}` : "";
}

/**
 * Message types that are not something the user asked us: a reaction (👍 on one of our messages, or removing one),
 * and WhatsApp's own notices (disappearing-messages setting, number change). They are dropped, not answered.
 * `unsupported` (a poll, a view-once photo…) stays: the user did send something, and gets the "not supported" reply.
 */
const IGNORED_TYPES = new Set(["reaction", "ephemeral", "system"]);

/**
 * Normalises a webhook body into inbound messages and statuses. Never throws on odd shapes —
 * a malformed body yields empty lists so the route can still answer 200 (Meta retries otherwise).
 * With `phoneNumberId` (WA_PHONE_NUMBER_ID), changes addressed to another number of the same WhatsApp app are skipped
 * (listed in `other` as "messages:foreign_number").
 */
export function parseWebhook(body: unknown, opts: { phoneNumberId?: string } = {}): ParsedWebhook {
  const out: ParsedWebhook = { messages: [], statuses: [], other: [] };
  const raw = body as RawWebhook | null;
  if (!raw || raw.object !== "whatsapp_business_account" || !Array.isArray(raw.entry)) return out;

  for (const entry of raw.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        out.other.push(change.field ?? "unknown");
        continue;
      }
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      if (opts.phoneNumberId && phoneNumberId !== opts.phoneNumberId) {
        out.other.push("messages:foreign_number");
        continue;
      }
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);

      for (const m of value.messages ?? []) {
        const msg = parseMessage(m, phoneNumberId, names);
        if (msg) out.messages.push(msg);
      }
      for (const s of value.statuses ?? []) {
        if (!s.id) continue;
        out.statuses.push({
          waMessageId: s.id,
          status: s.status ?? "unknown",
          recipient: s.recipient_id ?? "",
          timestamp: tsToDate(s.timestamp),
          errors: (s.errors ?? []).map((e) => ({ code: e.code ?? 0, title: e.title ?? "" })),
        });
      }
    }
  }
  return out;
}

function tsToDate(ts: string | undefined): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

function parseMessage(m: RawMessage, phoneNumberId: string, names: Map<string, string>): InboundMessage | null {
  if (!m.id || !m.from) return null;
  if (m.type && IGNORED_TYPES.has(m.type)) return null;
  let type: InboundMessageType = "other";
  let text: string | null = null;
  let mediaId: string | null = null;
  let mimeType: string | null = null;
  let reply: { id: string; title: string } | null = null;

  switch (m.type) {
    case "text":
      type = "text";
      text = m.text?.body ?? "";
      break;
    case "audio":
      type = "audio";
      mediaId = m.audio?.id ?? null;
      mimeType = m.audio?.mime_type ?? null;
      break;
    case "image":
      type = "image";
      mediaId = m.image?.id ?? null;
      mimeType = m.image?.mime_type ?? null;
      text = m.image?.caption ?? null;
      break;
    case "document":
      type = "document";
      mediaId = m.document?.id ?? null;
      mimeType = m.document?.mime_type ?? null;
      text = m.document?.caption ?? m.document?.filename ?? null;
      break;
    case "interactive": {
      const i = m.interactive;
      if (i?.type === "button_reply" && i.button_reply?.id) {
        type = "button";
        reply = { id: i.button_reply.id, title: i.button_reply.title ?? "" };
      } else if (i?.type === "list_reply" && i.list_reply?.id) {
        type = "list";
        reply = { id: i.list_reply.id, title: i.list_reply.title ?? "" };
      }
      text = reply?.title ?? null;
      break;
    }
    case "button": // quick-reply button of a template
      type = "template_button";
      reply = { id: m.button?.payload ?? m.button?.text ?? "", title: m.button?.text ?? "" };
      text = m.button?.text ?? null;
      break;
    default:
      type = "other";
  }

  return {
    waMessageId: m.id,
    from: m.from,
    fromE164: toE164(m.from),
    profileName: names.get(m.from) ?? null,
    timestamp: tsToDate(m.timestamp),
    type,
    text,
    mediaId,
    mimeType,
    reply,
    contextMessageId: m.context?.id ?? null,
    raw: m,
    phoneNumberId,
  };
}
