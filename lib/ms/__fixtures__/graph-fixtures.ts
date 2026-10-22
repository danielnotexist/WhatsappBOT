/**
 * Recorded-shape Microsoft Graph responses served by a fake `fetch` — used by tests and by DATA_MODE=memory.
 * Shapes follow the v1.0 docs (message, event, driveItem, subscription). All data is fictional.
 */
export const FIXTURE_MESSAGES = [
  {
    id: "AAMkAGm1",
    subject: "הצעת פשרה, תיק 4471",
    from: { emailAddress: { name: "עו״ד שפירא", address: "office@shapira-law.co.il" } },
    toRecipients: [{ emailAddress: { name: "דנה לוי", address: "dana@levi-law.co.il" } }],
    receivedDateTime: "2026-10-20T06:12:00Z",
    isRead: false,
    hasAttachments: true,
    bodyPreview: "שלום דנה, בהמשך לשיחתנו מצורפת הצעת פשרה...",
    body: { contentType: "html", content: "<html><body><p>שלום דנה,</p><p>בהמשך לשיחתנו מצורפת הצעת פשרה. נשמח לתשובה עד יום חמישי.</p><p>בברכה,<br>שפירא</p></body></html>" },
    webLink: "https://outlook.office365.com/owa/?ItemID=AAMkAGm1",
    conversationId: "AAQkAGc1",
  },
  {
    id: "AAMkAGm2",
    subject: "אישור חשבונית 1023",
    from: { emailAddress: { name: "מאי כהן", address: "mai@client.co.il" } },
    toRecipients: [{ emailAddress: { name: "דנה לוי", address: "dana@levi-law.co.il" } }],
    receivedDateTime: "2026-10-19T14:30:00Z",
    isRead: true,
    hasAttachments: false,
    bodyPreview: "היי דנה, מאשרת את החשבונית. מתי נוח לדבר?",
    body: { contentType: "text", content: "היי דנה, מאשרת את החשבונית. מתי נוח לדבר?" },
    webLink: null,
    conversationId: "AAQkAGc2",
  },
];

/** GET /me/messages/{id}/attachments?$select=name,size,contentType (metadata only) */
export const FIXTURE_ATTACHMENTS: Record<string, { name: string; size: number; contentType: string }[]> = {
  AAMkAGm1: [{ name: "הצעת פשרה 4471.pdf", size: 120_000, contentType: "application/pdf" }],
};

export const FIXTURE_EVENTS = [
  {
    id: "AAMkAGe1",
    subject: "דיון בבית משפט השלום ת״א",
    start: { dateTime: "2026-10-21T09:00:00.0000000", timeZone: "Asia/Jerusalem" },
    end: { dateTime: "2026-10-21T10:30:00.0000000", timeZone: "Asia/Jerusalem" },
    isAllDay: false,
    location: { displayName: "בית משפט השלום, ויצמן 1" },
    attendees: [],
    organizer: { emailAddress: { name: "דנה לוי", address: "dana@levi-law.co.il" } },
    webLink: null,
    bodyPreview: "",
  },
  {
    id: "AAMkAGe2",
    subject: "פגישה עם רו״ח ברק",
    start: { dateTime: "2026-10-21T12:00:00.0000000", timeZone: "Asia/Jerusalem" },
    end: { dateTime: "2026-10-21T13:00:00.0000000", timeZone: "Asia/Jerusalem" },
    isAllDay: false,
    location: { displayName: "" },
    attendees: [{ emailAddress: { name: "ברק", address: "barak@cpa-barak.co.il" }, status: { response: "accepted" } }],
    organizer: { emailAddress: { name: "דנה לוי", address: "dana@levi-law.co.il" } },
    webLink: null,
    bodyPreview: "תיק המע״מ",
  },
];

export const FIXTURE_ITEMS = [
  { id: "01ITEM1", name: "הסכם כהן.docx", size: 48_120, lastModifiedDateTime: "2026-10-14T08:00:00Z", webUrl: "https://onedrive/1", file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, parentReference: { path: "/drive/root:/לקוחות/כהן" } },
  { id: "01ITEM2", name: "הצעת מחיר לוי.pdf", size: 120_000, lastModifiedDateTime: "2026-10-16T08:00:00Z", webUrl: "https://onedrive/2", file: { mimeType: "application/pdf" }, parentReference: { path: "/drive/root:/לקוחות/לוי" } },
  { id: "01FOLDER", name: "לקוחות", size: 0, lastModifiedDateTime: "2026-10-16T08:00:00Z", webUrl: "https://onedrive/f", folder: { childCount: 2 }, parentReference: { path: "/drive/root:" } },
];

/** A one-page PDF saying "Hello PDF 42" — small enough to embed, real enough for unpdf. */
export const TINY_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDIwIDQwIFRkIChIZWxsbyBQREYgNDIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI2MCAwMDAwMCBuIAowMDAwMDAwMzUzIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDIwCiUlRU9GCg==";

export interface FixtureState {
  calls: { method: string; url: string; body: unknown }[];
  sent: unknown[];
  events: typeof FIXTURE_EVENTS;
  subscriptions: { id: string; resource: string; expirationDateTime: string; clientState?: string }[];
  /** simulate an expired access token once */
  unauthorizedOnce: boolean;
}

