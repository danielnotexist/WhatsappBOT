import { TEAMS_PROVIDER, joinUrlInText, safeJoinUrl } from "@/lib/online-meeting";

/**
 * Minimal Microsoft Graph client for mail, calendar, OneDrive, SharePoint (Microsoft Search), Microsoft To Do and change
 * notifications (PLAN §11 milestone 4).
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
  /** with `listInbox({ withHeaders })` / `getMessage`: the Reply-To addresses (empty when none) */
  replyTo?: { name: string; address: string }[];
  /** "low" | "normal" | "high" (with withHeaders / getMessage) */
  importance?: string;
  /**
   * with `listInbox({ withHeaders })` only: the bulk-mail headers the proactive checks read (List-Unsubscribe,
   * Auto-Submitted, Precedence), lower-case names; absent headers are left out
   */
  headers?: Record<string, string>;
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
  /** a meeting link written in the location or the body preview (e.g. the Zoom add-in), when safe; else null */
  textJoinUrl: string | null;
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

/** A document found by Microsoft Search (OneDrive or a SharePoint library): read it with its drive id + item id. */
export interface SearchFileHit {
  driveId: string | null;
  itemId: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
  size: number | null;
  /** the search snippet (HTML highlight tags removed) */
  summary: string;
}

export interface SearchSiteHit {
  id: string;
  name: string;
  webUrl: string;
  description: string;
}

export interface TodoList {
  id: string;
  name: string;
  /** wellknownListName "defaultList" — the "Tasks" list */
  isDefault: boolean;
}

