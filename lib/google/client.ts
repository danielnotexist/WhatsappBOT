import { randomBytes, randomUUID } from "node:crypto";
import { joinUrlInText, safeJoinUrl } from "@/lib/online-meeting";
import { buildMimeMessage, toGmailRaw, type MimeMessageInput } from "./mime";

/**
 * Minimal fetch-based Google client (no googleapis SDK) for Calendar v3, Drive v3 (drive.file, and every file with
 * drive.readonly), Tasks v1 and Gmail send.
 * Endpoints verified on developers.google.com (2026-10). Takes an access-token provider so the token store
 * refreshes transparently; retries once after a 401 through `onUnauthorized`.
 */
export const GOOGLE_API = {
  calendar: "https://www.googleapis.com/calendar/v3",
  drive: "https://www.googleapis.com/drive/v3",
  driveUpload: "https://www.googleapis.com/upload/drive/v3",
  gmail: "https://gmail.googleapis.com/gmail/v1",
  gmailUpload: "https://gmail.googleapis.com/upload/gmail/v1",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  tasks: "https://tasks.googleapis.com/tasks/v1",
} as const;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** errors[0].reason (e.g. insufficientPermissions, rateLimitExceeded, notFound) or ErrorInfo.reason */
    readonly reason: string | null,
    readonly retryAfterMs: number | null = null,
    /** error.message from the API body alone (`message` also carries the status and the request path) */
    readonly apiMessage: string = "",
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
  get unauthorized(): boolean {
    return this.status === 401;
  }
  /** the token lacks the scope (user unticked it in granular consent) */
  get insufficientScope(): boolean {
    return this.status === 403 && (this.reason === "insufficientPermissions" || this.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT");
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 408 || (this.status === 403 && (this.reason === "rateLimitExceeded" || this.reason === "userRateLimitExceeded"));
  }
  get notFound(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

// ---------- public shapes ----------

export interface GoogleEvent {
  id: string;
  summary: string;
  /** RFC 3339 date-time as returned (offset included), or YYYY-MM-DD for all-day events */
  start: string;
  end: string;
  timeZone: string | null;
  isAllDay: boolean;
  location: string;
  description: string;
  attendees: { email: string; name: string; response: string; self: boolean }[];
  organizer: { email: string; name: string; self: boolean } | null;
  htmlLink: string | null;
  status: string;
  /** "transparent" = shows as free */
  transparency: "opaque" | "transparent";
  /** Meet (`hangoutLink`) or the conference's video entry point, when it is a safe meeting link (lib/online-meeting.ts) */
  joinUrl: string | null;
  /**
   * The event has a conference of any kind (Meet, an add-on such as GoTo or Jitsi, a link off the safe list) or a
   * create request still in progress, read from the raw event, not from `joinUrl`. A new create request on such an
   * event would replace the conference the attendees already have.
   */
  hasConference: boolean;
  /** status of a conference create request: "pending" right after the request, then "success" or "failure" */
  conferenceStatus: "pending" | "success" | "failure" | null;
  /** a meeting link written only in the location or the description (Zoom, Teams), when safe; else null */
  textJoinUrl: string | null;
  /** the Meet code ("abc-defg-hij") of the event's conference, when it has one */
  conferenceId?: string | null;
  /**
   * Drive files attached to the event — Meet attaches the recording, the transcript and Gemini's notes to the
   * organiser's event when they are ready (lib/meetings/meet.ts). Reading one needs drive.readonly.
   */
  attachments?: { fileId: string; title: string; mimeType: string; fileUrl: string }[];
}

export interface NewGoogleEvent {
  summary: string;
  /** local date-time "YYYY-MM-DDTHH:MM:SS" interpreted in `timeZone`, or "YYYY-MM-DD" when isAllDay */
  start: string;
  end: string;
  timeZone: string;
  location?: string;
  description?: string;
  attendees?: string[];
  isAllDay?: boolean;
  /** true → a Google Meet (conferenceData.createRequest, sent with conferenceDataVersion=1) */
  onlineMeeting?: boolean;
  /**
   * Client-chosen event id (base32hex: a-v and 0-9, 5-1024 characters; hex fits). Lets the caller check whether an
   * insert that answered with an error created the event anyway; a second insert with the same id answers 409.
   */
  id?: string;
}

export type SendUpdates = "all" | "externalOnly" | "none";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number | null;
  webViewLink: string | null;
  isFolder: boolean;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes: string;
  status: "needsAction" | "completed";
  /** YYYY-MM-DD (Google keeps only the date of a task's due time) or null */
  due: string | null;
  webViewLink: string | null;
}

export interface GmailSent {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface GoogleClientOptions {
  getAccessToken: () => Promise<string>;
  /** called after a 401 so the store can force a refresh; return the new token or null to give up */
  onUnauthorized?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const DRIVE_FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
export const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
/** Gmail's JSON endpoint is meant for small messages; above this the raw message goes to the upload endpoint. */
export const GMAIL_JSON_LIMIT_BYTES = 4 * 1024 * 1024;
/** Gmail rejects messages over 25 MB of attachments; keep a margin for base64 growth. */
export const GMAIL_MAX_ATTACHMENTS_BYTES = 18 * 1024 * 1024;

/** Drive's q-string literal: escape backslashes and single quotes. */
export const driveQueryLiteral = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class GoogleClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GoogleClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ---------- transport ----------

  private async send(url: string, init: { method: string; headers?: Record<string, string>; body?: BodyInit }, retried = false): Promise<Response> {
    const token = await this.opts.getAccessToken();
    const res = await this.fetchImpl(url, { method: init.method, headers: { Authorization: `Bearer ${token}`, ...init.headers }, body: init.body });
    if (res.status === 401 && !retried && this.opts.onUnauthorized) {
      const fresh = await this.opts.onUnauthorized();
      if (fresh) return this.send(url, init, true);
    }
    if (!res.ok) throw await toError(res, url);
    return res;
  }

  async json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.send(url, { method, headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async bytes(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    const res = await this.send(url, { method: "GET" });
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
  }

  // ---------- identity ----------

  async userInfo(): Promise<{ sub: string; email: string | null; name: string | null }> {
    const u = await this.json<{ sub: string; email?: string; name?: string }>("GET", GOOGLE_API.userinfo);
    return { sub: u.sub, email: u.email?.toLowerCase() ?? null, name: u.name ?? null };
  }

  // ---------- calendar ----------

  private eventsUrl(path = "", params?: Record<string, string | undefined>): string {
    const u = new URL(`${GOOGLE_API.calendar}/calendars/primary/events${path}`);
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) u.searchParams.set(k, v);
    return u.toString();
  }

  /** Expanded single events (recurring → instances) between two instants, date-times returned in `timeZone`. */
  async listEvents(opts: { timeMin: Date; timeMax: Date; timeZone?: string; maxResults?: number; q?: string }): Promise<GoogleEvent[]> {
    const r = await this.json<{ items?: RawEvent[]; timeZone?: string }>(
      "GET",
      this.eventsUrl("", { timeMin: opts.timeMin.toISOString(), timeMax: opts.timeMax.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(opts.maxResults ?? 50), timeZone: opts.timeZone, q: opts.q || undefined }),
    );
    return (r.items ?? []).filter((e) => e.status !== "cancelled").map((e) => mapEvent(e, r.timeZone ?? null));
  }

  async getEvent(id: string, timeZone?: string): Promise<GoogleEvent> {
    return mapEvent(await this.json<RawEvent>("GET", this.eventsUrl(`/${encodeURIComponent(id)}`, { timeZone })), null);
  }

  /**
   * Invitations go out to attendees (`sendUpdates=all`) — the user already approved this exact event. A Meet is
   * created asynchronously: the response may carry `conferenceStatus: "pending"` and no link yet (read it again).
   */
  async createEvent(input: NewGoogleEvent, sendUpdates: SendUpdates = input.attendees?.length ? "all" : "none"): Promise<GoogleEvent> {
    return mapEvent(await this.json<RawEvent>("POST", this.eventsUrl("", { sendUpdates, ...conferenceParam(input) }), eventBody(input)), null);
  }

  /** PATCH semantics: only given fields change (an `attendees` array replaces the whole list). */
  async patchEvent(id: string, patch: Partial<NewGoogleEvent> & { timeZone: string }, sendUpdates: SendUpdates = "all"): Promise<GoogleEvent> {
    return mapEvent(await this.json<RawEvent>("PATCH", this.eventsUrl(`/${encodeURIComponent(id)}`, { sendUpdates, ...conferenceParam(patch) }), eventBody(patch)), null);
  }

  /** Deletes (organizer: guests get a cancellation). Already deleted (410 Gone) counts as done. */
  async deleteEvent(id: string, sendUpdates: SendUpdates = "all"): Promise<void> {
    try {
      await this.json("DELETE", this.eventsUrl(`/${encodeURIComponent(id)}`, { sendUpdates }));
    } catch (e) {
      if (!(e instanceof GoogleApiError && e.status === 410)) throw e;
    }
  }

  // ---------- drive (drive.file: only files the app created or the user opened with it) ----------
  //
  // TODO(M6 phase 2 — Google Picker): drive.file sees nothing the user did not open/share with the app, so
  // existing Drive files need the Picker, which is client-side JS (apis.google.com/js/api.js → google.picker).
  // Plan: a page /drive/pick (signed-in or ?t= chat token) that gets a short-lived access token from a server
  // action (never the refresh token), builds `new google.picker.PickerBuilder().setOAuthToken(token)
  // .setDeveloperKey(GOOGLE_PICKER_API_KEY).setAppId(<GCP project number>).addView(DocsView)` and posts the
  // picked file ids back; from then on those ids work with the methods below. Needs: an API key restricted to
  // the Picker API + HTTP referrer, the project number, and CSP script-src/frame-src for apis.google.com and
  // docs.google.com (proxy.ts). See docs/google-setup.md §7.

  /**
   * Files this app can see (drive.file: what it created or the user opened with it; drive.readonly: every file), newest
   * first; `query` matches the name, or with `fullText` the name or the content. Folders and trashed files are excluded.
   */
  async listFiles(opts: { query?: string; pageSize?: number; fullText?: boolean } = {}): Promise<DriveFile[]> {
    const q = ["trashed = false", `mimeType != ${driveQueryLiteral(GOOGLE_FOLDER_MIME)}`];
    const term = opts.query?.trim();
    if (term) q.push(opts.fullText ? `(name contains ${driveQueryLiteral(term)} or fullText contains ${driveQueryLiteral(term)})` : `name contains ${driveQueryLiteral(term)}`);
    const u = new URL(`${GOOGLE_API.drive}/files`);
    u.searchParams.set("q", q.join(" and "));
    u.searchParams.set("pageSize", String(Math.min(Math.max(opts.pageSize ?? 10, 1), 100)));
    u.searchParams.set("orderBy", "modifiedTime desc");
    u.searchParams.set("spaces", "drive");
    u.searchParams.set("fields", `files(${DRIVE_FIELDS}),nextPageToken`);
    const r = await this.json<{ files?: RawDriveFile[] }>("GET", u.toString());
    return (r.files ?? []).map(mapFile);
  }

  async getFile(id: string): Promise<DriveFile> {
    return mapFile(await this.json<RawDriveFile>("GET", `${GOOGLE_API.drive}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(DRIVE_FIELDS)}`));
  }

  /** Binary content of a regular (non-Google-Docs) file. */
  downloadFile(id: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    return this.bytes(`${GOOGLE_API.drive}/files/${encodeURIComponent(id)}?alt=media`);
  }

  /** Google Docs/Sheets/Slides → another format (text/plain, text/csv, application/pdf…). Max 10 MB. */
  exportFile(id: string, mimeType: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    return this.bytes(`${GOOGLE_API.drive}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`);
  }

  /**
   * Multipart upload (metadata + media, ≤5 MB). `convertTo` = a Google Workspace type to import as
   * (e.g. text/plain → Google Doc). The new file is owned by the user and accessible to us under drive.file.
   */
  async createFile(input: { name: string; mimeType: string; content: Uint8Array | string; convertTo?: string; parents?: string[]; boundary?: string }): Promise<DriveFile> {
    const boundary = input.boundary ?? `gdrive_${randomBytes(12).toString("hex")}`;
    const metadata = { name: input.name, ...(input.convertTo ? { mimeType: input.convertTo } : {}), ...(input.parents?.length ? { parents: input.parents } : {}) };
    const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`, "utf8"),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);
    const res = await this.send(`${GOOGLE_API.driveUpload}/files?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FIELDS)}`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}`, Accept: "application/json" }, body });
    return mapFile((await res.json()) as RawDriveFile);
  }

  /** Permanently deletes a file the app created (used for temporary conversions only — never on user files). */
  async deleteFile(id: string): Promise<void> {
    await this.json("DELETE", `${GOOGLE_API.drive}/files/${encodeURIComponent(id)}`);
  }

  /** Replaces the content of a file the app created (simple media upload). */
  async updateFileContent(id: string, content: Uint8Array | string, mimeType: string): Promise<DriveFile> {
    const res = await this.send(`${GOOGLE_API.driveUpload}/files/${encodeURIComponent(id)}?uploadType=media&fields=${encodeURIComponent(DRIVE_FIELDS)}`, {
      method: "PATCH",
      headers: { "Content-Type": mimeType, Accept: "application/json" },
      body: typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content),
    });
    return mapFile((await res.json()) as RawDriveFile);
  }

  // ---------- tasks (Google Tasks v1, scope `tasks`) ----------

  /** The user's task lists (the first is the default list, "My Tasks"). */
  async listTaskLists(maxResults = 20): Promise<GoogleTaskList[]> {
    const r = await this.json<{ items?: { id: string; title?: string }[] }>("GET", `${GOOGLE_API.tasks}/users/@me/lists?maxResults=${Math.min(Math.max(maxResults, 1), 100)}`);
    return (r.items ?? []).map((l) => ({ id: l.id, title: l.title ?? "" }));
  }

  /** Tasks of one list (`@default` = the default list); open ones only unless `showCompleted`. */
  async listTasks(listId: string, opts: { showCompleted?: boolean; maxResults?: number } = {}): Promise<GoogleTask[]> {
    const u = new URL(`${GOOGLE_API.tasks}/lists/${encodeURIComponent(listId)}/tasks`);
    u.searchParams.set("showCompleted", String(Boolean(opts.showCompleted)));
    u.searchParams.set("showHidden", String(Boolean(opts.showCompleted)));
    u.searchParams.set("maxResults", String(Math.min(Math.max(opts.maxResults ?? 50, 1), 100)));
    const r = await this.json<{ items?: RawTask[] }>("GET", u.toString());
    return (r.items ?? []).filter((t) => !t.deleted && (opts.showCompleted || t.status !== "completed")).map(mapTask);
  }

  /** Adds a task to a list (`@default` = the default list). `due` = YYYY-MM-DD (Google keeps the date only). */
  async createTask(listId: string, input: { title: string; notes?: string; due?: string | null }): Promise<GoogleTask> {
    const body: Record<string, unknown> = { title: input.title };
    if (input.notes) body.notes = input.notes;
    if (input.due) body.due = `${input.due}T00:00:00.000Z`;
    return mapTask(await this.json<RawTask>("POST", `${GOOGLE_API.tasks}/lists/${encodeURIComponent(listId)}/tasks`, body));
  }

  // ---------- gmail (gmail.send only — no read, no drafts) ----------

  /**
   * Sends an RFC 2822 message. Small messages go as JSON `{raw}` to users.messages.send; larger ones (attachments)
   * as `message/rfc822` to the media-upload URI of the same method.
   */
  async sendMail(input: MimeMessageInput & { threadId?: string | null }): Promise<GmailSent> {
    const total = (input.attachments ?? []).reduce((n, a) => n + a.bytes.byteLength, 0);
    if (total > GMAIL_MAX_ATTACHMENTS_BYTES) throw new GoogleApiError("attachments too large for Gmail", 413, "attachmentsTooLarge");
    const mime = buildMimeMessage(input);
    let r: RawGmailMessage;
    if (Buffer.byteLength(mime, "utf8") <= GMAIL_JSON_LIMIT_BYTES) {
      r = await this.json<RawGmailMessage>("POST", `${GOOGLE_API.gmail}/users/me/messages/send`, { raw: toGmailRaw(mime), ...(input.threadId ? { threadId: input.threadId } : {}) });
    } else {
      const res = await this.send(`${GOOGLE_API.gmailUpload}/users/me/messages/send?uploadType=media`, { method: "POST", headers: { "Content-Type": "message/rfc822", Accept: "application/json" }, body: Buffer.from(mime, "utf8") });
      r = (await res.json()) as RawGmailMessage;
    }
    return { id: r.id, threadId: r.threadId ?? r.id, labelIds: r.labelIds ?? [] };
  }
}

