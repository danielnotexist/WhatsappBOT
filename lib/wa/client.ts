import { requireEnv } from "@/lib/env";
import {
  WA_GRAPH_BASE,
  type ListSection,
  type MediaInfo,
  type ReplyButton,
  type SendResult,
  type TemplateButtonParam,
  type TemplateParam,
} from "./types";

export class WaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "WaApiError";
  }
  /** 429 / 5xx / network-ish → worth a retry by the queue */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.code === 130429 || this.code === 131056;
  }
}

export interface WaClientOptions {
  accessToken: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** Text limits enforced by Meta; we trim rather than fail. */
const LIMITS = { body: 4096, buttonTitle: 20, buttons: 3, listRowTitle: 24, listRowDesc: 72, listRows: 10, listButton: 20, header: 60, footer: 60 } as const;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Minimal typed client for the WhatsApp Cloud API. One method per message kind, no SDK.
 * Every call needs the open 24-hour customer-service window except `sendTemplate`.
 */
export class WaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly opts: WaClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? WA_GRAPH_BASE;
  }

  /** Throws a Hebrew EnvError naming WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID when missing. */
  static fromEnv(fetchImpl?: typeof fetch): WaClient {
    const env = requireEnv(["WA_ACCESS_TOKEN", "WA_PHONE_NUMBER_ID"]);
    return new WaClient({ accessToken: env.WA_ACCESS_TOKEN, phoneNumberId: env.WA_PHONE_NUMBER_ID, fetchImpl });
  }

  // ---------- messages ----------

  sendText(to: string, body: string, opts: { previewUrl?: boolean; replyTo?: string } = {}): Promise<SendResult> {
    return this.sendMessage(to, { type: "text", text: { body: cut(body, LIMITS.body), preview_url: opts.previewUrl ?? false } }, opts.replyTo);
  }

  /** Up to 3 reply buttons (PLAN: שלח / ערוך / בטל). */
  sendButtons(to: string, body: string, buttons: ReplyButton[], opts: { header?: string; footer?: string; replyTo?: string } = {}): Promise<SendResult> {
    if (buttons.length === 0 || buttons.length > LIMITS.buttons) throw new Error(`buttons: expected 1–${LIMITS.buttons}, got ${buttons.length}`);
    return this.sendMessage(
      to,
      {
        type: "interactive",
        interactive: {
          type: "button",
          ...(opts.header ? { header: { type: "text", text: cut(opts.header, LIMITS.header) } } : {}),
          body: { text: cut(body, 1024) },
          ...(opts.footer ? { footer: { text: cut(opts.footer, LIMITS.footer) } } : {}),
          action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, LIMITS.buttonTitle) } })) },
        },
      },
      opts.replyTo,
    );
  }

  /** List message: up to 10 rows across sections, opened by a button. */
  sendList(to: string, body: string, buttonText: string, sections: ListSection[], opts: { header?: string; footer?: string; replyTo?: string } = {}): Promise<SendResult> {
    const rows = sections.reduce((n, s) => n + s.rows.length, 0);
    if (rows === 0 || rows > LIMITS.listRows) throw new Error(`list rows: expected 1–${LIMITS.listRows}, got ${rows}`);
    return this.sendMessage(
      to,
      {
        type: "interactive",
        interactive: {
          type: "list",
          ...(opts.header ? { header: { type: "text", text: cut(opts.header, LIMITS.header) } } : {}),
          body: { text: cut(body, 1024) },
          ...(opts.footer ? { footer: { text: cut(opts.footer, LIMITS.footer) } } : {}),
          action: {
            button: cut(buttonText, LIMITS.listButton),
            sections: sections.map((s) => ({
              ...(s.title ? { title: cut(s.title, 24) } : {}),
              rows: s.rows.map((r) => ({ id: r.id, title: cut(r.title, LIMITS.listRowTitle), ...(r.description ? { description: cut(r.description, LIMITS.listRowDesc) } : {}) })),
            })),
          },
        },
      },
      opts.replyTo,
    );
  }

  sendImage(to: string, image: { link: string } | { id: string }, caption?: string, replyTo?: string): Promise<SendResult> {
    return this.sendMessage(to, { type: "image", image: { ...image, ...(caption ? { caption: cut(caption, 1024) } : {}) } }, replyTo);
  }

  sendDocument(to: string, doc: ({ link: string } | { id: string }) & { filename?: string }, caption?: string, replyTo?: string): Promise<SendResult> {
    return this.sendMessage(to, { type: "document", document: { ...doc, ...(caption ? { caption: cut(caption, 1024) } : {}) } }, replyTo);
  }

  /** Emoji reaction on the user's message (✅ before processing, per PLAN §1). Empty emoji removes it. */
  sendReaction(to: string, messageId: string, emoji: string): Promise<SendResult> {
    return this.sendMessage(to, { type: "reaction", reaction: { message_id: messageId, emoji } });
  }

  /** Marks the message read; with `typing: true` also shows the typing indicator (clears when we reply or after ~25s). */
  async markRead(messageId: string, opts: { typing?: boolean } = {}): Promise<void> {
    await this.post(`/${this.opts.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      ...(opts.typing ? { typing_indicator: { type: "text" } } : {}),
    });
  }

  /** Approved template (outside the 24h window). `language` defaults to Hebrew. */
  sendTemplate(to: string, name: string, bodyParams: TemplateParam[] = [], buttons: TemplateButtonParam[] = [], language = "he"): Promise<SendResult> {
    const components: unknown[] = [];
    if (bodyParams.length) components.push({ type: "body", parameters: bodyParams });
    for (const b of buttons) {
      components.push({
        type: "button",
        sub_type: b.subType,
        index: String(b.index),
        parameters: [b.subType === "url" ? { type: "text", text: b.text } : { type: "payload", payload: b.text }],
      });
    }
    return this.sendMessage(to, { type: "template", template: { name, language: { code: language }, ...(components.length ? { components } : {}) } });
  }

  // ---------- media ----------

  async getMediaInfo(mediaId: string): Promise<MediaInfo> {
    const json = (await this.get(`/${mediaId}`)) as { id: string; url: string; mime_type: string; sha256: string; file_size: number };
    return { id: json.id, url: json.url, mimeType: json.mime_type, sha256: json.sha256, fileSize: json.file_size };
  }

  /** Downloads the media bytes (the URL from getMediaInfo needs the bearer token and expires after ~5 minutes). */
  async downloadMedia(mediaId: string, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const info = await this.getMediaInfo(mediaId);
    if (info.fileSize > maxBytes) throw new WaApiError(`media too large: ${info.fileSize} bytes`, 413, null, info);
    const res = await this.fetchImpl(info.url, { headers: { Authorization: `Bearer ${this.opts.accessToken}` } });
    if (!res.ok) throw new WaApiError(`media download failed: ${res.status}`, res.status, null, null);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, mimeType: info.mimeType };
  }

  // ---------- transport ----------

  private async sendMessage(to: string, message: Record<string, unknown>, replyTo?: string): Promise<SendResult> {
    const json = (await this.post(`/${this.opts.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      ...(replyTo ? { context: { message_id: replyTo } } : {}),
      ...message,
    })) as { messages?: { id: string }[]; contacts?: { wa_id: string }[] };
    return { messageId: json.messages?.[0]?.id ?? "", waId: json.contacts?.[0]?.wa_id ?? null };
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.handle(res);
  }

  private async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(`${this.base}${path}`, { headers: { Authorization: `Bearer ${this.opts.accessToken}` } });
    return this.handle(res);
  }

  private async handle(res: Response): Promise<unknown> {
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: number; error_subcode?: number } } | null)?.error;
      throw new WaApiError(`WhatsApp API ${res.status}: ${err?.message ?? text.slice(0, 200)}`, res.status, err?.code ?? null, err ?? null);
    }
    return json;
  }
}
