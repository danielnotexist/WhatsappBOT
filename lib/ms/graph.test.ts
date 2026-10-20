import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { createGraphFixture } from "./__fixtures__/graph-fixtures";
import { driveItemText } from "./files-text";
import { GraphClient, GraphError, htmlToText } from "./graph";
import { ensureInboxSubscription } from "./subscriptions";
import { getAccessToken, sealTokens } from "./token-store";

describe("GraphClient (recorded fixtures)", () => {
  const make = () => {
    const f = createGraphFixture();
    const client = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: f.fetchImpl });
    return { client, ...f };
  };

  it("reads the profile, inbox, search and a message body as text", async () => {
    const { client } = make();
    expect(await client.me()).toMatchObject({ mail: "dana@levi-law.co.il", mailboxTimeZone: "Israel Standard Time" });
    const inbox = await client.listInbox({ top: 5, unreadOnly: true });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ subject: "הצעת פשרה, תיק 4471", from: { address: "office@shapira-law.co.il" }, isRead: false });
    const found = await client.searchMessages("שפירא");
    expect(found.map((m) => m.id)).toEqual(["AAMkAGm1"]);
    const full = await client.getMessage("AAMkAGm1");
    expect(full.bodyText).toBe("שלום דנה,\nבהמשך לשיחתנו מצורפת הצעת פשרה. נשמח לתשובה עד יום חמישי.\nבברכה,\nשפירא");
    await expect(client.getMessage("nope")).rejects.toBeInstanceOf(GraphError);
  });

  it("sends mail and replies with the Graph payload shapes", async () => {
    const { client, state } = make();
    await client.sendMail({ to: ["a@b.co"], subject: "נושא", body: "גוף" });
    expect(state.sent[0]).toMatchObject({ message: { subject: "נושא", body: { contentType: "Text", content: "גוף" }, toRecipients: [{ emailAddress: { address: "a@b.co" } }] }, saveToSentItems: true });
    await client.sendMail({ to: ["office@shapira-law.co.il"], subject: "x", body: "תשובה", replyToMessageId: "AAMkAGm1" });
    expect(state.sent[1]).toMatchObject({ reply: "AAMkAGm1", comment: "תשובה" });
  });

  it("lists, creates, updates and cancels calendar events in the user's time zone", async () => {
    const { client, state } = make();
    const events = await client.calendarView(new Date("2026-10-21T00:00:00Z"), new Date("2026-10-21T23:59:59Z"));
    expect(events.map((e) => e.subject)).toEqual(["דיון בבית משפט השלום ת״א", "פגישה עם רו״ח ברק"]);
    expect(state.calls.at(-1)!.url).toContain("calendarView");
    const created = await client.createEvent({ subject: "פגישה עם כהן", start: "2026-10-22T10:00:00", end: "2026-10-22T11:00:00", timeZone: "Asia/Jerusalem", attendees: ["cohen@x.co"] });
    expect(created.subject).toBe("פגישה עם כהן");
    expect(created.attendees[0]!.address).toBe("cohen@x.co");
    const moved = await client.updateEvent(created.id, { timeZone: "Asia/Jerusalem", start: "2026-10-23T10:00:00", end: "2026-10-23T11:00:00" });
    expect(moved.start).toBe("2026-10-23T10:00:00");
    await client.deleteEvent(created.id);
    expect(state.events.find((e) => e.id === created.id)).toBeUndefined();
  });

  it("searches OneDrive and extracts text from the PDF rendition", async () => {
    const { client } = make();
    const files = await client.searchFiles("כהן");
    expect(files.map((f) => f.name)).toEqual(["הסכם כהן.docx"]);
    const text = await driveItemText(client, files[0]!);
    expect(text?.text).toContain("Hello PDF 42");
    expect(text?.pages).toBe(1);
    const pdf = await client.getItem("01ITEM2");
    expect((await driveItemText(client, pdf))?.text).toContain("Hello PDF 42");
    expect(await driveItemText(client, { ...pdf, name: "photo.jpg" })).toBeNull();
  });

  it("retries once after a 401 through onUnauthorized", async () => {
    const f = createGraphFixture();
    let token = "expired";
    const client = new GraphClient({ getAccessToken: async () => token, onUnauthorized: async () => (token = "fresh"), fetchImpl: f.fetchImpl });
    expect((await client.me()).mail).toBe("dana@levi-law.co.il");
    expect(f.state.calls.filter((c) => c.url.endsWith("/me?$select=id,displayName,mail,userPrincipalName"))).toHaveLength(2);
  });

  it("creates and renews the inbox subscription", async () => {
    const { client, state } = make();
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const conn = db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
    const now = new Date("2026-10-20T10:00:00Z");
    await ensureInboxSubscription(db, client, conn, "https://app.example.co.il", now);
    expect(state.subscriptions).toHaveLength(1);
    expect(state.calls.at(-1)!.body).toMatchObject({ changeType: "created", notificationUrl: "https://app.example.co.il/api/graph/notify", resource: "me/mailFolders('inbox')/messages" });
    const stored = (await db.listGraphSubscriptionsForConnection(conn.id))[0]!;
    expect(stored.client_state).toHaveLength(32);
    await ensureInboxSubscription(db, client, conn, "https://app.example.co.il", now); // fresh → no call
    expect(state.subscriptions).toHaveLength(1);
    await ensureInboxSubscription(db, client, conn, "https://app.example.co.il", new Date(now.getTime() + 5.5 * 86_400_000));
    expect(state.calls.at(-1)!.method).toBe("PATCH");
  });

  it("converts html to readable text", () => {
    expect(htmlToText("<p>שלום&nbsp;דנה</p><div>שורה <b>2</b></div><br>סוף")).toBe("שלום דנה\nשורה 2\n\nסוף");
  });
});

describe("token store", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));
  afterEach(() => undefined);

  it("returns the sealed token while valid, refreshes when expiring and marks expired on invalid_grant", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const now = new Date("2026-10-20T10:00:00Z");
    const conn = await db.upsertConnection({ user_id: user.id, provider: "microsoft", account_email: "dana@levi-law.co.il", tenant_id: "t", scopes: [], consent_type: "user", ...sealTokens(user.id, { accessToken: "at1", refreshToken: "rt1", expiresAt: new Date(now.getTime() + 3_600_000), scope: [], idToken: null }) });
    expect((await db.getConnectionSecret(conn.id))!.enc_access).not.toContain("at1");
    let refreshed = 0;
    const fetchImpl = (async () => {
      refreshed++;
      return new Response(JSON.stringify({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    const cfg = { clientId: "c", clientSecret: "s", tenant: "common", redirectUri: "https://x/cb", fetchImpl };
    expect(await getAccessToken(db, cfg, conn, { now })).toBe("at1");
    expect(refreshed).toBe(0);
    expect(await getAccessToken(db, cfg, conn, { now: new Date(now.getTime() + 58 * 60_000) })).toBe("at2");
    expect(refreshed).toBe(1);
    expect(await getAccessToken(db, cfg, conn, { now: new Date(now.getTime() + 58 * 60_000) })).toBe("at2"); // re-sealed with the new expiry

    const bad = { ...cfg, fetchImpl: (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "AADSTS50173: expired" }), { status: 400 })) as unknown as typeof fetch };
    await expect(getAccessToken(db, bad, conn, { force: true })).rejects.toThrow(/invalid_grant/);
    expect((await db.getConnection(conn.id))!.status).toBe("expired");
  });
});
