import type { WaClient } from "./client";
import type { ListSection, ReplyButton, SendResult, TemplateButtonParam, TemplateParam } from "./types";

/** The part of the WhatsApp client the bot uses — so tests and DATA_MODE=memory can record instead of send. */
export type WaSender = Pick<WaClient, "sendText" | "sendButtons" | "sendList" | "sendImage" | "sendDocument" | "sendReaction" | "markRead" | "sendTemplate" | "downloadMedia">;

export interface RecordedSend {
  kind: "text" | "buttons" | "list" | "image" | "document" | "reaction" | "read" | "template";
  to: string;
  body?: string;
  buttons?: ReplyButton[];
  sections?: ListSection[];
  /** the list's open button ("בחירה") */
  buttonText?: string;
  emoji?: string;
  messageId?: string;
  template?: { name: string; params: TemplateParam[]; buttons: TemplateButtonParam[] };
  extra?: unknown;
}

/**
 * Records every send; prints to the console outside tests (DATA_MODE=memory dev runs) unless `log: false` (the website
 * chat records one request's replies and must not copy a conversation into the server logs). `media` is an in-memory
 * media source: `downloadMedia(id)` returns what was put there (tests, and the chat's uploaded recordings).
 */
export class RecordingWaSender implements WaSender {
  sent: RecordedSend[] = [];
  private n = 0;
  media = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private readonly log: boolean;

  constructor(opts: { log?: boolean } = {}) {
    this.log = opts.log ?? true;
  }

  private record(r: RecordedSend): Promise<SendResult> {
    this.sent.push(r);
    if (this.log && process.env.NODE_ENV !== "test") {
      console.info(`[wa:${r.kind}] → ${r.to}${r.body ? `\n${r.body}` : ""}${r.buttons ? `\n[${r.buttons.map((b) => b.title).join("] [")}]` : ""}`);
    }
    return Promise.resolve({ messageId: `wamid.rec.${++this.n}`, waId: r.to.replace(/^\+/, "") });
  }

  sendText(to: string, body: string): Promise<SendResult> {
    return this.record({ kind: "text", to, body });
  }
  sendButtons(to: string, body: string, buttons: ReplyButton[]): Promise<SendResult> {
    return this.record({ kind: "buttons", to, body, buttons });
  }
  sendList(to: string, body: string, buttonText: string, sections: ListSection[]): Promise<SendResult> {
    return this.record({ kind: "list", to, body, sections, buttonText });
  }
  sendImage(to: string, image: { link: string } | { id: string }, caption?: string): Promise<SendResult> {
    return this.record({ kind: "image", to, body: caption, extra: image });
  }
  sendDocument(to: string, doc: ({ link: string } | { id: string }) & { filename?: string }, caption?: string): Promise<SendResult> {
    return this.record({ kind: "document", to, body: caption, extra: doc });
  }
  sendReaction(to: string, messageId: string, emoji: string): Promise<SendResult> {
    return this.record({ kind: "reaction", to, messageId, emoji });
  }
  async markRead(messageId: string): Promise<void> {
    await this.record({ kind: "read", to: "", messageId });
  }
  sendTemplate(to: string, name: string, params: TemplateParam[] = [], buttons: TemplateButtonParam[] = []): Promise<SendResult> {
    return this.record({ kind: "template", to, template: { name, params, buttons } });
  }
  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const m = this.media.get(mediaId);
    if (!m) throw new Error(`no recorded media ${mediaId}`);
    return m;
  }

  /** texts of everything sent, in order — handy in tests */
  get texts(): string[] {
    return this.sent.filter((s) => s.body).map((s) => s.body!);
  }
}