// ---------- mapping ----------

async function toError(res: Response, url: string): Promise<GoogleApiError> {
  const text = await res.text().catch(() => "");
  let err: RawError["error"] | undefined;
  try {
    err = (JSON.parse(text) as RawError).error;
  } catch {
    err = undefined;
  }
  const info = err?.details?.find((d) => d["@type"]?.endsWith("google.rpc.ErrorInfo"))?.reason;
  const reason = err?.errors?.[0]?.reason ?? info ?? err?.status ?? null;
  // ErrorInfo's ACCESS_TOKEN_SCOPE_INSUFFICIENT is more specific than errors[0]=insufficientPermissions — keep it when present
  const finalReason = info === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ? info : reason;
  const retryAfter = Number(res.headers.get("retry-after"));
  const path = new URL(url).pathname;
  return new GoogleApiError(`Google ${res.status}${finalReason ? ` ${finalReason}` : ""} (${path}): ${err?.message ?? text.slice(0, 200)}`, res.status, finalReason, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null, err?.message ?? "");
}

function mapEvent(e: RawEvent, calendarTz: string | null): GoogleEvent {
  const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
  return {
    id: e.id,
    summary: e.summary ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    timeZone: e.start?.timeZone ?? calendarTz,
    isAllDay,
    location: e.location ?? "",
    description: e.description ?? "",
    attendees: (e.attendees ?? []).filter((a) => !a.resource).map((a) => ({ email: a.email ?? "", name: a.displayName ?? "", response: a.responseStatus ?? "needsAction", self: Boolean(a.self) })),
    organizer: e.organizer ? { email: e.organizer.email ?? "", name: e.organizer.displayName ?? "", self: Boolean(e.organizer.self) } : null,
    htmlLink: e.htmlLink ?? null,
    status: e.status ?? "confirmed",
    transparency: e.transparency === "transparent" ? "transparent" : "opaque",
    joinUrl: safeJoinUrl(e.hangoutLink) ?? safeJoinUrl(e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri),
    hasConference: hasConference(e),
    conferenceStatus: conferenceStatusOf(e.conferenceData?.createRequest?.status?.statusCode),
    textJoinUrl: joinUrlInText(e.location, e.description),
    conferenceId: typeof e.conferenceData?.conferenceId === "string" ? e.conferenceData.conferenceId : null,
    attachments: (e.attachments ?? []).filter((a) => typeof a.fileId === "string" && a.fileId).map((a) => ({ fileId: a.fileId!, title: a.title ?? "", mimeType: a.mimeType ?? "", fileUrl: a.fileUrl ?? "" })),
  };
}

