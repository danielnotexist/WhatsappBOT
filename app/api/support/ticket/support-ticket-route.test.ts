import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureOwnerAlerts, notifyOwner, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { EnvError } from "@/lib/env";
import { setMailerForTests } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter, setRateLimiterForTests } from "@/lib/rate-limit";
import { supportInbox, ticketMail } from "@/lib/support/notify";
import { ANONYMOUS_NAME } from "@/lib/support/system-request";
import { SYSTEM_REQUEST_PREFIX, isSystemRequest, type SupportErrorResponse, type SupportTicketPrefill, type SupportTicketResponse } from "@/lib/support/types";
import { GET, POST } from "./route";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const APP = "https://alze.example";
const URL_ = `${APP}/api/support/ticket`;
let ip = 0;
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip % 250}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

type Res = SupportTicketResponse | SupportErrorResponse;
const send = async (r: Request) => {
  const res = await POST(r);
  return { status: res.status, body: (await res.json()) as Res };
};

const valid = {
  name: "דנה לוי",
  email: "dana@example.com",
  subject: "חיוב",
  body: "חויבתי פעמיים החודש, אפשר לבדוק?",
  website: "",
};

let db: MemoryDb;
let mailer: ConsoleMailer;

beforeEach(() => {
  jar.clear();
  vi.stubEnv("APP_URL", APP);
  vi.stubEnv("DATA_MODE", "memory");
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
  db = new MemoryDb();
  setDbForTests(db);
  mailer = new ConsoleMailer();
  setMailerForTests(mailer);
  setRateLimiterForTests(new MemoryRateLimiter());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTests(undefined);
  setMailerForTests(undefined);
  setRateLimiterForTests(undefined);
});

describe("/api/support/ticket — a ticket", () => {
  it("stores the row (open, anonymous) and emails the support inbox with Reply-To the person", async () => {
    const transcript = [
      { role: "user", text: "כמה זה עולה?" },
      { role: "assistant", text: "בסיסי ב-99 ₪ לחודש." },
    ];
    const r = await send(req({ ...valid, transcript }));
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(db.supportTickets).toHaveLength(1);
    const row = db.supportTickets[0]!;
    expect(row).toMatchObject({ user_id: null, name: "דנה לוי", email: "dana@example.com", subject: "חיוב", body: valid.body, transcript, status: "open" });
    expect(mailer.tickets).toHaveLength(1);
    const mail = mailer.tickets[0]!;
    expect(mail).toMatchObject({ to: `support@${BRAND.domain}`, replyTo: "dana@example.com", subject: "פנייה חדשה: חיוב" });
    expect(mail.text).toContain(`מספר פנייה: ${row.id}`);
    expect(mail.text).toContain(valid.body);
    expect(mail.text).toContain("- הפונה: כמה זה עולה?");
    expect(mail.text).toContain(`- ${BRAND.name}: בסיסי ב-99 ₪ לחודש.`);
    expect(mail.text).toContain("משתמש רשום: לא, או לא מחובר");
  });

  it("SUPPORT_EMAIL decides the inbox; an empty subject is stored as null and the mail's subject comes from the description", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "help@alze.example");
    expect((await send(req({ ...valid, subject: "  ", transcript: null }))).status).toBe(200);
    expect(db.supportTickets[0]).toMatchObject({ subject: null, transcript: null });
    expect(mailer.tickets[0]).toMatchObject({ to: "help@alze.example", subject: `פנייה חדשה: ${valid.body.slice(0, 60)}` });
  });

  it("signed in: the ticket is linked to the account, and GET prefills the address", async () => {
    const user = await db.createUser("noa@example.com");
    expect(await (await GET()).json()).toEqual({ ok: true, email: null } satisfies SupportTicketPrefill);
    jar.set(SESSION_COOKIE, createSessionToken(user.id));
    expect(await (await GET()).json()).toEqual({ ok: true, email: "noa@example.com" } satisfies SupportTicketPrefill);
    expect((await send(req({ ...valid, email: "noa@example.com" }))).status).toBe(200);
    expect(db.supportTickets[0]!.user_id).toBe(user.id);
    expect(mailer.tickets[0]!.text).toContain(`משתמש רשום: כן (${user.id})`);
    // the account is deleted later: the ticket stays, unlinked (SQL: on delete set null)
    await db.deleteUser(user.id);
    expect(db.supportTickets[0]!.user_id).toBeNull();
    jar.set(SESSION_COOKIE, "v1.forged.123.abc");
    expect(await (await GET()).json()).toEqual({ ok: true, email: null });
  });

  it("a failed mail does not fail the ticket (it is stored); the log never carries the ticket's words", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.sendSupportTicket = async () => {
      throw new Error("Resend 500: down");
    };
    expect((await send(req(valid))).status).toBe(200);
    expect(db.supportTickets).toHaveLength(1);
    expect(errors).toHaveBeenCalled();
    expect(JSON.stringify(errors.mock.calls)).not.toContain("חויבתי");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("dana@example.com");
  });
});

