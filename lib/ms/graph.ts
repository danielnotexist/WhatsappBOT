import { TEAMS_PROVIDER, safeJoinUrl } from "@/lib/online-meeting";

/**
 * Minimal Microsoft Graph client for mail, calendar, OneDrive and change notifications (PLAN §11 milestone 4).
 * Takes an access-token provider so the token store can refresh transparently; retries once on 401.
 */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "GraphError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 408;
  }
  get unauthorized(): boolean {
    return this.status === 401 || this.code === "InvalidAuthenticationToken";
  }
}

export interface GraphMessage {
  id: string;
  subject: string;
  from: { name: string; address: string } | null;
  toRecipients: { name: string; address: string }[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  bodyPreview: string;
  /** plain text (HTML stripped) — only when fetched with `getMessage` */
  bodyText?: string;
  webLink: string | null;
  conversationId: string | null;
}

export interface GraphEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  /** IANA or Windows zone as Graph returned it */
  timeZone: string;
  isAllDay: boolean;
  location: string;
  attendees: { name: string; address: string; response: string }[];
  organizer: { name: string; address: string } | null;
  webLink: string | null;
  bodyPreview: string;
  /** the event has online meeting information (Teams / Skype) */
  isOnlineMeeting: boolean;
  /** "teamsForBusiness", "skypeForBusiness", "skypeForConsumer" or "unknown"; null when Graph did not say */
  onlineMeetingProvider: string | null;
  /** the user organizes the event (only the organizer's changes reach the attendees); null when Graph did not say */
  isOrganizer: boolean | null;
  /** `onlineMeeting.joinUrl` when it is a safe meeting link (lib/online-meeting.ts), else null */
  joinUrl: string | null;
}

export interface DriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  mimeType: string | null;
  isFolder: boolean;
  parentPath: string | null;
}

export interface GraphSubscription {
  id: string;
  resource: string;
  expirationDateTime: string;
  clientState: string | null;
}

export interface NewEvent {
  subject: string;
  /** ISO local date-time without offset, interpreted in `timeZone` */
  start: string;
  end: string;
  timeZone: string;
  location?: string;
  attendees?: string[];
  body?: string;
  isAllDay?: boolean;
  /** true → a Teams meeting (`isOnlineMeeting` + `onlineMeetingProvider: "teamsForBusiness"`); Graph cannot turn it off later */
  onlineMeeting?: boolean;
}

export interface GraphClientOptions {
  getAccessToken: () => Promise<string>;
  /** called after a 401 so the store can force a refresh; return the new token or null to give up */
  onUnauthorized?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  base?: string;
}