export interface TodoTask {
  id: string;
  title: string;
  status: string;
  /** YYYY-MM-DD or null */
  due: string | null;
  notes: string;
  importance: string;
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
  /**
   * POST only: Graph's `transactionId`, "for the server to avoid redundant POST operations in case of client retries".
   * The pending action's id, so one approved action is one event.
   */
  transactionId?: string;
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
/** the extra fields of listInbox({ withHeaders }) — internetMessageHeaders is returned only when selected */
const MSG_HEADERS_SELECT = "replyTo,importance,internetMessageHeaders";
/** the Outlook category "לסמן כחשוד" adds (shown as a colourless category until the user gives it a colour) */
export const SUSPICIOUS_CATEGORY = "חשוד - פישינג";
const BULK_HEADERS = new Set(["list-unsubscribe", "list-id", "auto-submitted", "precedence", "x-auto-response-suppress"]);
/** The bulk-mail headers of a message, lower-case names (the first value of each). */
function bulkHeaders(list: { name?: string; value?: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of list) {
    const name = (h.name ?? "").toLowerCase();
    if (BULK_HEADERS.has(name) && !(name in out)) out[name] = String(h.value ?? "").slice(0, 300);
  }
  return out;
}
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
    if (!res.ok) throw new GraphError(`Graph ${res.status} downloading ${path}`, res.status, res.status === 403 ? "accessDenied" : null);
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
      ...(m.replyTo ? { replyTo: m.replyTo.map((r) => ({ name: r.emailAddress?.name ?? "", address: r.emailAddress?.address ?? "" })) } : {}),
      ...(typeof m.importance === "string" ? { importance: m.importance } : {}),
      ...(m.internetMessageHeaders ? { headers: bulkHeaders(m.internetMessageHeaders) } : {}),
    };
  }

  /** `withHeaders`: also Reply-To, importance and the bulk-mail headers (the proactive checks, lib/proactive). */
  async listInbox(opts: { top?: number; unreadOnly?: boolean; since?: Date; withHeaders?: boolean } = {}): Promise<GraphMessage[]> {
    const filters: string[] = [];
    if (opts.unreadOnly) filters.push("isRead eq false");
    if (opts.since) filters.push(`receivedDateTime ge ${opts.since.toISOString()}`);
    const q = new URLSearchParams({ $top: String(opts.top ?? 10), $select: opts.withHeaders ? `${MSG_SELECT},${MSG_HEADERS_SELECT}` : MSG_SELECT, $orderby: "receivedDateTime desc" });
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
    const m = await this.request<RawMessage>("GET", `/me/messages/${encodeURIComponent(id)}?$select=${MSG_SELECT},body,replyTo,importance`);
    return this.mapMessage(m);
  }

  /**
   * Who the user wrote to lately (Sent Items: To and Cc, lower-case, newest first, no duplicates) — the "known contacts"
   * the phishing checks compare a sender with (lib/proactive/phishing.ts).
   */
  async sentRecipients(opts: { since?: Date; top?: number } = {}): Promise<{ name: string; address: string }[]> {
    const q = new URLSearchParams({ $top: String(opts.top ?? 50), $select: "toRecipients,ccRecipients,sentDateTime", $orderby: "sentDateTime desc" });
    if (opts.since) q.set("$filter", `sentDateTime ge ${opts.since.toISOString()}`);
    const r = await this.request<{ value?: { toRecipients?: RawAddress[]; ccRecipients?: RawAddress[] }[] }>("GET", `/me/mailFolders/sentitems/messages?${q}`);
    const seen = new Map<string, { name: string; address: string }>();
    for (const m of r?.value ?? []) {
      for (const a of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]) {
        const address = (a.emailAddress?.address ?? "").trim().toLowerCase();
        if (address && !seen.has(address)) seen.set(address, { name: a.emailAddress?.name ?? "", address });
      }
    }
    return [...seen.values()];
  }

  /**
   * Adds the category SUSPICIOUS_CATEGORY to a message (Mail.ReadWrite) — the user's "לסמן כחשוד" on a phishing warning.
   * Nothing else changes: the message stays where it is, unread or read, and the category can be removed in Outlook.
   */
  async markSuspicious(id: string): Promise<void> {
    const m = await this.request<{ categories?: string[] }>("GET", `/me/messages/${encodeURIComponent(id)}?$select=categories`);
    const categories = [...new Set([...(m?.categories ?? []), SUSPICIOUS_CATEGORY])];
    await this.request("PATCH", `/me/messages/${encodeURIComponent(id)}`, { categories });
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
      textJoinUrl: joinUrlInText(e.location?.displayName, e.bodyPreview),
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
   * answer without the list counts as none allowed. Null only when Graph may answer later (429, 5xx, 408, a network
   * error); anything else throws (an expired connection, 403 ErrorAccessDenied, 404 MailboxNotEnabledForRESTAPI), so
   * the caller reports it as it is and nobody is told to wait for a check that will never pass.
   */
  async onlineMeetingProviders(): Promise<string[] | null> {
    try {
      const c = await this.request<{ allowedOnlineMeetingProviders?: unknown }>("GET", "/me/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider");
      return Array.isArray(c?.allowedOnlineMeetingProviders) ? c.allowedOnlineMeetingProviders.filter((p): p is string => typeof p === "string") : [];
    } catch (e) {
      if (e instanceof GraphError ? e.retryable : isNetworkError(e)) return null;
      throw e;
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
    if (e.transactionId) body.transactionId = e.transactionId;
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

  /** An item of any drive the user can read (a SharePoint document library, a shared OneDrive) — Files.Read.All. */
  async getDriveItem(driveId: string, itemId: string): Promise<DriveItem> {
    return this.mapItem(await this.request<RawDriveItem>("GET", `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference`));
  }

  /** downloadItem for an item of another drive. */
  downloadDriveItem(driveId: string, itemId: string, format?: "pdf"): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    return this.requestBytes(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content${format ? `?format=${format}` : ""}`);
  }

  // ---------- Microsoft Search (OneDrive + SharePoint): POST /search/query ----------

  private async search<T>(entityType: "driveItem" | "site", query: string, size: number): Promise<T[]> {
    const r = await this.request<{ value?: { hitsContainers?: { hits?: { summary?: string; resource?: T }[] }[] }[] }>("POST", "/search/query", {
      requests: [{ entityTypes: [entityType], query: { queryString: query.slice(0, 200) }, from: 0, size: Math.min(Math.max(size, 1), 25) }],
    });
    return (r.value?.[0]?.hitsContainers?.[0]?.hits ?? []).filter((h) => h.resource).map((h) => ({ ...(h.resource as T), _summary: h.summary ?? "" }));
  }

  /** Documents across OneDrive and the SharePoint sites the user can read (Files.Read.All or Sites.Read.All). Folders are dropped. */
  async searchDriveItems(query: string, size = 10): Promise<SearchFileHit[]> {
    const hits = await this.search<RawDriveItem & { _summary: string }>("driveItem", query, size);
    return hits
      .filter((h) => !h.folder)
      .map((h) => ({ driveId: h.parentReference?.driveId ?? null, itemId: h.id, name: h.name ?? "", webUrl: h.webUrl ?? "", lastModifiedDateTime: h.lastModifiedDateTime ?? "", size: h.size ?? null, summary: stripHighlights(h._summary) }));
  }

  /** SharePoint sites the user can read (Sites.Read.All). */
  async searchSites(query: string, size = 10): Promise<SearchSiteHit[]> {
    const hits = await this.search<{ id: string; name?: string; displayName?: string; webUrl?: string; description?: string; _summary: string }>("site", query, size);
    return hits.map((h) => ({ id: h.id, name: h.displayName ?? h.name ?? "", webUrl: h.webUrl ?? "", description: h.description ?? stripHighlights(h._summary) }));
  }

  // ---------- Microsoft To Do (Tasks.ReadWrite) ----------

  async todoLists(): Promise<TodoList[]> {
    const r = await this.request<{ value: { id: string; displayName?: string; wellknownListName?: string }[] }>("GET", "/me/todo/lists?$top=20");
    return r.value.map((l) => ({ id: l.id, name: l.displayName ?? "", isDefault: l.wellknownListName === "defaultList" }));
  }

  /** Tasks of a list — open ones unless `includeCompleted`. */
  async todoTasks(listId: string, opts: { includeCompleted?: boolean; top?: number } = {}): Promise<TodoTask[]> {
    const q = new URLSearchParams({ $top: String(Math.min(Math.max(opts.top ?? 50, 1), 100)) });
    if (!opts.includeCompleted) q.set("$filter", "status ne 'completed'");
    const r = await this.request<{ value: RawTodoTask[] }>("GET", `/me/todo/lists/${encodeURIComponent(listId)}/tasks?${q}`);
    return r.value.map(mapTodoTask).filter((t) => opts.includeCompleted || t.status !== "completed");
  }

  /** Adds a task; `due` = YYYY-MM-DD, stored as that date (midnight UTC, a date-only due date as To Do shows it). */
  async createTodoTask(listId: string, input: { title: string; notes?: string; due?: string | null }): Promise<TodoTask> {
    const body: Record<string, unknown> = { title: input.title };
    if (input.notes) body.body = { content: input.notes, contentType: "text" };
    if (input.due) body.dueDateTime = { dateTime: `${input.due}T00:00:00`, timeZone: "UTC" };
    return mapTodoTask(await this.request<RawTodoTask>("POST", `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, body));
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

/** Microsoft Search snippets mark the matched words with <c0>…</c0> (and may carry <ddd/>): plain text only. */
function stripHighlights(summary: string): string {
  return summary.replace(/<\/?c\d+>|<ddd\/>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function mapTodoTask(t: RawTodoTask): TodoTask {
  return { id: t.id, title: t.title ?? "", status: t.status ?? "notStarted", due: t.dueDateTime?.dateTime ? t.dueDateTime.dateTime.slice(0, 10) : null, notes: t.body?.contentType === "html" ? htmlToText(t.body.content ?? "") : (t.body?.content ?? ""), importance: t.importance ?? "normal" };
}

/** fetch failed before Graph answered (connection reset, DNS, a timeout): Graph may answer the same request later */
function isNetworkError(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return e instanceof TypeError || name === "AbortError" || name === "TimeoutError";
}

// ---- raw Graph shapes (subset) ----
interface RawTodoTask {
  id: string;
  title?: string;
  status?: string;
  importance?: string;
  dueDateTime?: { dateTime?: string; timeZone?: string };
  body?: { content?: string; contentType?: string };
}
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
  replyTo?: RawAddress[];
  importance?: string;
  internetMessageHeaders?: { name?: string; value?: string }[];
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
  parentReference?: { path?: string; driveId?: string; siteId?: string };
}
interface RawSubscription {
  id: string;
  resource: string;
  expirationDateTime: string;
  clientState?: string;
}
