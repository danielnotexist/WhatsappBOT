import type { MailLike, SentRef } from "@/lib/jobs/awaiting-reply";
import { htmlToText } from "@/lib/ms/graph";
import { GOOGLE_API, GoogleApiError, type GoogleClient } from "./client";

/**
 * Gmail read client (gmail.readonly) on top of GoogleClient's fetch transport — no SDK. Endpoints verified on
 * developers.google.com/workspace/gmail/api/reference/rest (2026-10):
 *   users.getProfile        GET /gmail/v1/users/me/profile
 *   users.messages.list     GET /gmail/v1/users/me/messages?q&maxResults&labelIds&pageToken   → ids only
 *   users.messages.get      GET /gmail/v1/users/me/messages/{id}?format=metadata|full&metadataHeaders=…
 *   users.messages.attachments.get  GET …/messages/{id}/attachments/{attachmentId}           → large body parts
 *   users.threads.list      GET /gmail/v1/users/me/threads?q&maxResults (default 100, max 500)
 *   users.threads.get       GET /gmail/v1/users/me/threads/{id}?format=metadata&metadataHeaders=…
 * `q` is Gmail search-box syntax (from:, subject:, newer_than:7d, is:unread, has:attachment …).
 * Everything returned here is the user's mailbox content — callers hand it to the model wrapped as data
 * (lib/ai/untrusted.ts), never as instructions.
 */

export const GMAIL_LIMITS = {
  /** body text handed to the model (parity with Microsoft get_email) */
  maxBodyChars: 6000,
  /** HTML larger than this is cut before the HTML → text pass (regexes on megabytes are slow) */
  maxHtmlChars: 400_000,
  /** a body part stored as an attachment is fetched only up to this size */
  maxBodyPartBytes: 512 * 1024,
  /** messages.list page for the search tool */
  maxSearchResults: 25,
  /** parallel messages.get / threads.get calls (per-user quota: 250 units/s; get = 5 units) */
  concurrency: 5,
} as const;

const METADATA_HEADERS = ["From", "To", "Cc", "Subject", "Date", "List-Unsubscribe", "Auto-Submitted", "Precedence", "Reply-To", "Importance", "X-Priority"];
/** Gmail's own tabs and chat history — never "awaiting a reply" */
export const GMAIL_NOT_PERSONAL = "-category:promotions -category:social -category:updates -category:forums -in:chats";

export interface GmailAddress {
  name: string;
  address: string;
}

export interface GmailAttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  subject: string;
  from: GmailAddress | null;
  to: GmailAddress[];
  cc: GmailAddress[];
  /** ISO 8601 (UTC) from internalDate */
  date: string;
  /** Gmail's preview, entities decoded */
  snippet: string;
  unread: boolean;
  /** sent by the account (SENT label) */
  sent: boolean;
  inInbox: boolean;
  /** List-Unsubscribe / Auto-Submitted / Precedence: bulk — a mailing, not a person */
  automated: boolean;
  /** Reply-To (empty when the header is absent) — the phishing checks compare it with From (lib/proactive/phishing.ts) */
  replyTo: GmailAddress[];
  /** "high" when Importance: high or X-Priority 1–2; "low" / "normal" likewise; null when neither header is set */
  importance: "high" | "normal" | "low" | null;
  hasAttachments: boolean;
  /** format=full only */
  attachments?: GmailAttachmentInfo[];
  bodyText?: string;
  bodyTruncated?: boolean;
}

export interface GmailThreadSummary {
  id: string;
  snippet: string;
}

// ---------- decoding helpers (exported for tests) ----------

/** RFC 2047 encoded-words (`=?UTF-8?B?…?=`, `=?windows-1255?Q?…?=`). A no-op on already-decoded text. */
export function decodeMimeWords(value: string): string {
  const joined = value.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?)/g, "$1");
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
    try {
      const bytes = enc.toUpperCase() === "B" ? Buffer.from(text, "base64") : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return decodeBytes(bytes, charset.split("*")[0]!);
    } catch {
      return whole;
    }
  });
}

const oneLine = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A decoded header value as one line: RFC 2047 can carry CR/LF (`=0A` in a Q-word) and other controls, which would
 * let a sender add fake lines wherever the subject or name is printed (e.g. the morning summary). Whitespace runs
 * (newlines included) become one space; other C0/C1 controls are dropped.
 */
export function headerText(value: string): string {
  return oneLine(decodeMimeWords(value));
}

