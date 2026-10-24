import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { captureOwnerAlerts, settleOwnerAlerts, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { MemoryDb } from "@/lib/db/memory";
import { createGoogleFixture } from "./__fixtures__/google-fixtures";
import { GOOGLE_DOC_MIME, GMAIL_JSON_LIMIT_BYTES, GoogleApiError, GoogleClient, driveQueryLiteral } from "./client";
import { MAX_CONVERT_BYTES, driveFileText } from "./drive-text";
import { GoogleOAuthError } from "./oauth";
import { getGoogleAccessToken, sealGoogleTokens, storedGoogleRefreshToken } from "./token-store";

const make = () => {
  const f = createGoogleFixture();
  const client = new GoogleClient({ getAccessToken: async () => "ya29.tok", fetchImpl: f.fetchImpl });
  return { client, ...f };
};
const decodeWords = (s: string) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));

describe("GoogleClient — Calendar v3", () => {
  it("lists expanded events in the user's zone, skipping nothing but cancelled ones", async () => {
    const { client, state } = make();
    const events = await client.listEvents({ timeMin: new Date("2026-10-20T21:00:00Z"), timeMax: new Date("2026-10-21T21:00:00Z"), timeZone: "Asia/Jerusalem" });
    expect(events.map((e) => e.summary)).toEqual(["יום הולדת לנועה", "פגישת צוות שבועית", "שיחה עם משפחת אברהם"]);
    const call = new URL(state.calls[0]!.url);
    expect(call.origin + call.pathname).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(Object.fromEntries(call.searchParams)).toEqual({ timeMin: "2026-10-20T21:00:00.000Z", timeMax: "2026-10-21T21:00:00.000Z", singleEvents: "true", orderBy: "startTime", maxResults: "50", timeZone: "Asia/Jerusalem" });
    expect(state.calls[0]!.headers.Authorization).toBe("Bearer ya29.tok");
    expect(events[0]).toMatchObject({ isAllDay: true, start: "2026-10-21", transparency: "transparent" });
    expect(events[2]).toMatchObject({ start: "2026-10-21T13:00:00+03:00", location: "Google Meet", organizer: { self: true } });
    expect(events[2]!.attendees.map((a) => [a.email, a.self])).toEqual([["dana.levi@gmail.com", true], ["avraham@example.co.il", false]]);
  });

  it("creates (invites only with attendees), patches with sendUpdates=all and deletes; 410 counts as deleted", async () => {
    const { client, state } = make();
    const created = await client.createEvent({ summary: "פגישה עם כהן", start: "2026-10-22T10:00:00", end: "2026-10-22T11:00:00", timeZone: "Asia/Jerusalem", attendees: ["cohen@example.co.il"], location: "המשרד" });
    const post = state.calls.at(-1)!;
    expect(post.method).toBe("POST");
    expect(new URL(post.url).searchParams.get("sendUpdates")).toBe("all");
    expect(post.body).toEqual({ summary: "פגישה עם כהן", start: { dateTime: "2026-10-22T10:00:00", timeZone: "Asia/Jerusalem" }, end: { dateTime: "2026-10-22T11:00:00", timeZone: "Asia/Jerusalem" }, location: "המשרד", attendees: [{ email: "cohen@example.co.il" }] });
    expect(created).toMatchObject({ summary: "פגישה עם כהן", start: "2026-10-22T10:00:00+03:00" });
    await client.createEvent({ summary: "לבד", start: "2026-10-23", end: "2026-10-24", timeZone: "Asia/Jerusalem", isAllDay: true });
    expect(new URL(state.calls.at(-1)!.url).searchParams.get("sendUpdates")).toBe("none");
    expect(state.calls.at(-1)!.body).toMatchObject({ start: { date: "2026-10-23" }, end: { date: "2026-10-24" } });

    const moved = await client.patchEvent(created.id, { timeZone: "Asia/Jerusalem", start: "2026-10-23T10:00:00", end: "2026-10-23T11:00:00" });
    expect(state.calls.at(-1)).toMatchObject({ method: "PATCH", body: { start: { dateTime: "2026-10-23T10:00:00", timeZone: "Asia/Jerusalem" }, end: { dateTime: "2026-10-23T11:00:00", timeZone: "Asia/Jerusalem" } } });
    expect(new URL(state.calls.at(-1)!.url).searchParams.get("sendUpdates")).toBe("all");
    expect(moved.start).toBe("2026-10-23T10:00:00+03:00");
    expect((await client.getEvent(created.id)).summary).toBe("פגישה עם כהן");

    await client.deleteEvent(created.id);
    expect(state.calls.at(-1)!.method).toBe("DELETE");
    await expect(client.deleteEvent(created.id)).resolves.toBeUndefined(); // 410 Gone
    const missing = (await client.getEvent("nope").catch((e: unknown) => e)) as GoogleApiError;
    expect(missing).toBeInstanceOf(GoogleApiError);
    expect(missing.notFound).toBe(true);
    expect(missing.reason).toBe("notFound");
  });

  it("classifies a missing scope (granular consent) and retries once after 401", async () => {
    const { client, state } = make();
    state.denied.add("calendar");
    const err = (await client.listEvents({ timeMin: new Date(), timeMax: new Date(Date.now() + 1000) }).catch((e: unknown) => e)) as GoogleApiError;
    expect(err.status).toBe(403);
    expect(err.insufficientScope).toBe(true);
    expect(err.reason).toBe("ACCESS_TOKEN_SCOPE_INSUFFICIENT");
    expect(err.retryable).toBe(false);

    const f = createGoogleFixture();
    let token = "expired";
    let refreshed = 0;
    const retrying = new GoogleClient({ getAccessToken: async () => token, onUnauthorized: async () => ((refreshed += 1), (token = "fresh")), fetchImpl: f.fetchImpl });
    expect((await retrying.userInfo()).email).toBe("dana.levi@gmail.com");
    expect(refreshed).toBe(1);
    expect(f.state.calls.map((c) => c.headers.Authorization)).toEqual(["Bearer expired", "Bearer fresh"]);
    const giveUp = new GoogleClient({ getAccessToken: async () => "expired", onUnauthorized: async () => null, fetchImpl: f.fetchImpl });
    const e401 = (await giveUp.userInfo().catch((e: unknown) => e)) as GoogleApiError;
    expect(e401.unauthorized).toBe(true);
    expect(new GoogleApiError("x", 429, null).retryable).toBe(true);
    expect(new GoogleApiError("x", 403, "userRateLimitExceeded").retryable).toBe(true);
  });
});

