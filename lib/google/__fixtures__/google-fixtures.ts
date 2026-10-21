import { TINY_PDF_BASE64 } from "@/lib/ms/__fixtures__/graph-fixtures";

/**
 * Recorded-shape Google responses served by a fake `fetch` — used by tests and by DATA_MODE=memory.
 * Shapes follow the docs (OAuth token/revoke, OIDC userinfo, Calendar v3 events, Drive v3 files, Gmail v1
 * messages.send) as of 2026-10. All data is fictional.
 */
export const FIXTURE_GOOGLE_ACCOUNT = { sub: "109876543210", email: "dana.levi@gmail.com", name: "דנה לוי" };

export const FIXTURE_GOOGLE_SCOPE = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send";

export function fixtureIdToken(claims: Record<string, unknown> = {}): string {
  const payload = { iss: "https://accounts.google.com", aud: "fixture-client", sub: FIXTURE_GOOGLE_ACCOUNT.sub, email: FIXTURE_GOOGLE_ACCOUNT.email, email_verified: true, name: FIXTURE_GOOGLE_ACCOUNT.name, ...claims };
  return `${Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

export interface RawFixtureEvent {
  kind: "calendar#event";
  id: string;
  status: string;
  htmlLink: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: string;
  organizer: { email: string; displayName?: string; self?: boolean };
  attendees?: { email: string; displayName?: string; responseStatus: string; self?: boolean; organizer?: boolean }[];
}

export const FIXTURE_GOOGLE_EVENTS: RawFixtureEvent[] = [
  {
    kind: "calendar#event",
    id: "gev1",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=Z2V2MQ",
    summary: "פגישת צוות שבועית",
    start: { dateTime: "2026-10-21T09:00:00+03:00", timeZone: "Asia/Jerusalem" },
    end: { dateTime: "2026-10-21T10:00:00+03:00", timeZone: "Asia/Jerusalem" },
    organizer: { email: "dana.levi@gmail.com", self: true },
  },
  {
    kind: "calendar#event",
    id: "gev2",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=Z2V2Mg",
    summary: "שיחה עם משפחת אברהם",
    location: "Google Meet",
    start: { dateTime: "2026-10-21T13:00:00+03:00", timeZone: "Asia/Jerusalem" },
    end: { dateTime: "2026-10-21T13:30:00+03:00", timeZone: "Asia/Jerusalem" },
    organizer: { email: "dana.levi@gmail.com", self: true },
    attendees: [
      { email: "dana.levi@gmail.com", responseStatus: "accepted", self: true, organizer: true },
      { email: "avraham@example.co.il", displayName: "יוסי אברהם", responseStatus: "accepted" },
    ],
  },
  {
    kind: "calendar#event",
    id: "gev3",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=Z2V2Mw",
    summary: "יום הולדת לנועה",
    start: { date: "2026-10-21" },
    end: { date: "2026-10-22" },
    transparency: "transparent",
    organizer: { email: "dana.levi@gmail.com", self: true },
  },
];

export interface FixtureFile {
  kind: "drive#file";
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink: string;
  trashed?: boolean;
  content: Uint8Array;
}

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function fixtureFiles(): FixtureFile[] {
  return [
    { kind: "drive#file", id: "gdoc1", name: "סיכום פגישה — כהן", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-18T09:00:00.000Z", webViewLink: "https://docs.google.com/document/d/gdoc1/edit", content: utf8("סיכום: הוסכם על תשלום בשלוש פעימות.") },
    { kind: "drive#file", id: "gpdf1", name: "הצעת מחיר לוי.pdf", mimeType: "application/pdf", modifiedTime: "2026-10-16T08:00:00.000Z", size: "1200", webViewLink: "https://drive.google.com/file/d/gpdf1/view", content: new Uint8Array(Buffer.from(TINY_PDF_BASE64, "base64")) },
    // Real .docx bytes are a zip; the fixture's "conversion" just carries the text through.
    { kind: "drive#file", id: "gdocx1", name: "הסכם שכירות.docx", mimeType: DOCX, modifiedTime: "2026-10-14T08:00:00.000Z", size: "48120", webViewLink: "https://drive.google.com/file/d/gdocx1/view", content: utf8("הסכם שכירות בין הצדדים לתקופה של 24 חודשים.") },
    { kind: "drive#file", id: "gsheet1", name: "תקציב 2026", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-10-10T08:00:00.000Z", webViewLink: "https://docs.google.com/spreadsheets/d/gsheet1/edit", content: utf8("חודש,סכום\nינואר,4200") },
    { kind: "drive#file", id: "gimg1", name: "לוגו.png", mimeType: "image/png", modifiedTime: "2026-10-01T08:00:00.000Z", size: "5000", webViewLink: "https://drive.google.com/file/d/gimg1/view", content: new Uint8Array([137, 80, 78, 71]) },
  ];
}

export interface GoogleFixtureState {
  calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[];
  events: RawFixtureEvent[];
  deletedEvents: Set<string>;
  files: FixtureFile[];
  /** decoded RFC 2822 messages handed to Gmail */
  sent: { mime: string; threadId?: string; via: "json" | "upload" }[];
  revoked: string[];
  /** token endpoint behaviour */
  tokenMode: "ok" | "invalid_grant";
  /** scope string the token endpoint returns */
  grantedScope: string;
  /** simulate an expired access token once */
  unauthorizedOnce: boolean;
  /** API families that answer 403 insufficientPermissions (granular consent unticked) */
  denied: Set<"calendar" | "drive" | "gmail">;
}

const headerRecord = (h: HeadersInit | undefined): Record<string, string> => {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...(h as Record<string, string>) };
};

const bodyBuffer = (b: BodyInit | null | undefined): Buffer | null => {
  if (b === undefined || b === null) return null;
  if (typeof b === "string") return Buffer.from(b, "utf8");
  if (b instanceof Uint8Array) return Buffer.from(b);
  if (b instanceof ArrayBuffer) return Buffer.from(new Uint8Array(b));
  if (b instanceof URLSearchParams) return Buffer.from(b.toString(), "utf8");
  throw new Error("fixture: unsupported body type");
};

/** Parses a Drive multipart/related upload: [metadata JSON, media bytes]. */
function parseMultipart(body: Buffer, contentType: string): { metadata: Record<string, unknown>; mediaType: string; media: Uint8Array } {
  const boundary = contentType.match(/boundary=("?)([^";]+)\1/)?.[2];
  if (!boundary) throw new Error("fixture: no boundary");
  const text = body.toString("latin1");
  const parts = text.split(`--${boundary}`).slice(1, -1);
  const parse = (p: string) => {
    const idx = p.indexOf("\r\n\r\n");
    const head = p.slice(0, idx);
    const content = p.slice(idx + 4).replace(/\r\n$/, "");
    return { type: head.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] ?? "", content: Buffer.from(content, "latin1") };
  };
  const meta = parse(parts[0]!);
  const media = parse(parts[1]!);
  return { metadata: JSON.parse(meta.content.toString("utf8")) as Record<string, unknown>, mediaType: media.type, media: new Uint8Array(media.content) };
}

const fileMeta = (f: FixtureFile) => {
  const { content: _content, trashed: _trashed, ...meta } = f;
  void _content;
  void _trashed;
  return meta;
};

export function createGoogleFixture(): { fetchImpl: typeof fetch; state: GoogleFixtureState } {
  const state: GoogleFixtureState = {
    calls: [],
    events: FIXTURE_GOOGLE_EVENTS.map((e) => structuredClone(e)),
    deletedEvents: new Set(),
    files: fixtureFiles(),
    sent: [],
    revoked: [],
    tokenMode: "ok",
    grantedScope: FIXTURE_GOOGLE_SCOPE,
    unauthorizedOnce: false,
    denied: new Set(),
  };
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8" } });
  const apiError = (status: number, reason: string, message: string, extra: Record<string, unknown> = {}) => json({ error: { code: status, message, errors: [{ domain: "global", reason, message }], status: extra.status ?? "FAILED_PRECONDITION", ...(extra.details ? { details: extra.details } : {}) } }, status);
  const scopeDenied = () =>
    apiError(403, "insufficientPermissions", "Request had insufficient authentication scopes.", { status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT", domain: "googleapis.com" }] });
  const withOffset = (t: { dateTime?: string; date?: string; timeZone?: string }) => (t.dateTime && !/[zZ]|[+-]\d\d:\d\d$/.test(t.dateTime) ? { ...t, dateTime: `${t.dateTime}+03:00` } : t);

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = headerRecord(init?.headers);
    const raw = bodyBuffer(init?.body);
    const ct = headers["Content-Type"] ?? headers["content-type"] ?? "";
    let body: unknown = raw;
    if (raw && ct.startsWith("application/json")) body = JSON.parse(raw.toString("utf8"));
    else if (raw && ct.startsWith("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
    state.calls.push({ method, url: url.toString(), headers, body });

    // ---- OAuth ----
    if (url.origin === "https://oauth2.googleapis.com") {
      const form = body as Record<string, string>;
      if (url.pathname === "/token") {
        if (state.tokenMode === "invalid_grant" || form.code === "bad-code") return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
        const fresh = { access_token: `ya29.fixture-${++n}`, expires_in: 3599, scope: state.grantedScope, token_type: "Bearer" };
        if (form.grant_type === "authorization_code") return json({ ...fresh, refresh_token: `1//fixture-refresh-${n}`, id_token: fixtureIdToken() });
        return json(fresh);
      }
      if (url.pathname === "/revoke") {
        if (form.token === "unknown") return json({ error: "invalid_token", error_description: "Token expired or revoked" }, 400);
        state.revoked.push(form.token!);
        return json({});
      }
    }

    // ---- APIs: auth ----
    const auth = headers.Authorization ?? "";
    if (state.unauthorizedOnce || auth === "Bearer expired") {
      state.unauthorizedOnce = false;
      return json({ error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED", errors: [{ reason: "authError", domain: "global", message: "Invalid Credentials" }] } }, 401);
    }

    if (url.href === "https://openidconnect.googleapis.com/v1/userinfo") return json({ ...FIXTURE_GOOGLE_ACCOUNT, email_verified: true });

    // ---- Calendar v3 ----
    const cal = url.pathname.match(/^\/calendar\/v3\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if (url.hostname === "www.googleapis.com" && cal) {
      if (state.denied.has("calendar")) return scopeDenied();
      const id = cal[1] ? decodeURIComponent(cal[1]) : null;
      if (!id && method === "GET") {
        const min = Date.parse(url.searchParams.get("timeMin") ?? "1970-01-01T00:00:00Z");
        const max = Date.parse(url.searchParams.get("timeMax") ?? "2100-01-01T00:00:00Z");
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const at = (t: { dateTime?: string; date?: string }) => Date.parse(t.dateTime ?? `${t.date}T00:00:00+03:00`);
        const items = state.events.filter((e) => at(e.end) > min && at(e.start) < max && (!q || JSON.stringify(e).toLowerCase().includes(q))).sort((a, b) => at(a.start) - at(b.start));
        return json({ kind: "calendar#events", summary: FIXTURE_GOOGLE_ACCOUNT.email, timeZone: "Asia/Jerusalem", items });
      }
      if (!id && method === "POST") {
        const b = body as Record<string, unknown> & { start: RawFixtureEvent["start"]; end: RawFixtureEvent["end"]; attendees?: { email: string }[] };
        const e: RawFixtureEvent = {
          kind: "calendar#event",
          id: `gevnew${++n}`,
          status: "confirmed",
          htmlLink: `https://www.google.com/calendar/event?eid=new${n}`,
          summary: String(b.summary ?? ""),
          ...(b.location ? { location: String(b.location) } : {}),
          ...(b.description ? { description: String(b.description) } : {}),
          start: withOffset(b.start),
          end: withOffset(b.end),
          organizer: { email: FIXTURE_GOOGLE_ACCOUNT.email, self: true },
          ...(b.attendees ? { attendees: b.attendees.map((a) => ({ email: a.email, responseStatus: "needsAction" })) } : {}),
        };
        state.events.push(e);
        return json(e);
      }
      if (id) {
        if (state.deletedEvents.has(id)) return apiError(410, "deleted", "Resource has been deleted");
        const e = state.events.find((x) => x.id === id);
        if (!e) return apiError(404, "notFound", "Not Found");
        if (method === "GET") return json(e);
        if (method === "PATCH") {
          const b = body as Partial<RawFixtureEvent> & { attendees?: { email: string }[] };
          if (b.summary !== undefined) e.summary = b.summary;
          if (b.location !== undefined) e.location = b.location;
          if (b.description !== undefined) e.description = b.description;
          if (b.start) e.start = withOffset(b.start);
          if (b.end) e.end = withOffset(b.end);
          if (b.attendees) e.attendees = b.attendees.map((a) => ({ email: a.email, responseStatus: "needsAction" }));
          return json(e);
        }
        if (method === "DELETE") {
          state.events = state.events.filter((x) => x.id !== id);
          state.deletedEvents.add(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    // ---- Drive v3 ----
    if (url.hostname === "www.googleapis.com" && (url.pathname.startsWith("/drive/v3/") || url.pathname.startsWith("/upload/drive/v3/"))) {
      if (state.denied.has("drive")) return scopeDenied();
      if (url.pathname === "/drive/v3/files" && method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const name = q.match(/name contains '((?:[^'\\]|\\.)*)'/)?.[1]?.replace(/\\(.)/g, "$1").toLowerCase();
        const files = state.files.filter((f) => !f.trashed && f.mimeType !== "application/vnd.google-apps.folder" && (!name || f.name.toLowerCase().includes(name))).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
        return json({ kind: "drive#fileList", incompleteSearch: false, files: files.slice(0, Number(url.searchParams.get("pageSize") ?? 100)).map(fileMeta) });
      }
      if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
        const { metadata, mediaType, media } = parseMultipart(raw!, ct);
        const f: FixtureFile = { kind: "drive#file", id: `gnew${++n}`, name: String(metadata.name ?? "Untitled"), mimeType: String(metadata.mimeType ?? mediaType), modifiedTime: "2026-10-21T10:00:00.000Z", webViewLink: `https://drive.google.com/file/d/gnew${n}/view`, content: media, ...(metadata.mimeType ? {} : { size: String(media.byteLength) }) };
        state.files.push(f);
        return json(fileMeta(f));
      }
      const up = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
      if (up && method === "PATCH") {
        const f = state.files.find((x) => x.id === decodeURIComponent(up[1]!));
        if (!f) return apiError(404, "notFound", "File not found");
        f.content = new Uint8Array(raw ?? Buffer.alloc(0));
        f.modifiedTime = "2026-10-21T11:00:00.000Z";
        return json(fileMeta(f));
      }
      const fm = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/export)?$/);
      if (fm) {
        const f = state.files.find((x) => x.id === decodeURIComponent(fm[1]!));
        if (!f || f.trashed) return apiError(404, "notFound", `File not found: ${fm[1]}.`);
        if (fm[2]) {
          if (!f.mimeType.startsWith("application/vnd.google-apps.")) return apiError(403, "fileNotExportable", "Export only supports Docs Editors files.");
          return new Response(Buffer.from(f.content), { status: 200, headers: { "content-type": url.searchParams.get("mimeType") ?? "text/plain" } });
        }
        if (method === "DELETE") {
          state.files = state.files.filter((x) => x.id !== f.id);
          return new Response(null, { status: 204 });
        }
        if (url.searchParams.get("alt") === "media") {
          if (f.mimeType.startsWith("application/vnd.google-apps.")) return apiError(403, "fileNotDownloadable", "Only files with binary content can be downloaded. Use Export with Docs Editors files.");
          return new Response(Buffer.from(f.content), { status: 200, headers: { "content-type": f.mimeType } });
        }
        return json(fileMeta(f));
      }
    }

    // ---- Gmail v1 ----
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/users/me/messages/send") && method === "POST") {
      if (state.denied.has("gmail")) return scopeDenied();
      const id = `18f${(++n).toString(16).padStart(13, "0")}`;
      if (url.pathname.startsWith("/upload/")) {
        state.sent.push({ mime: raw!.toString("utf8"), via: "upload" });
      } else {
        const b = body as { raw?: string; threadId?: string };
        if (!b.raw || /[+/=]/.test(b.raw)) return apiError(400, "invalidArgument", "Invalid value for ByteString");
        state.sent.push({ mime: Buffer.from(b.raw, "base64url").toString("utf8"), ...(b.threadId ? { threadId: b.threadId } : {}), via: "json" });
      }
      return json({ id, threadId: (body as { threadId?: string } | null)?.threadId ?? id, labelIds: ["SENT"] });
    }

    return json({ error: { code: 400, message: `fixture: unhandled ${method} ${url.href}`, status: "INVALID_ARGUMENT" } }, 400);
  }) as typeof fetch;

  return { fetchImpl, state };
}