export function createGraphFixture(): { fetchImpl: typeof fetch; state: FixtureState } {
  const state: FixtureState = { calls: [], sent: [], events: FIXTURE_EVENTS.map((e) => ({ ...e })), subscriptions: [], unauthorizedOnce: false };
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const listShape = (m: (typeof FIXTURE_MESSAGES)[number]) => {
    const copy: Record<string, unknown> = { ...m };
    delete copy.body;
    return copy;
  };

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    state.calls.push({ method, url: url.toString(), body });
    const p = url.pathname.replace(/^\/v1\.0/, "");
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
    if (state.unauthorizedOnce || auth === "Bearer expired") {
      state.unauthorizedOnce = false;
      return json({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired." } }, 401);
    }

    if (p === "/me") return json({ id: "u1", displayName: "דנה לוי", mail: "dana@levi-law.co.il", userPrincipalName: "dana@levi-law.co.il" });
    if (p === "/me/mailboxSettings") return json({ timeZone: "Israel Standard Time" });
    if (p === "/me/mailFolders/inbox/messages") {
      const unread = url.searchParams.get("$filter")?.includes("isRead eq false");
      return json({ value: FIXTURE_MESSAGES.filter((m) => !unread || !m.isRead).map(listShape) });
    }
    if (p === "/me/messages") {
      const q = (url.searchParams.get("$search") ?? "").replace(/"/g, "").toLowerCase();
      return json({ value: FIXTURE_MESSAGES.filter((m) => JSON.stringify(m).toLowerCase().includes(q)).map(listShape) });
    }
    const msg = p.match(/^\/me\/messages\/([^/]+)(\/reply|\/forward|\/attachments)?$/);
    if (msg) {
      const m = FIXTURE_MESSAGES.find((x) => x.id === decodeURIComponent(msg[1]!));
      if (!m) return json({ error: { code: "ErrorItemNotFound", message: "not found" } }, 404);
      if (msg[2] === "/reply") {
        state.sent.push({ reply: m.id, ...body });
        return new Response(null, { status: 202 });
      }
      if (msg[2] === "/forward") {
        state.sent.push({ forward: m.id, ...body });
        return new Response(null, { status: 202 });
      }
      if (msg[2] === "/attachments") return json({ value: FIXTURE_ATTACHMENTS[m.id] ?? [] });
      return json(m);
    }
    if (p === "/me/sendMail") {
      state.sent.push(body);
      return new Response(null, { status: 202 });
    }
    if (p === "/me/calendarView") return json({ value: state.events });
    if (p === "/me/events" && method === "POST") {
      const e = { id: `AAMkNEW${++n}`, subject: body.subject, start: body.start, end: body.end, isAllDay: Boolean(body.isAllDay), location: body.location ?? { displayName: "" }, attendees: (body.attendees ?? []).map((a: { emailAddress: { address: string } }) => ({ emailAddress: a.emailAddress, status: { response: "none" } })), organizer: FIXTURE_EVENTS[0]!.organizer, webLink: null, bodyPreview: body.body?.content ?? "" };
      state.events.push(e);
      return json(e, 201);
    }
    const ev = p.match(/^\/me\/events\/([^/]+)(\/cancel)?$/);
    if (ev) {
      const id = decodeURIComponent(ev[1]!);
      const e = state.events.find((x) => x.id === id);
      if (!e) return json({ error: { code: "ErrorItemNotFound", message: "not found" } }, 404);
      if (ev[2]) {
        state.events = state.events.filter((x) => x.id !== id);
        return new Response(null, { status: 202 });
      }
      if (method === "GET") return json(e);
      if (method === "PATCH") {
        Object.assign(e, { ...(body.subject !== undefined ? { subject: body.subject } : {}), ...(body.start ? { start: body.start } : {}), ...(body.end ? { end: body.end } : {}), ...(body.location ? { location: body.location } : {}) });
        return json(e);
      }
      if (method === "DELETE") {
        state.events = state.events.filter((x) => x.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (p.startsWith("/me/drive/root/search(")) {
      const q = decodeURIComponent(p.match(/q='([^']*)'/)?.[1] ?? "").toLowerCase();
      return json({ value: FIXTURE_ITEMS.filter((i) => i.name.toLowerCase().includes(q) || (i.parentReference.path ?? "").toLowerCase().includes(q)) });
    }
    const item = p.match(/^\/me\/drive\/items\/([^/]+)(\/content)?$/);
    if (item) {
      const i = FIXTURE_ITEMS.find((x) => x.id === decodeURIComponent(item[1]!));
      if (!i) return json({ error: { code: "itemNotFound", message: "not found" } }, 404);
      if (item[2]) return new Response(Buffer.from(TINY_PDF_BASE64, "base64"), { status: 200, headers: { "content-type": "application/pdf" } });
      return json(i);
    }
    if (p === "/subscriptions" && method === "POST") {
      const s = { id: `sub-${++n}`, resource: body.resource, expirationDateTime: body.expirationDateTime, clientState: body.clientState };
      state.subscriptions.push(s);
      return json(s, 201);
    }
    const sub = p.match(/^\/subscriptions\/([^/]+)$/);
    if (sub) {
      const s = state.subscriptions.find((x) => x.id === decodeURIComponent(sub[1]!));
      if (!s) return json({ error: { code: "ResourceNotFound", message: "not found" } }, 404);
      if (method === "PATCH") {
        s.expirationDateTime = body.expirationDateTime;
        return json(s);
      }
      if (method === "DELETE") {
        state.subscriptions = state.subscriptions.filter((x) => x.id !== s.id);
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: { code: "BadRequest", message: `fixture: unhandled ${method} ${p}` } }, 400);
  }) as typeof fetch;

  return { fetchImpl, state };
}