export function decodeBytes(bytes: Uint8Array, charset = "utf-8"): string {
  try {
    return new TextDecoder(charset.trim().toLowerCase() || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Gmail snippets are HTML-escaped ("&#39;", "&quot;"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

/** "Name <a@b>", '"Last, First" <a@b>', "a@b" — comma-separated, commas inside quotes/brackets respected. */
export function parseAddressList(value: string | null | undefined): GmailAddress[] {
  if (!value) return [];
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (const ch of decodeMimeWords(value)) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle++;
    else if (!quoted && ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map(oneLine)
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*?)\s*<([^<>]+)>\s*$/);
      if (m) return { name: m[1]!.trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim(), address: m[2]!.trim().toLowerCase() };
      return { name: "", address: p.replace(/^<|>$/g, "").trim().toLowerCase() };
    })
    .filter((a) => a.address.includes("@"));
}

const b64url = (data: string) => new Uint8Array(Buffer.from(data, "base64url"));
const header = (headers: RawHeader[] | undefined, name: string) => headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
const charsetOf = (part: RawPart) => header(part.headers, "Content-Type")?.match(/charset\s*=\s*"?([^";\s]+)"?/i)?.[1] ?? "utf-8";
const isAttachment = (p: RawPart) => Boolean(p.filename) || /^\s*attachment/i.test(header(p.headers, "Content-Disposition") ?? "");