describe("GoogleClient — Drive v3 (drive.file)", () => {
  it("lists app-visible files by name with an escaped q-string, newest first", async () => {
    const { client, state } = make();
    const all = await client.listFiles();
    expect(all.map((f) => f.id)).toEqual(["gdoc1", "gpdf1", "gdocx1", "gsheet1", "gimg1"]);
    const q = new URL(state.calls[0]!.url);
    expect(q.pathname).toBe("/drive/v3/files");
    expect(q.searchParams.get("q")).toBe("trashed = false and mimeType != 'application/vnd.google-apps.folder'");
    expect(q.searchParams.get("fields")).toBe("files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken");
    expect(q.searchParams.get("orderBy")).toBe("modifiedTime desc");
    const found = await client.listFiles({ query: "כהן" });
    expect(found.map((f) => f.name)).toEqual(["סיכום פגישה — כהן"]);
    expect(new URL(state.calls.at(-1)!.url).searchParams.get("q")).toContain("name contains 'כהן'");
    expect(driveQueryLiteral("O'Brien \\ x")).toBe("'O\\'Brien \\\\ x'");
    expect((await client.getFile("gpdf1")).size).toBe(1200);
  });

  it("extracts text from Docs, Sheets, PDF and Office (temporary converted copy, deleted after)", async () => {
    const { client, state } = make();
    expect(await driveFileText(client, await client.getFile("gdoc1"))).toEqual({ text: "סיכום: הוסכם על תשלום בשלוש פעימות.", pages: null, truncated: false });
    expect(state.calls.at(-1)!.url).toBe("https://www.googleapis.com/drive/v3/files/gdoc1/export?mimeType=text%2Fplain");
    expect((await driveFileText(client, await client.getFile("gsheet1")))).toMatchObject({ text: "חודש,סכום\nינואר,4200" });
    expect(state.calls.at(-1)!.url).toContain("mimeType=text%2Fcsv");
    expect(await driveFileText(client, await client.getFile("gpdf1"))).toMatchObject({ text: expect.stringContaining("Hello PDF 42"), pages: 1 });

    const before = state.files.length;
    const docx = await driveFileText(client, await client.getFile("gdocx1"));
    expect(docx).toMatchObject({ text: "הסכם שכירות בין הצדדים לתקופה של 24 חודשים." });
    const upload = state.calls.find((c) => c.url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"))!;
    expect(upload.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(state.calls.some((c) => c.method === "DELETE" && c.url.includes("/drive/v3/files/gnew"))).toBe(true);
    expect(state.files).toHaveLength(before);

    expect(await driveFileText(client, await client.getFile("gimg1"))).toBeNull();
    expect(await driveFileText(client, { ...(await client.getFile("gdocx1")), size: MAX_CONVERT_BYTES + 1 })).toEqual({ error: "too_large" });
  });

  it("creates a Google Doc from text (multipart upload) and updates content", async () => {
    const { client, state } = make();
    const doc = await client.createFile({ name: "סיכום שיחה", mimeType: "text/plain", content: "שורה ראשונה", convertTo: GOOGLE_DOC_MIME, boundary: "B1" });
    expect(doc).toMatchObject({ name: "סיכום שיחה", mimeType: GOOGLE_DOC_MIME });
    const call = state.calls.at(-1)!;
    expect(call.url).toBe("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CmimeType%2CmodifiedTime%2Csize%2CwebViewLink");
    expect(call.headers["Content-Type"]).toBe("multipart/related; boundary=B1");
    expect((call.body as Buffer).toString("utf8")).toBe(`--B1\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"סיכום שיחה","mimeType":"${GOOGLE_DOC_MIME}"}\r\n--B1\r\nContent-Type: text/plain\r\n\r\nשורה ראשונה\r\n--B1--\r\n`);
    expect(new TextDecoder().decode(state.files.find((f) => f.id === doc.id)!.content)).toBe("שורה ראשונה");

    await client.updateFileContent(doc.id, "גרסה 2", "text/plain");
    expect(state.calls.at(-1)).toMatchObject({ method: "PATCH", headers: { "Content-Type": "text/plain" } });
    expect(new TextDecoder().decode(state.files.find((f) => f.id === doc.id)!.content)).toBe("גרסה 2");
    await client.deleteFile(doc.id);
    expect(state.files.find((f) => f.id === doc.id)).toBeUndefined();
    expect(((await client.downloadFile("gdoc1").catch((e: unknown) => e)) as GoogleApiError).reason).toBe("fileNotDownloadable");
  });
});

describe("GoogleClient — Gmail send", () => {
  it("sends RFC 2822 as base64url JSON {raw}, threadId optional", async () => {
    const { client, state } = make();
    const sent = await client.sendMail({ to: [{ email: "avraham@example.co.il", name: "יוסי אברהם" }], subject: "סיכום הפגישה", body: "שלום יוסי" });
    expect(sent).toMatchObject({ labelIds: ["SENT"] });
    const call = state.calls.at(-1)!;
    expect(call.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(Object.keys(call.body as object)).toEqual(["raw"]);
    expect(state.sent[0]!.via).toBe("json");
    expect(decodeWords(state.sent[0]!.mime)).toContain("Subject: סיכום הפגישה");
    await client.sendMail({ to: [{ email: "a@b.co" }], subject: "Re", body: "x", threadId: "t-1" });
    expect(state.sent[1]!.threadId).toBe("t-1");
  });

  it("switches to the media-upload URI for large messages and refuses oversized attachments", async () => {
    const { client, state } = make();
    const big = new Uint8Array(GMAIL_JSON_LIMIT_BYTES);
    await client.sendMail({ to: [{ email: "a@b.co" }], subject: "קובץ גדול", body: "מצורף", attachments: [{ filename: "big.bin", contentType: "application/octet-stream", bytes: big }] });
    const call = state.calls.at(-1)!;
    expect(call.url).toBe("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media");
    expect(call.headers["Content-Type"]).toBe("message/rfc822");
    expect(state.sent[0]!.via).toBe("upload");
    expect(state.sent[0]!.mime).toContain("Content-Type: multipart/mixed;");
    const tooBig = (await client.sendMail({ to: [{ email: "a@b.co" }], subject: "x", body: "x", attachments: [{ filename: "x", contentType: "application/pdf", bytes: new Uint8Array(19 * 1024 * 1024) }] }).catch((e: unknown) => e)) as GoogleApiError;
    expect(tooBig.reason).toBe("attachmentsTooLarge");
    state.denied.add("gmail");
    expect(((await client.sendMail({ to: [{ email: "a@b.co" }], subject: "x", body: "x" }).catch((e: unknown) => e)) as GoogleApiError).insufficientScope).toBe(true);
  });
});

describe("Google token store", () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  });

  it("serves the sealed token, refreshes near expiry keeping the refresh token, and marks expired on invalid_grant", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-21T08:00:00Z");
    const conn = await db.upsertConnection({ user_id: user.id, provider: "google", account_email: "dana.levi@gmail.com", tenant_id: null, scopes: [], consent_type: "user", ...sealGoogleTokens(user.id, { accessToken: "ya29.a", refreshToken: "1//r", expiresAt: new Date(now.getTime() + 3_600_000) }) });
    const secret = (await db.getConnectionSecret(conn.id))!;
    expect(secret.enc_access).toMatch(/^v1\./);
    expect(secret.enc_refresh).not.toContain("1//r");
    expect(await storedGoogleRefreshToken(db, conn)).toBe("1//r");

    const f = createGoogleFixture();
    const cfg = { clientId: "c", clientSecret: "s", redirectUri: "https://x/cb", fetchImpl: f.fetchImpl };
    expect(await getGoogleAccessToken(db, cfg, conn, { now })).toBe("ya29.a");
    expect(f.state.calls).toHaveLength(0);
    const fresh = await getGoogleAccessToken(db, cfg, conn, { now: new Date(now.getTime() + 57 * 60_000) });
    expect(fresh).toMatch(/^ya29\.fixture-/);
    expect(f.state.calls[0]!.body).toMatchObject({ grant_type: "refresh_token", refresh_token: "1//r" });
    expect(await storedGoogleRefreshToken(db, conn)).toBe("1//r"); // Google sent no new refresh token → kept
    expect(await getGoogleAccessToken(db, cfg, conn, { now: new Date(now.getTime() + 57 * 60_000) })).toBe(fresh); // re-sealed with the new expiry

    // a token sealed for another user does not decrypt (AAD binds user + provider)
    const other = await db.createUser("other@example.com");
    await expect(storedGoogleRefreshToken(db, { id: conn.id, user_id: other.id })).rejects.toThrow();

    f.state.tokenMode = "invalid_grant"; // e.g. testing-mode refresh token older than 7 days
    // a paying user: the owner hears about it (lib/admin/alerts.ts connection_expired_paid)
    await db.upsertSubscription(conn.user_id, { plan: "pro", status: "active", next_charge_at: new Date(Date.now() + 20 * 86_400_000).toISOString() });
    const seen = captureOwnerAlerts();
    try {
      const err = (await getGoogleAccessToken(db, cfg, conn, { force: true }).catch((e: unknown) => e)) as GoogleOAuthError;
      expect(err.needsReconnect).toBe(true);
      expect((await db.getConnection(conn.id))!.status).toBe("expired");
      expect(db.audit.at(-1)).toMatchObject({ action: "connection.expired", target: conn.id, result: "google:invalid_grant" });
      await settleOwnerAlerts();
      expect(seen.map((s) => s.event)).toEqual([expect.objectContaining({ type: "connection_expired_paid", userId: conn.user_id, provider: "google", plan: "פרו", connectionId: conn.id })]);
    } finally {
      stopCapturingOwnerAlerts();
    }
  });
});