describe("/api/support/ticket — the owner's alert (lib/admin/alerts.ts), merged with the support mail", () => {
  afterEach(() => stopCapturingOwnerAlerts());

  it("a ticket and a system request each tell the owner once; the support inbox that got the mail is not mailed again", async () => {
    const seen = captureOwnerAlerts();
    await send(req(valid));
    await send(req({ kind: "system", system: "Monday", want: "לראות משימות פתוחות", email: "ron@example.com", website: "" }));
    expect(seen.map((s) => s.event)).toEqual([
      { type: "ticket", ticketId: db.supportTickets[0]!.id, subject: "חיוב", fromName: "דנה לוי", fromEmail: "dana@example.com", userId: null, excerpt: valid.body },
      expect.objectContaining({ type: "system_request", ticketId: db.supportTickets[1]!.id, subject: `${SYSTEM_REQUEST_PREFIX}Monday`, fromEmail: "ron@example.com" }),
    ]);
    expect(seen[0]!.deps.alreadyMailed).toEqual([`support@${BRAND.domain}`]);
  });

  it("SUPPORT_EMAIL is the owner's address → the alert is merged: one mail in that inbox, not two", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "danielnotexist@gmail.com");
    const seen = captureOwnerAlerts();
    await send(req(valid));
    expect(mailer.tickets.map((m) => m.to)).toEqual(["danielnotexist@gmail.com"]);
    const { event, deps } = seen[0]!;
    expect(deps.alreadyMailed).toEqual(["danielnotexist@gmail.com"]);
    const alerts = new ConsoleMailer();
    expect(await notifyOwner(event, { ...deps, db, mailer: alerts, env: { NODE_ENV: "test", DATA_MODE: "memory", APP_URL: APP } })).toMatchObject({ status: "merged" });
    expect(alerts.ownerAlerts).toHaveLength(0);
  });

  it("the support mail failed → the owner still gets the alert (nothing counts as already mailed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.sendSupportTicket = async () => Promise.reject(new Error("Resend 500: down"));
    const seen = captureOwnerAlerts();
    await send(req(valid));
    expect(seen[0]!.deps.alreadyMailed).toEqual([]);
  });
});

describe("/api/support/ticket — validation and abuse", () => {
  it("a Hebrew line per field; nothing stored or sent", async () => {
    const r = await send(req({ name: " ", email: "not-an-address", body: "רגע", website: "" }));
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      ok: false,
      code: "invalid",
      message: "חסרים פרטים בטופס.",
      fields: { name: "צריך למלא שם.", email: "כתובת המייל לא תקינה.", body: "צריך לתאר במשפט או שניים מה קרה." },
    });
    const long = await send(req({ ...valid, name: "א".repeat(81), subject: "ב".repeat(121), body: "ג".repeat(4001) }));
    expect((long.body as SupportErrorResponse).fields).toEqual({
      name: "השם ארוך מדי. אפשר עד 80 תווים.",
      subject: "הנושא ארוך מדי. אפשר עד 120 תווים.",
      body: "התיאור ארוך מדי. אפשר עד 4,000 תווים.",
    });
    expect((await send(req({ ...valid, email: undefined }))).body).toMatchObject({ fields: { email: "צריך למלא כתובת מייל." } });
    expect(db.supportTickets).toHaveLength(0);
    expect(mailer.tickets).toHaveLength(0);
  });

  it("a malformed transcript or body is a plain 400", async () => {
    const many = Array.from({ length: 21 }, () => ({ role: "user", text: "שאלה" }));
    expect(await send(req({ ...valid, transcript: many }))).toMatchObject({ status: 400, body: { code: "bad_request" } });
    expect(await send(req({ ...valid, transcript: [{ role: "system", text: "x" }] }))).toMatchObject({ status: 400, body: { code: "bad_request" } });
    expect((await send(req("{"))).status).toBe(400);
    expect((await send(req("[]"))).status).toBe(400);
    expect(db.supportTickets).toHaveLength(0);
  });

  it("the honeypot: the same 200, nothing stored, nothing sent", async () => {
    expect(await send(req({ ...valid, website: "https://spam.example" }))).toEqual({ status: 200, body: { ok: true } });
    expect(db.supportTickets).toHaveLength(0);
    expect(mailer.tickets).toHaveLength(0);
  });

  it("another site's Origin → 403; 5 tickets an hour per IP, then 429", async () => {
    expect((await send(req(valid, { origin: "https://evil.example" }))).status).toBe(403);
    for (let i = 0; i < 5; i++) expect((await POST(req(valid, { "x-forwarded-for": "4.4.4.4" }))).status).toBe(200);
    const r = await send(req(valid, { "x-forwarded-for": "4.4.4.4" }));
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "rate_limited", message: "נשלחו כבר כמה פניות מכאן. אפשר לנסות שוב בעוד שעה." });
    expect(db.supportTickets).toHaveLength(5);
  });
});