function walk(part: RawPart | undefined, visit: (p: RawPart) => void): void {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

// ---------- the reader ----------

export interface GmailListOptions {
  q?: string;
  maxResults?: number;
  labelIds?: string[];
  pageToken?: string;
}

export class GmailReader {
  constructor(private readonly g: Pick<GoogleClient, "json">) {}

  private url(path: string, params: Record<string, string | string[] | undefined> = {}): string {
    const u = new URL(`${GOOGLE_API.gmail}/users/me${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "") continue;
      for (const item of Array.isArray(v) ? v : [v]) u.searchParams.append(k, item);
    }
    return u.toString();
  }

  async profile(): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }> {
    const p = await this.g.json<{ emailAddress?: string; messagesTotal?: number; threadsTotal?: number }>("GET", this.url("/profile"));
    return { emailAddress: (p.emailAddress ?? "").toLowerCase(), messagesTotal: p.messagesTotal ?? 0, threadsTotal: p.threadsTotal ?? 0 };
  }

  /** users.messages.list — ids only (newest first). */
  async listMessageIds(opts: GmailListOptions = {}): Promise<{ ids: { id: string; threadId: string }[]; nextPageToken: string | null; resultSizeEstimate: number }> {
    const r = await this.g.json<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
      "GET",
      this.url("/messages", { q: opts.q?.trim(), maxResults: String(clamp(opts.maxResults ?? 10, 1, 500)), labelIds: opts.labelIds, pageToken: opts.pageToken }),
    );
    return { ids: r.messages ?? [], nextPageToken: r.nextPageToken ?? null, resultSizeEstimate: r.resultSizeEstimate ?? 0 };
  }

  /** Headers + snippet + labels (format=metadata: no body is transferred). */
  async getMessageMetadata(id: string): Promise<GmailMessage> {
    return mapMessage(await this.g.json<RawMessage>("GET", this.url(`/messages/${encodeURIComponent(id)}`, { format: "metadata", metadataHeaders: METADATA_HEADERS })));
  }

  /** The full message: headers, attachment list and the body as plain text (text/plain preferred, else HTML → text), capped. */
  async getMessage(id: string, opts: { maxBodyChars?: number } = {}): Promise<GmailMessage> {
    const raw = await this.g.json<RawMessage>("GET", this.url(`/messages/${encodeURIComponent(id)}`, { format: "full" }));
    const msg = mapMessage(raw);
    const all: RawPart[] = [];
    walk(raw.payload, (p) => all.push(p));
    const attachments: GmailAttachmentInfo[] = all.filter((p) => isAttachment(p) && p.filename).map((p) => ({ filename: headerText(p.filename!), mimeType: p.mimeType ?? "application/octet-stream", size: p.body?.size ?? 0 }));
    const inline = all.filter((p) => !isAttachment(p));
    const plain = inline.find((p) => p.mimeType === "text/plain") ?? null;
    const html = inline.find((p) => p.mimeType === "text/html") ?? null;
    const part = plain ?? html;
    let text = "";
    // the body part exists but was not fetched (larger than maxBodyPartBytes): the text we hand over is incomplete
    let skipped = false;
    if (part) {
      const got = await this.partBytes(raw.id, part);
      skipped = got.skipped;
      const decoded = got.bytes ? decodeBytes(got.bytes, charsetOf(part)) : "";
      text = part === html ? htmlToText(decoded.slice(0, GMAIL_LIMITS.maxHtmlChars)) : decoded.replace(/\r\n?/g, "\n").trim();
    } else if (!raw.payload?.parts?.length && raw.payload?.body?.data) {
      text = decodeBytes(b64url(raw.payload.body.data)).trim();
    }
    const max = opts.maxBodyChars ?? GMAIL_LIMITS.maxBodyChars;
    return { ...msg, attachments, hasAttachments: attachments.length > 0, bodyText: text.slice(0, max), bodyTruncated: skipped || text.length > max };
  }

  /** A body part's bytes: inline `data`, or (large parts) the attachments endpoint up to maxBodyPartBytes; larger → skipped. */
  private async partBytes(messageId: string, part: RawPart): Promise<{ bytes: Uint8Array | null; skipped: boolean }> {
    if (part.body?.data) return { bytes: b64url(part.body.data), skipped: false };
    if (!part.body?.attachmentId) return { bytes: null, skipped: false };
    if ((part.body.size ?? 0) > GMAIL_LIMITS.maxBodyPartBytes) return { bytes: null, skipped: true };
    const a = await this.g.json<{ data?: string }>("GET", this.url(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`));
    return { bytes: a.data ? b64url(a.data) : null, skipped: false };
  }

  /** Search (Gmail `q`) → metadata of each hit, newest first. Empty query = the inbox. */
  async searchMessages(opts: { q?: string; maxResults?: number } = {}): Promise<GmailMessage[]> {
    const { ids } = await this.listMessageIds({ q: opts.q?.trim() || "in:inbox", maxResults: clamp(opts.maxResults ?? 10, 1, GMAIL_LIMITS.maxSearchResults) });
    const msgs = await mapLimit(ids, GMAIL_LIMITS.concurrency, (m) => skipGone(this.getMessageMetadata(m.id)));
    return msgs.filter((m): m is GmailMessage => m !== null).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }

  async listThreads(opts: GmailListOptions = {}): Promise<{ threads: GmailThreadSummary[]; nextPageToken: string | null }> {
    const r = await this.g.json<{ threads?: { id: string; snippet?: string }[]; nextPageToken?: string }>(
      "GET",
      this.url("/threads", { q: opts.q?.trim(), maxResults: String(clamp(opts.maxResults ?? 10, 1, 500)), labelIds: opts.labelIds, pageToken: opts.pageToken }),
    );
    return { threads: (r.threads ?? []).map((t) => ({ id: t.id, snippet: decodeEntities(t.snippet ?? "") })), nextPageToken: r.nextPageToken ?? null };
  }

  /** All messages of a thread (metadata), oldest first. */
  async getThread(id: string): Promise<{ id: string; messages: GmailMessage[] }> {
    const t = await this.g.json<{ id: string; messages?: RawMessage[] }>("GET", this.url(`/threads/${encodeURIComponent(id)}`, { format: "metadata", metadataHeaders: METADATA_HEADERS }));
    return { id: t.id, messages: (t.messages ?? []).map(mapMessage).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)) };
  }

  /**
   * Inputs for the "awaiting a reply" heuristic (lib/jobs/awaiting-reply.ts): the recent personal inbox threads,
   * their messages from others (inbox side) and the account's own replies (SENT) — one threads.list + one
   * threads.get per thread, so a reply sent from any device counts.
   */
  async awaitingReplyInputs(opts: { newerThanDays?: number; maxThreads?: number } = {}): Promise<{ inbox: (MailLike & { id: string; message: GmailMessage })[]; sent: SentRef[]; contacts: GmailAddress[] }> {
    const days = clamp(opts.newerThanDays ?? 7, 1, 30);
    const { threads } = await this.listThreads({ q: `in:inbox newer_than:${days}d ${GMAIL_NOT_PERSONAL}`, maxResults: clamp(opts.maxThreads ?? 15, 1, 50) });
    const full = await mapLimit(threads, GMAIL_LIMITS.concurrency, (t) => skipGone(this.getThread(t.id)));
    const inbox: (MailLike & { id: string; message: GmailMessage })[] = [];
    const sent: SentRef[] = [];
    // who the account wrote to in these threads — the "known contacts" of the proactive checks (lib/proactive)
    const contacts = new Map<string, GmailAddress>();
    for (const t of full) {
      if (!t) continue;
      for (const m of t.messages) {
        if (m.sent) {
          sent.push({ conversationId: m.threadId, sentDateTime: m.date });
          for (const a of [...m.to, ...m.cc]) if (!contacts.has(a.address)) contacts.set(a.address, a);
        } else if (!m.automated && !m.labelIds.includes("DRAFT")) inbox.push(toMailLike(m));
      }
    }
    return { inbox, sent, contacts: [...contacts.values()] };
  }
}