/** Any conference, or a create request that has not failed (a failed one left nothing to replace). */
function hasConference(e: RawEvent): boolean {
  const c = e.conferenceData;
  return Boolean(e.hangoutLink || c?.conferenceId || c?.entryPoints?.length || (c?.createRequest && c.createRequest.status?.statusCode !== "failure"));
}

const conferenceStatusOf = (code: unknown): GoogleEvent["conferenceStatus"] => (code === "pending" || code === "success" || code === "failure" ? code : null);

/** Without conferenceDataVersion=1 Google ignores conferenceData in the body, so it goes with every Meet request. */
const conferenceParam = (e: Partial<NewGoogleEvent>): Record<string, string> => (e.onlineMeeting ? { conferenceDataVersion: "1" } : {});

function eventBody(e: Partial<NewGoogleEvent> & { timeZone: string }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const when = (v: string) => (e.isAllDay ? { date: v.slice(0, 10) } : { dateTime: v, timeZone: e.timeZone });
  if (e.id !== undefined) body.id = e.id;
  if (e.summary !== undefined) body.summary = e.summary;
  if (e.start !== undefined) body.start = when(e.start);
  if (e.end !== undefined) body.end = when(e.end);
  if (e.location !== undefined) body.location = e.location;
  if (e.description !== undefined) body.description = e.description;
  if (e.attendees !== undefined) body.attendees = e.attendees.map((email) => ({ email }));
  // a fresh requestId per request: Google deduplicates create requests by it
  if (e.onlineMeeting) body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return body;
}