describe("/api/support/ticket — a system request ('בקשת מערכת')", () => {
  const request = { kind: "system", system: "Salesforce", want: "לבדוק את הסטטוס של לקוח לפני שיחה", email: "ron@example.com", business: "משרד ייעוץ", website: "" };

  it("is stored as a ticket marked by its subject (no migration) and mailed under its own subject", async () => {
    expect(await send(req(request))).toEqual({ status: 200, body: { ok: true } });
    const row = db.supportTickets[0]!;
    expect(row).toMatchObject({ user_id: null, name: ANONYMOUS_NAME, email: "ron@example.com", subject: `${SYSTEM_REQUEST_PREFIX}Salesforce`, transcript: null, status: "open" });
    expect(isSystemRequest(row.subject)).toBe(true);
    expect(row.body).toBe(`מערכת: Salesforce\nמה ${BRAND.name} תעשה איתה: לבדוק את הסטטוס של לקוח לפני שיחה\nסוג העסק: משרד ייעוץ`);
    const mail = mailer.tickets[0]!;
    expect(mail).toMatchObject({ replyTo: "ron@example.com", subject: "בקשת מערכת: Salesforce" });
    expect(mail.text.split("\n")[0]).toBe("בקשת מערכת חדשה מהאתר: מערכת שלקוח רוצה לחבר");
    // the business type is optional
    expect((await send(req({ ...request, business: "" }))).status).toBe(200);
    expect(db.supportTickets[1]!.body).toContain("סוג העסק: (לא צוין)");
  });

  it("signed in: linked to the account, under the person's name", async () => {
    const user = await db.createUser("noa@example.com");
    await db.updateUserProfile(user.id, { name: "נועה כהן" });
    jar.set(SESSION_COOKIE, createSessionToken(user.id));
    expect((await send(req({ ...request, email: "noa@example.com" }))).status).toBe(200);
    expect(db.supportTickets[0]).toMatchObject({ user_id: user.id, name: "נועה כהן" });
  });

  it("a Hebrew line per field of its own form; nothing stored", async () => {
    const r = await send(req({ kind: "system", system: " ", want: "x", email: "", website: "" }));
    expect(r).toMatchObject({ status: 400, body: { code: "invalid", fields: { system: "צריך לכתוב את שם המערכת.", want: "צריך לכתוב במשפט אחד מה היא תעשה איתה.", email: "צריך למלא כתובת מייל." } } });
    const long = await send(req({ ...request, system: "א".repeat(81), want: "ב".repeat(1001), business: "ג".repeat(81) }));
    expect((long.body as SupportErrorResponse).fields).toEqual({ system: "השם ארוך מדי. אפשר עד 80 תווים.", want: "התיאור ארוך מדי. אפשר עד 1,000 תווים.", business: "אפשר עד 80 תווים." });
    expect(db.supportTickets).toHaveLength(0);
  });

  it("the same abuse limits as a ticket: the honeypot, another site's Origin, and one shared budget per IP", async () => {
    expect(await send(req({ ...request, website: "https://spam.example" }))).toEqual({ status: 200, body: { ok: true } });
    expect(db.supportTickets).toHaveLength(0);
    expect((await send(req(request, { origin: "https://evil.example" }))).status).toBe(403);
    for (let i = 0; i < 3; i++) expect((await POST(req(request, { "x-forwarded-for": "5.5.5.5" }))).status).toBe(200);
    for (let i = 0; i < 2; i++) expect((await POST(req(valid, { "x-forwarded-for": "5.5.5.5" }))).status).toBe(200);
    expect((await send(req(request, { "x-forwarded-for": "5.5.5.5" }))).status).toBe(429);
    expect(mailer.tickets).toHaveLength(5);
  });
});

describe("supportInbox / ticketMail", () => {
  it("SUPPORT_EMAIL is required when mail is real, with a Hebrew EnvError naming it; the demo and dev default to support@<domain>", () => {
    expect(() => supportInbox({})).toThrow(EnvError);
    try {
      supportInbox({});
    } catch (e) {
      expect((e as EnvError).missing).toEqual(["SUPPORT_EMAIL"]);
      expect((e as EnvError).message).toContain("חסר SUPPORT_EMAIL");
    }
    expect(() => supportInbox({ SUPPORT_EMAIL: "nope" })).toThrow(EnvError);
    expect(supportInbox({ SUPPORT_EMAIL: "help@alze.example" })).toBe("help@alze.example");
    expect(supportInbox({ DATA_MODE: "memory" })).toBe(`support@${BRAND.domain}`);
    expect(supportInbox({ DEMO_MODE: "1", TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64") })).toBe(`support@${BRAND.domain}`);
  });

  it("the mail's subject is one line, whatever the person typed", () => {
    const mail = ticketMail(
      { id: "t1", created_at: "", user_id: null, name: "א", email: "a@example.com", subject: "שורה\nשנייה", body: "x", transcript: null, status: "open" },
      "support@example.com",
    );
    expect(mail.subject).toBe("פנייה חדשה: שורה שנייה");
  });
});