/**
 * Who the account wrote to lately (To and Cc of its sent messages, lower-case, no duplicates): the "known contacts" the
 * phishing checks compare a sender with. One messages.list + one metadata get per sent message (≤ `max`).
 */
export async function gmailSentRecipients(reader: GmailReader, opts: { newerThanDays?: number; max?: number } = {}): Promise<GmailAddress[]> {
  const { ids } = await reader.listMessageIds({ q: `in:sent newer_than:${clamp(opts.newerThanDays ?? 60, 1, 365)}d`, maxResults: clamp(opts.max ?? 15, 1, 50) });
  const msgs = await mapLimit(ids, GMAIL_LIMITS.concurrency, (m) => skipGone(reader.getMessageMetadata(m.id)));
  const seen = new Map<string, GmailAddress>();
  for (const m of msgs) for (const a of [...(m?.to ?? []), ...(m?.cc ?? [])]) if (!seen.has(a.address)) seen.set(a.address, a);
  return [...seen.values()];
}

export function toMailLike(m: GmailMessage): MailLike & { id: string; message: GmailMessage } {
  return { id: m.id, subject: m.subject, from: m.from, receivedDateTime: m.date, isRead: !m.unread, bodyPreview: m.snippet, conversationId: m.threadId, message: m };
}

function mapMessage(r: RawMessage): GmailMessage {
  const h = r.payload?.headers;
  const labels = r.labelIds ?? [];
  const internal = Number(r.internalDate);
  const dateHeader = header(h, "Date");
  const date = Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : dateHeader && Number.isFinite(Date.parse(dateHeader)) ? new Date(dateHeader).toISOString() : "";
  const precedence = (header(h, "Precedence") ?? "").toLowerCase();
  const autoSubmitted = (header(h, "Auto-Submitted") ?? "no").toLowerCase();
  const importanceHeader = (header(h, "Importance") ?? "").trim().toLowerCase();
  const xPriority = Number((header(h, "X-Priority") ?? "").trim().charAt(0));
  const importance = importanceHeader === "high" || xPriority === 1 || xPriority === 2 ? "high" : importanceHeader === "low" || xPriority === 4 || xPriority === 5 ? "low" : importanceHeader || xPriority ? "normal" : null;
  const parts: RawPart[] = [];
  walk(r.payload, (p) => parts.push(p));
  const attachments = parts.some((p) => p !== r.payload && isAttachment(p));
  return {
    id: r.id,
    threadId: r.threadId ?? r.id,
    labelIds: labels,
    subject: headerText(header(h, "Subject") ?? ""),
    from: parseAddressList(header(h, "From"))[0] ?? null,
    to: parseAddressList(header(h, "To")),
    cc: parseAddressList(header(h, "Cc")),
    date,
    snippet: decodeEntities(r.snippet ?? ""),
    unread: labels.includes("UNREAD"),
    sent: labels.includes("SENT"),
    inInbox: labels.includes("INBOX"),
    automated: Boolean(header(h, "List-Unsubscribe")) || (autoSubmitted !== "no" && autoSubmitted !== "") || ["bulk", "list", "junk"].includes(precedence),
    hasAttachments: attachments || (r.payload?.mimeType ?? "").startsWith("multipart/mixed"),
    replyTo: parseAddressList(header(h, "Reply-To")),
    importance,
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(Math.trunc(Number(n) || min), min), max);

/** A message/thread deleted between the list call and the get call is skipped, not an error. */
async function skipGone<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof GoogleApiError && e.notFound) return null;
    throw e;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---- raw Gmail shapes (subset) ----
interface RawHeader {
  name: string;
  value: string;
}
interface RawPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: RawHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: RawPart[];
}
interface RawMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  sizeEstimate?: number;
  payload?: RawPart;
}
