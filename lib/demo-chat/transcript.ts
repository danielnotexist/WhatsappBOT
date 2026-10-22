import { randomUUID } from "node:crypto";
import { copy } from "@/lib/copy/bot";
import type { Db, MessageRow, NewMessage } from "@/lib/db/types";
import { RecordingWaSender, type RecordedSend } from "@/lib/wa/sender";
import type { ChatItem, ChatListSection } from "./types";

/**
 * What the website chat shows is what the pipeline "sent" to the chat's number — recorded by a per-request
 * RecordingWaSender — and, after a reload, the same messages read back from `messages`.
 *
 * The pipeline stores most of its replies itself (`say()`, the assistant's answer, the agent flows), but not all: the
 * welcome after linking, onboarding questions, drafts with their buttons, button outcomes. On WhatsApp those live on
 * the phone; here they must be stored for the history. `ChatTranscript` wraps the data layer: when the pipeline stores
 * an outbound row, the sends it did not store before it are stored first (in order, `hidden_from_model` — the model's
 * context stays exactly as on WhatsApp), and the row is matched to its send. Rows the pipeline stores without sending
 * them (the assistant's text next to a draft) are marked `demo-chat:unsent` and left out of the history.
 * Buttons and lists ride on the row as `media_url = "wa-interactive:<json>"` (like the inbound `wa-media:<id>`).
 */

export const INTERACTIVE_PREFIX = "wa-interactive:";
export const UNSENT_MARK = "demo-chat:unsent";

/** "מקשיבה…" is a processing state (never stored on WhatsApp either); the page shows its typing dots instead. */
const isProcessingState = (s: RecordedSend) => s.kind === "text" && s.body === copy["proc.listening"]();

function displayable(s: RecordedSend): boolean {
  return (s.kind === "text" || s.kind === "buttons" || s.kind === "list" || s.kind === "document" || s.kind === "image") && !isProcessingState(s);
}

function linkOf(extra: unknown): string | null {
  const link = (extra as { link?: unknown } | null)?.link;
  return typeof link === "string" && /^https?:\/\//.test(link) ? link : null;
}

function interactiveOf(s: RecordedSend): string | null {
  if (s.kind === "buttons" && s.buttons?.length) return INTERACTIVE_PREFIX + JSON.stringify({ buttons: s.buttons });
  if (s.kind === "list" && s.sections?.length) return INTERACTIVE_PREFIX + JSON.stringify({ list: { button: s.buttonText ?? "", sections: s.sections } });
  return null;
}

function rowFor(userId: string, s: RecordedSend): NewMessage {
  const base = { user_id: userId, direction: "out" as const, hidden_from_model: true };
  switch (s.kind) {
    case "buttons":
    case "list":
      return { ...base, type: "button", text: s.body ?? "", media_url: interactiveOf(s) };
    case "document":
      return { ...base, type: "doc", text: s.body || ((s.extra as { filename?: string } | null)?.filename ?? ""), media_url: linkOf(s.extra) };
    case "image":
      return { ...base, type: "image", text: s.body ?? "", media_url: linkOf(s.extra) };
    default:
      return { ...base, type: "text", text: s.body ?? "" };
  }
}

export class ChatTranscript {
  /** the request's sender: records, never sends, never logs the conversation */
  readonly wa = new RecordingWaSender({ log: false });
  /** sends before this index are stored (by the pipeline or by us) or not displayable */
  private stored = 0;
  readonly db: Db;