/** HTML → readable text: drop scripts/styles, keep line breaks for block elements, decode common entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MSG_SELECT = "id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,webLink,conversationId";
const EVENT_SELECT = "id,subject,start,end,isAllDay,location,attendees,organizer,isOrganizer,webLink,bodyPreview,isOnlineMeeting,onlineMeetingProvider,onlineMeeting";

export class GraphClient {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly opts: GraphClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.base ?? GRAPH_BASE;
  }

  // ---------- transport ----------

  async request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}, retried = false): Promise<T> {
    const token = await this.opts.getAccessToken();
    const url = path.startsWith("http") ? path : `${this.base}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried && this.opts.onUnauthorized) {
      const fresh = await this.opts.onUnauthorized();
      if (fresh) return this.request<T>(method, path, body, extraHeaders, true);
    }
    if (res.status === 204 || res.status === 202) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      const retryAfter = Number(res.headers.get("retry-after"));
      throw new GraphError(`Graph ${res.status}${err?.code ? ` ${err.code}` : ""}: ${err?.message ?? text.slice(0, 200)}`, res.status, err?.code ?? null, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
    }
    return json as T;
  }

  async requestBytes(path: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    const token = await this.opts.getAccessToken();
    const res = await this.fetchImpl(`${this.base}${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
    if (!res.ok) throw new GraphError(`Graph ${res.status} downloading ${path}`, res.status, null);
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
  }

  // ---------- me ----------

  async me(): Promise<{ id: string; displayName: string | null; mail: string | null; userPrincipalName: string | null; mailboxTimeZone: string | null }> {
    const u = await this.request<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string }>("GET", "/me?$select=id,displayName,mail,userPrincipalName");
    let tz: string | null = null;
    try {
      const s = await this.request<{ timeZone?: string }>("GET", "/me/mailboxSettings?$select=timeZone");
      tz = s.timeZone ?? null;
    } catch {
      tz = null;
    }
    return { id: u.id, displayName: u.displayName ?? null, mail: u.mail ?? null, userPrincipalName: u.userPrincipalName ?? null, mailboxTimeZone: tz };
  }

  // ---------- mail ----------

  private mapMessage(m: RawMessage): GraphMessage {
    return {
      id: m.id,
      subject: m.subject ?? "",
      from: m.from?.emailAddress ? { name: m.from.emailAddress.name ?? "", address: m.from.emailAddress.address ?? "" } : null,
      toRecipients: (m.toRecipients ?? []).map((r) => ({ name: r.emailAddress?.name ?? "", address: r.emailAddress?.address ?? "" })),
      receivedDateTime: m.receivedDateTime ?? "",
      isRead: Boolean(m.isRead),
      hasAttachments: Boolean(m.hasAttachments),
      bodyPreview: m.bodyPreview ?? "",
      ...(m.body ? { bodyText: m.body.contentType === "html" ? htmlToText(m.body.content ?? "") : (m.body.content ?? "") } : {}),
      webLink: m.webLink ?? null,
      conversationId: m.conversationId ?? null,
    };
  }

  async listInbox(opts: { top?: number; unreadOnly?: boolean; since?: Date } = {}): Promise<GraphMessage[]> {
    const filters: string[] = [];
    if (opts.unreadOnly) filters.push("isRead eq false");
    if (opts.since) filters.push(`receivedDateTime ge ${opts.since.toISOString()}`);
    const q = new URLSearchParams({ $top: String(opts.top ?? 10), $select: MSG_SELECT, $orderby: "receivedDateTime desc" });
    if (filters.length) q.set("$filter", filters.join(" and "));
    const r = await this.request<{ value: RawMessage[] }>("GET", `/me/mailFolders/inbox/messages?${q}`);
    return r.value.map((m) => this.mapMessage(m));
  }

  /** KQL search across the mailbox (from:, subject:, free text). */
  async searchMessages(query: string, top = 10): Promise<GraphMessage[]> {
    const q = new URLSearchParams({ $search: `"${query.replace(/"/g, " ")}"`, $top: String(top), $select: MSG_SELECT });
    const r = await this.request<{ value: RawMessage[] }>("GET", `/me/messages?${q}`, undefined, { ConsistencyLevel: "eventual" });
    return r.value.map((m) => this.mapMessage(m));
  }

  async getMessage(id: string): Promise<GraphMessage> {
    const m = await this.request<RawMessage>("GET", `/me/messages/${encodeURIComponent(id)}?$select=${MSG_SELECT},body`);
    return this.mapMessage(m);
  }

  async sendMail(input: { to: string[]; cc?: string[]; subject: string; body: string; replyToMessageId?: string; attachments?: { name: string; contentType: string; bytesBase64: string }[] }): Promise<void> {
    const recipients = (list: string[]) => list.map((address) => ({ emailAddress: { address } }));
    if (input.replyToMessageId) {
      await this.request("POST", `/me/messages/${encodeURIComponent(input.replyToMessageId)}/reply`, {
        comment: input.body,
        message: { toRecipients: recipients(input.to), ...(input.cc?.length ? { ccRecipients: recipients(input.cc) } : {}) },
      });
      return;
    }
    await this.request("POST", "/me/sendMail", {
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: recipients(input.to),
        ...(input.cc?.length ? { ccRecipients: recipients(input.cc) } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments.map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: a.bytesBase64 })) } : {}),
      },
      saveToSentItems: true,
    });
  }

  /** Forwards a message with its attachments (POST /me/messages/{id}/forward — covered by Mail.Send, no new scope). */
  async forwardMessage(id: string, to: string[], comment: string): Promise<void> {
    await this.request("POST", `/me/messages/${encodeURIComponent(id)}/forward`, {
      comment,
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    });
  }

  /** Attachment names / sizes for display (no content). */
  async listAttachments(id: string): Promise<{ name: string; size: number; contentType: string | null }[]> {
    const r = await this.request<{ value: { name?: string; size?: number; contentType?: string }[] }>("GET", `/me/messages/${encodeURIComponent(id)}/attachments?$select=name,size,contentType`);
    return r.value.map((a) => ({ name: a.name ?? "", size: a.size ?? 0, contentType: a.contentType ?? null }));
  }

  // ---------- calendar ----------

  private mapEvent(e: RawEvent): GraphEvent {
    return {
      id: e.id,
      subject: e.subject ?? "",
      start: e.start?.dateTime ?? "",
      end: e.end?.dateTime ?? "",
      timeZone: e.start?.timeZone ?? "UTC",
      isAllDay: Boolean(e.isAllDay),
      location: e.location?.displayName ?? "",
      attendees: (e.attendees ?? []).map((a) => ({ name: a.emailAddress?.name ?? "", address: a.emailAddress?.address ?? "", response: a.status?.response ?? "none" })),
      organizer: e.organizer?.emailAddress ? { name: e.organizer.emailAddress.name ?? "", address: e.organizer.emailAddress.address ?? "" } : null,
      webLink: e.webLink ?? null,
      bodyPreview: e.bodyPreview ?? "",
      isOnlineMeeting: Boolean(e.isOnlineMeeting),
      onlineMeetingProvider: typeof e.onlineMeetingProvider === "string" ? e.onlineMeetingProvider : null,
      isOrganizer: typeof e.isOrganizer === "boolean" ? e.isOrganizer : null,
      joinUrl: safeJoinUrl(e.onlineMeeting?.joinUrl),
    };
  }

  /** Events between two instants, returned in `timeZone` (Prefer: outlook.timezone). */
  async calendarView(start: Date, end: Date, timeZone = "Asia/Jerusalem", top = 50): Promise<GraphEvent[]> {
    const q = new URLSearchParams({ startDateTime: start.toISOString(), endDateTime: end.toISOString(), $top: String(top), $orderby: "start/dateTime", $select: EVENT_SELECT });
    const r = await this.request<{ value: RawEvent[] }>("GET", `/me/calendarView?${q}`, undefined, { Prefer: `outlook.timezone="${timeZone}"` });
    return r.value.map((e) => this.mapEvent(e));
  }

  async getEvent(id: string, timeZone = "Asia/Jerusalem"): Promise<GraphEvent> {
    const q = new URLSearchParams({ $select: EVENT_SELECT });
    const e = await this.request<RawEvent>("GET", `/me/events/${encodeURIComponent(id)}?${q}`, undefined, { Prefer: `outlook.timezone="${timeZone}"` });
    return this.mapEvent(e);
  }

  async createEvent(input: NewEvent): Promise<GraphEvent> {
    const e = await this.request<RawEvent>("POST", "/me/events", this.eventBody(input), { Prefer: `outlook.timezone="${input.timeZone}"` });
    return this.mapEvent(e);
  }

  async updateEvent(id: string, patch: Partial<NewEvent> & { timeZone: string }): Promise<GraphEvent> {
    const e = await this.request<RawEvent>("PATCH", `/me/events/${encodeURIComponent(id)}`, this.eventBody(patch), { Prefer: `outlook.timezone="${patch.timeZone}"` });
    return this.mapEvent(e);
  }

  /**
   * The online meeting providers the default calendar allows (GET /me/calendar, covered by Calendars.ReadWrite).
   * A work or school account with Teams lists "teamsForBusiness"; a personal Microsoft account lists
   * "skypeForConsumer" (and Graph then creates the event without a meeting: 201 with onlineMeeting null). A successful
   * answer without the list counts as none allowed. Null only when the request itself failed; an expired connection
   * still throws.
   */
  async onlineMeetingProviders(): Promise<string[] | null> {
    try {
      const c = await this.request<{ allowedOnlineMeetingProviders?: unknown }>("GET", "/me/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider");
      return Array.isArray(c?.allowedOnlineMeetingProviders) ? c.allowedOnlineMeetingProviders.filter((p): p is string => typeof p === "string") : [];
    } catch (e) {
      if (e instanceof GraphError && e.unauthorized) throw e;
      return null;
    }
  }

  /** Cancels (organizer: sends cancellation) or deletes the event. */
  async deleteEvent(id: string, comment?: string): Promise<void> {
    try {
      await this.request("POST", `/me/events/${encodeURIComponent(id)}/cancel`, { comment: comment ?? "" });
    } catch (e) {
      if (e instanceof GraphError && (e.status === 400 || e.status === 403)) await this.request("DELETE", `/me/events/${encodeURIComponent(id)}`);
      else throw e;
    }
  }

  private eventBody(e: Partial<NewEvent> & { timeZone: string }): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (e.subject !== undefined) body.subject = e.subject;
    if (e.start !== undefined) body.start = { dateTime: e.start, timeZone: e.timeZone };
    if (e.end !== undefined) body.end = { dateTime: e.end, timeZone: e.timeZone };
    if (e.location !== undefined) body.location = { displayName: e.location };
    if (e.attendees !== undefined) body.attendees = e.attendees.map((address) => ({ emailAddress: { address }, type: "required" }));
    if (e.body !== undefined) body.body = { contentType: "Text", content: e.body };
    if (e.isAllDay !== undefined) body.isAllDay = e.isAllDay;
    if (e.onlineMeeting) Object.assign(body, { isOnlineMeeting: true, onlineMeetingProvider: TEAMS_PROVIDER });
    return body;
  }

  // ---------- files ----------

  private mapItem(i: RawDriveItem): DriveItem {
    return { id: i.id, name: i.name ?? "", size: i.size ?? 0, lastModifiedDateTime: i.lastModifiedDateTime ?? "", webUrl: i.webUrl ?? "", mimeType: i.file?.mimeType ?? null, isFolder: Boolean(i.folder), parentPath: i.parentReference?.path ?? null };
  }

  async searchFiles(query: string, top = 10): Promise<DriveItem[]> {
    const q = new URLSearchParams({ $top: String(top), $select: "id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference" });
    const r = await this.request<{ value: RawDriveItem[] }>("GET", `/me/drive/root/search(q='${encodeURIComponent(query.replace(/'/g, "''"))}')?${q}`);
    return r.value.map((i) => this.mapItem(i)).filter((i) => !i.isFolder);
  }

  async getItem(id: string): Promise<DriveItem> {
    return this.mapItem(await this.request<RawDriveItem>("GET", `/me/drive/items/${encodeURIComponent(id)}?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference`));
  }

  /** Raw bytes, or the PDF rendition (`?format=pdf`) for Office documents (PLAN §11 milestone 4). */
  downloadItem(id: string, format?: "pdf"): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    return this.requestBytes(`/me/drive/items/${encodeURIComponent(id)}/content${format ? `?format=${format}` : ""}`);
  }

  // ---------- change notifications ----------

  async createSubscription(input: { resource: string; notificationUrl: string; clientState: string; expiresAt: Date; changeType?: string }): Promise<GraphSubscription> {
    const s = await this.request<RawSubscription>("POST", "/subscriptions", { changeType: input.changeType ?? "created", notificationUrl: input.notificationUrl, resource: input.resource, expirationDateTime: input.expiresAt.toISOString(), clientState: input.clientState });
    return { id: s.id, resource: s.resource, expirationDateTime: s.expirationDateTime, clientState: s.clientState ?? null };
  }

  async renewSubscription(id: string, expiresAt: Date): Promise<GraphSubscription> {
    const s = await this.request<RawSubscription>("PATCH", `/subscriptions/${encodeURIComponent(id)}`, { expirationDateTime: expiresAt.toISOString() });
    return { id: s.id, resource: s.resource, expirationDateTime: s.expirationDateTime, clientState: s.clientState ?? null };
  }

  async deleteSubscription(id: string): Promise<void> {
    try {
      await this.request("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
    } catch (e) {
      if (!(e instanceof GraphError && e.status === 404)) throw e;
    }
  }
}

// ---- raw Graph shapes (subset) ----
interface RawAddress {
  emailAddress?: { name?: string; address?: string };
}
interface RawMessage {
  id: string;
  subject?: string;
  from?: RawAddress;
  toRecipients?: RawAddress[];
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  webLink?: string;
  conversationId?: string;
}
interface RawEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  attendees?: (RawAddress & { status?: { response?: string } })[];
  organizer?: RawAddress;
  webLink?: string;
  bodyPreview?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  isOrganizer?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
}
interface RawDriveItem {
  id: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  parentReference?: { path?: string };
}
interface RawSubscription {
  id: string;
  resource: string;
  expirationDateTime: string;
  clientState?: string;
}