function mapTask(t: RawTask): GoogleTask {
  return { id: t.id, title: t.title ?? "", notes: t.notes ?? "", status: t.status === "completed" ? "completed" : "needsAction", due: t.due ? t.due.slice(0, 10) : null, webViewLink: t.webViewLink ?? null };
}

function mapFile(f: RawDriveFile): DriveFile {
  return { id: f.id, name: f.name ?? "", mimeType: f.mimeType ?? "application/octet-stream", modifiedTime: f.modifiedTime ?? "", size: f.size !== undefined ? Number(f.size) : null, webViewLink: f.webViewLink ?? null, isFolder: f.mimeType === GOOGLE_FOLDER_MIME };
}

// ---- raw Google shapes (subset) ----
interface RawError {
  error?: { code?: number; message?: string; status?: string; errors?: { reason?: string; message?: string; domain?: string }[]; details?: { "@type"?: string; reason?: string }[] };
}
interface RawEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: RawEventTime;
  end?: RawEventTime;
  transparency?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string; self?: boolean; resource?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  hangoutLink?: string;
  conferenceData?: { conferenceId?: string; createRequest?: { status?: { statusCode?: string } }; entryPoints?: { entryPointType?: string; uri?: string }[] };
  attachments?: { fileId?: string; title?: string; mimeType?: string; fileUrl?: string }[];
}
interface RawDriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  /** int64 as a string */
  size?: string;
  webViewLink?: string;
}
interface RawTask {
  id: string;
  title?: string;
  notes?: string;
  status?: string;
  /** RFC 3339; only the date part is meaningful */
  due?: string;
  deleted?: boolean;
  webViewLink?: string;
}
interface RawGmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
}