  constructor(
    private readonly base: Db,
    private readonly userId: string,
  ) {
    const insertMessage = (row: NewMessage) => this.insert(row);
    this.db = new Proxy(base, {
      get(target, prop) {
        if (prop === "insertMessage") return insertMessage;
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  }

  private async storeUntil(end: number): Promise<void> {
    for (; this.stored < end; this.stored++) {
      const s = this.wa.sent[this.stored]!;
      if (displayable(s)) await this.base.insertMessage(rowFor(this.userId, s));
    }
  }

  private async insert(row: NewMessage): Promise<MessageRow | null> {
    if (row.direction !== "out" || row.user_id !== this.userId) return this.base.insertMessage(row);
    let at = -1;
    for (let i = this.stored; i < this.wa.sent.length; i++) {
      const s = this.wa.sent[i]!;
      if (displayable(s) && (s.body ?? "") === (row.text ?? "")) {
        at = i;
        break;
      }
    }
    if (at < 0) {
      await this.storeUntil(this.wa.sent.length);
      return this.base.insertMessage({ ...row, media_url: row.media_url ?? UNSENT_MARK });
    }
    await this.storeUntil(at);
    this.stored = at + 1;
    const s = this.wa.sent[at]!;
    return this.base.insertMessage({ ...row, media_url: row.media_url ?? interactiveOf(s) ?? (s.kind === "document" || s.kind === "image" ? linkOf(s.extra) : null) });
  }

  /** Stores what is left (the end of the request). */
  async flush(): Promise<void> {
    await this.storeUntil(this.wa.sent.length);
  }

  /** What this request showed, in order, as bubbles. */
  items(now: Date = new Date()): ChatItem[] {
    return this.wa.sent.filter(displayable).map((s) => sendItem(s, now));
  }
}

/** A recorded send as a bubble (the live answer). */
export function sendItem(s: RecordedSend, now: Date): ChatItem {
  const at = now.toISOString();
  const id = `live-${randomUUID()}`;
  if (s.kind === "buttons") return { id, side: "bot", kind: "buttons", text: s.body ?? "", at, buttons: s.buttons ?? [] };
  if (s.kind === "list") return { id, side: "bot", kind: "list", text: s.body ?? "", at, list: { button: s.buttonText ?? "", sections: (s.sections ?? []) as ChatListSection[] } };
  if (s.kind === "document") {
    const extra = s.extra as { filename?: string } | null;
    return { id, side: "bot", kind: "document", text: s.body ?? "", at, link: linkOf(s.extra), filename: extra?.filename ?? null };
  }
  if (s.kind === "image") return { id, side: "bot", kind: "image", text: s.body ?? "", at, link: linkOf(s.extra) };
  return { id, side: "bot", kind: "text", text: s.body ?? "", at };
}

function parseInteractive(mediaUrl: string | null): Pick<ChatItem, "kind" | "buttons" | "list"> | null {
  if (!mediaUrl?.startsWith(INTERACTIVE_PREFIX)) return null;
  try {
    const j = JSON.parse(mediaUrl.slice(INTERACTIVE_PREFIX.length)) as { buttons?: ChatItem["buttons"]; list?: ChatItem["list"] };
    if (Array.isArray(j.buttons)) return { kind: "buttons", buttons: j.buttons.filter((b) => typeof b?.id === "string" && typeof b?.title === "string") };
    if (j.list && Array.isArray(j.list.sections)) return { kind: "list", list: { button: String(j.list.button ?? ""), sections: j.list.sections } };
  } catch {
    /* a plain bubble */
  }
  return null;
}

/**
 * The media id of a recording made in the chat. It carries the recording's length, so the history shows it after a
 * reload (the inbound row stores `media_url = "wa-media:<id>"`, as for a WhatsApp voice note).
 */
export function demoMediaId(durationMs: number | null): string {
  const ms = durationMs && Number.isFinite(durationMs) && durationMs > 0 ? `.${Math.round(durationMs)}ms` : "";
  return `demo-media.${randomUUID()}${ms}`;
}

function recordedDurationMs(mediaUrl: string | null): number | null {
  const m = mediaUrl?.match(/^wa-media:demo-media\.[0-9a-f-]{36}\.(\d{1,7})ms$/);
  return m ? Number(m[1]) : null;
}

/** A stored message as a bubble (the history). Null for rows the chat never showed. */
export function rowItem(m: MessageRow): ChatItem | null {
  const base = { id: m.id, at: m.created_at };
  if (m.direction === "in") {
    if (m.type === "audio") return { ...base, side: "user", kind: "voice", text: "", transcript: m.transcript, durationMs: recordedDurationMs(m.media_url) };
    if (m.type === "button") return { ...base, side: "user", kind: "choice", text: m.text ?? "" };
    return { ...base, side: "user", kind: "text", text: m.text ?? m.transcript ?? "" };
  }
  if (m.media_url === UNSENT_MARK) return null;
  const interactive = parseInteractive(m.media_url);
  if (interactive) return { ...base, side: "bot", text: m.text ?? "", ...interactive };
  if (m.type === "doc" || m.type === "image") {
    const link = m.media_url && /^https?:\/\//.test(m.media_url) ? m.media_url : null;
    return { ...base, side: "bot", kind: m.type === "doc" ? "document" : "image", text: m.text ?? "", link };
  }
  if (!m.text) return null;
  return { ...base, side: "bot", kind: "text", text: m.text };
}
