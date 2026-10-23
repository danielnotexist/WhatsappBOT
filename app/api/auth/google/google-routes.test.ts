import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import { decryptToken } from "@/lib/crypto";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { FIXTURE_GOOGLE_SCOPE, createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES } from "@/lib/google/oauth";
import { googleTools } from "@/lib/google/tools";
import { countCapUsers, googleAccountHash } from "@/lib/google/user-cap";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { GET as callbackGet } from "./callback/route";
import { GET as startGet } from "./start/route";

const jar = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "wb_session" && jar.session ? { name, value: jar.session } : undefined) }) }));

const APP = "https://app.example.co.il";
const fixture = () => globalSingleton("google-fixture", () => createGoogleFixture()).state;
const location = (r: Response) => new URL(r.headers.get("location")!);

describe("Google connect routes (memory mode)", () => {
  let db: MemoryDb;
  let wa: RecordingWaSender;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", APP);
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    db = new MemoryDb();
    wa = new RecordingWaSender();
    setDbForTests(db);
    setWaSenderForTests(wa);
    setGlobalSingleton("google-fixture", undefined);
    jar.session = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
  });

  const startFromChat = async (userId: string, extra = "") => startGet(new Request(`${APP}/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(userId, "google"))}${extra}`));
  /** the pro-only Google consents (drive.readonly, Tasks) need pro since the split of 23.10.2026 (lib/billing/plans.ts) */
  const asPro = (userId: string) => db.upsertSubscription(userId, { plan: "pro", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
  const asBasic = (userId: string) => db.upsertSubscription(userId, { plan: "basic", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });

  it("chat link → Google consent (PKCE, offline, consent, incremental); callback stores encrypted tokens + scopes, tells the user, lands on /account", async () => {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    const start = await startFromChat(user.id);
    expect(start.status).toBe(303);
    const consent = location(start);
    expect(consent.origin + consent.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(consent.searchParams.get("redirect_uri")).toBe(`${APP}/api/auth/google/callback`);
    expect(consent.searchParams.get("access_type")).toBe("offline");
    expect(consent.searchParams.get("prompt")).toBe("consent");
    expect(consent.searchParams.get("include_granted_scopes")).toBe("true");
    expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
    expect(consent.searchParams.get("login_hint")).toBeNull();
    const state = consent.searchParams.get("state")!;
    const pending = ((await db.getUser(user.id))!.profile.oauth_pending as { google: Record<string, unknown> }).google;
    expect(pending).toMatchObject({ state, returnTo: "account", feature: null, via: "chat" });

    const cb = await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=4%2F0Afix&scope=openid`));
    expect(cb.status).toBe(303);
    expect(location(cb).pathname).toBe("/account");
    expect(location(cb).searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    const [conn] = await db.listConnections(user.id);
    expect(conn).toMatchObject({ provider: "google", account_email: "dana.levi@gmail.com", tenant_id: null, status: "active", consent_type: "user" });
    expect(conn!.scopes).toEqual(expect.arrayContaining([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend, "email", "openid", "profile"]));
    const secret = (await db.getConnectionSecret(conn!.id))!;
    expect(secret.enc_access).toMatch(/^v1\./);
    expect(decryptToken(secret.enc_refresh!, { aad: `${user.id}:google` })).toMatch(/^1\/\/fixture-refresh-/);
    const tokenCall = fixture().calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!;
    expect(tokenCall.body).toMatchObject({ grant_type: "authorization_code", code: "4/0Afix", code_verifier: pending.verifier, redirect_uri: `${APP}/api/auth/google/callback` });
    expect(wa.texts.at(-1)).toContain("החיבור ל-Google הושלם (dana.levi@gmail.com)");
    expect(wa.texts.at(-1)).toContain("שליחת מיילים מ-Gmail, אחרי אישור בכפתור");
    expect(wa.texts.at(-1)).toContain("את תיבת ה-Gmail עצמה אני לא קורא");
    expect((await db.getUser(user.id))!.name).toBe("דנה לוי");
    expect(db.audit.at(-1)).toMatchObject({ action: "google.connect", target: "dana.levi@gmail.com", result: "ok" });

    // state is single-use; bad or Microsoft chat tokens are refused
    const again = await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=x`));
    expect(location(again).searchParams.get("error")).toContain("לא זוהתה");
    expect((await startGet(new Request(`${APP}/api/auth/google/start?t=bad`))).status).toBe(410);
    const msToken = await startGet(new Request(`${APP}/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    expect(msToken.status).toBe(410);
    expect(await msToken.text()).toContain("הקישור לא בתוקף");

    // a reconnect hints the known account
    expect(location(await startFromChat(user.id)).searchParams.get("login_hint")).toBe("dana.levi@gmail.com");
  });

  it("Drive read (restricted): refused while off, asked for on its own when on, kept by the callback; at the cap one Hebrew line", async () => {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await asPro(user.id);
    const off = await startFromChat(user.id, "&feature=drive_read");
    expect(off.status).toBe(403);
    expect(await off.text()).toBe("קריאה של כל הקבצים ב-Drive אינה זמינה כרגע. היומן, Gmail וקבצים שנוצרו דרך עלזה ממשיכים לעבוד.");

    vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "true");
    db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    const on = location(await startFromChat(user.id, "&feature=drive_read&returnTo=account"));
    expect(on.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.driveReadonly}`);
    expect(on.searchParams.get("include_granted_scopes")).toBe("true");
    fixture().grantedScope += ` ${GOOGLE_SCOPES.driveReadonly}`;
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${on.searchParams.get("state")}&code=abc`)));
    expect(cb.pathname).toBe("/account");
    expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    expect((await db.listConnections(user.id)).find((c) => c.account_email === "dana.levi@gmail.com" && c.status === "active")!.scopes).toContain(GOOGLE_SCOPES.driveReadonly);
    expect(db.audit.filter((a) => a.action === "google.connect").at(-1)).toMatchObject({ result: "ok:drive_read" });
    expect(db.googleScopeGrants.map((g) => g.scope)).toContain(GOOGLE_SCOPES.driveReadonly);
    expect(wa.texts.at(-1)).toContain("חיפוש וקריאה של כל הקבצים ב-Drive, כולל Docs, Sheets ו-Slides");

    // a brand-new account at the cap
    for (let i = 0; i < 95; i++) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(`user${i}@gmail.com`), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
    const newcomer = await db.createUser("new@example.com");
    await asPro(newcomer.id);
    const full = await startFromChat(newcomer.id, "&feature=drive_read");
    expect(full.status).toBe(403);
    expect(await full.text()).toBe("קריאה של כל הקבצים ב-Drive פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Gmail וקבצים שנוצרו דרך עלזה ממשיכים לעבוד.");
  });

  it("drive.readonly that comes back while Drive read is off is not kept (the same rule as Gmail read)", async () => {
    vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "false");
    const user = await db.createUser("dana@example.com");
    const consent = location(await startFromChat(user.id));
    expect(consent.searchParams.get("scope")).not.toContain("drive.readonly");
    fixture().grantedScope = `${FIXTURE_GOOGLE_SCOPE} ${GOOGLE_SCOPES.driveReadonly}`;
    await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`));
    expect((await db.listConnections(user.id))[0]!.scopes).not.toContain(GOOGLE_SCOPES.driveReadonly);
    expect(db.audit.find((a) => a.action === "google.drive_read_not_kept")).toMatchObject({ result: "disabled" });
  });

  it("Google Tasks for a connection made before it joined the base set: an incremental consent for `tasks` only", async () => {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await asPro(user.id);
    db.seedConnection(user.id, "google", "dana.levi@gmail.com").scopes = ["openid", "email", GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend];
    const consent = location(await startFromChat(user.id, "&feature=tasks"));
    expect(consent.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.tasks}`);
    expect(consent.searchParams.get("login_hint")).toBe("dana.levi@gmail.com");
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`)));
    expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    expect((await db.listConnections(user.id)).find((c) => c.status === "active")!.scopes).toContain(GOOGLE_SCOPES.tasks);
    expect(db.audit.filter((a) => a.action === "google.connect").at(-1)).toMatchObject({ result: "ok:tasks" });

    // unticked → partial, and the retry link asks for tasks again
    const again = location(await startFromChat(user.id, "&feature=tasks"));
    fixture().grantedScope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events";
    const partial = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${again.searchParams.get("state")}&code=abc`)));
    expect(partial.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com), אבל לא ניתנה הרשאה לנהל משימות ב-Google Tasks. אפשר לחבר שוב ולסמן את כל האפשרויות.");
    expect(wa.texts.at(-1)).toMatch(/\/api\/auth\/google\/start\?t=[^&\s]+&feature=tasks/);
  });

  it("web onboarding (session cookie, returnTo=onboarding) → /start/ready?connected=google; errors go back to /start/connect", async () => {
    const user = await db.createUser("dana@example.com");
    expect(location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`))).pathname).toBe("/start"); // no session
    jar.session = createSessionToken(user.id);
    const start = await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`));
    const state = location(start).searchParams.get("state")!;
    expect(((await db.getUser(user.id))!.profile.oauth_pending as { google: Record<string, unknown> }).google).toMatchObject({ returnTo: "onboarding", via: "web" });
    const ok = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=abc`)));
    expect(ok.pathname).toBe("/start/ready");
    expect(ok.searchParams.get("connected")).toBe("google");
    expect(wa.texts).toEqual([]); // no WhatsApp linked yet → nothing sent

    const s2 = location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`))).searchParams.get("state")!;
    const denied = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${s2}&error=access_denied`)));
    expect(denied.pathname).toBe("/start/connect");
    expect(denied.searchParams.get("error")).toBe("החיבור ל-Google בוטל במסך האישור. אפשר לנסות שוב בכל רגע.");
    expect(db.audit.at(-1)).toMatchObject({ action: "google.connect", result: "error:access_denied" });

    const s3 = location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=https://evil.example.com`))).searchParams.get("state")!;
    const blocked = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${s3}&error=admin_policy_enforced`)));
    expect(blocked.origin + blocked.pathname).toBe(`${APP}/account`); // unknown returnTo → account, never an external URL
    expect(blocked.searchParams.get("error")).toContain("Google Workspace");
  });

  it("granular consent with gmail.send unticked → partial notice + WhatsApp link to add it", async () => {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    fixture().grantedScope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/tasks";
    const state = location(await startFromChat(user.id)).searchParams.get("state")!;
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=abc`)));
    expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com), אבל לא ניתנה הרשאה לשלוח מיילים מ-Gmail. אפשר לחבר שוב ולסמן את כל האפשרויות.");
    expect(wa.texts.at(-2)).not.toContain("שליחת מיילים");
    expect(wa.texts.at(-1)).toContain("לא אוכל לשלוח מיילים מ-Gmail");
    expect(wa.texts.at(-1)).toContain(`${APP}/api/auth/google/start?t=`);
    expect(db.audit.find((a) => a.action === "google.connect")!.result).toBe(`partial:${GOOGLE_SCOPES.gmailSend}`);
    expect((await db.listConnections(user.id))[0]!.scopes).not.toContain(GOOGLE_SCOPES.gmailSend);
  });

  it("Gmail read (restricted) is refused while the flag is off and requested incrementally when on", async () => {
    const user = await db.createUser("dana@example.com");
    const off = await startFromChat(user.id, "&feature=gmail_read");
    expect(off.status).toBe(403);
    expect(await off.text()).toBe("קריאת Gmail אינה זמינה כרגע. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");

    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    const on = location(await startFromChat(user.id, "&feature=gmail_read"));
    expect(on.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.gmailReadonly}`);
    expect(on.searchParams.get("include_granted_scopes")).toBe("true");
    expect(on.searchParams.get("login_hint")).toBe("dana.levi@gmail.com");
    fixture().grantedScope += ` ${GOOGLE_SCOPES.gmailReadonly}`;
    await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${on.searchParams.get("state")}&code=abc`));
    expect((await db.listConnections(user.id))[0]!.scopes).toContain(GOOGLE_SCOPES.gmailReadonly);
    expect(db.audit.filter((a) => a.action === "google.connect").at(-1)).toMatchObject({ result: "ok:gmail_read" });
    // the grant is in the user-cap ledger (hashed account, never the address)
    expect(db.googleScopeGrants.map((g) => g.scope)).toContain(GOOGLE_SCOPES.gmailReadonly);
    expect(db.googleScopeGrants.every((g) => g.account_hash === googleAccountHash("dana.levi@gmail.com") && g.user_id === user.id)).toBe(true);
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "maybe");
    expect((await startFromChat(user.id, "&feature=gmail_read")).status).toBe(503);
  });

  it("web onboarding under the cap asks for gmail.readonly and drive.readonly too (default on with GOOGLE_CLIENT_ID); unticking them is a choice, not a partial failure", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    // the trial (and basic) never asks for drive.readonly: the full Drive read is pro
    jar.session = createSessionToken(user.id);
    const trial = location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`)));
    expect(trial.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly]);
    await asPro(user.id);
    const consent = location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`)));
    expect(consent.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.driveReadonly]);
    const pending = ((await db.getUser(user.id))!.profile.oauth_pending as { google: { scopes: string[]; gmail_read: string; drive_read: string } }).google;
    expect(pending.scopes).toContain(GOOGLE_SCOPES.gmailReadonly);
    expect(pending).toMatchObject({ gmail_read: "under_cap", drive_read: "under_cap" });

    // granular consent: the user leaves gmail.readonly and drive.readonly unticked (the fixture grants the base set only)
    const ok = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`)));
    expect(ok.pathname).toBe("/start/ready");
    expect(ok.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    expect(wa.texts).toHaveLength(1); // connect_done only — no "partial" message with a link
    expect(wa.texts[0]).toContain("את תיבת ה-Gmail אני לא קוראת, כי ההרשאה לכך לא סומנה. אפשר לבקש ממני בהמשך לקרוא מיילים, ואשלח קישור לאישור.");
    expect(db.audit.find((a) => a.action === "google.connect")).toMatchObject({ result: "ok:gmail_read_declined,drive_read_declined" });
    // calendar.events / gmail.send / tasks are not verified yet → Google counts this account already
    expect(db.googleScopeGrants.map((g) => g.scope).sort()).toEqual([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.tasks].sort());
  });

  it("at the cap: a new account connects without gmail.readonly, an explicit request gets one Hebrew line, an account Google already counted still can", async () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    for (let i = 0; i < 95; i++) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(`user${i}@gmail.com`), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
    const newcomer = await db.createUser("new@example.com");
    const base = location(await startFromChat(newcomer.id));
    expect(base.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES]);
    const refused = await startFromChat(newcomer.id, "&feature=gmail_read");
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("קריאת Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");

    const veteran = await db.createUser("veteran@example.com");
    const conn = db.seedConnection(veteran.id, "google", "user7@gmail.com");
    conn.status = "revoked"; // disconnected once — Google still counts the account, so asking again costs no slot
    const again = location(await startFromChat(veteran.id, "&feature=gmail_read"));
    expect(again.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.gmailReadonly}`);
    // the consent screen opens on the account the exemption was decided for (also when its connection is revoked)
    expect(again.searchParams.get("login_hint")).toBe("user7@gmail.com");
    expect(((await db.getUser(veteran.id))!.profile.oauth_pending as { google: Record<string, unknown> }).google.gmail_read).toBe("already_counted");
  });

  it("at the cap, the user picks a different, never-counted account on Google's screen → gmail.readonly is not kept; the user is told in one line", async () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    for (let i = 0; i < 95; i++) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(`user${i}@gmail.com`), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
    const veteran = await db.createUser("veteran@example.com");
    db.seedWaIdentity(veteran.id, "+972501234567");
    db.seedConnection(veteran.id, "google", "user7@gmail.com").status = "revoked";
    const consent = location(await startFromChat(veteran.id, "&feature=gmail_read"));
    // …but signs in as dana.levi@gmail.com (the fixture's account), which Google never counted
    fixture().grantedScope = `${FIXTURE_GOOGLE_SCOPE} ${GOOGLE_SCOPES.gmailReadonly}`;
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`)));
    expect(cb.searchParams.get("error")).toBe("קריאת Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");
    const conn = (await db.listConnections(veteran.id)).find((c) => c.account_email === "dana.levi@gmail.com")!;
    expect(conn.scopes).not.toContain(GOOGLE_SCOPES.gmailReadonly);
    expect(conn.scopes).toContain(GOOGLE_SCOPES.calendarEvents);
    expect(wa.texts.at(-1)).toBe("קריאת מיילים ב-Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");
    expect(db.audit.find((a) => a.action === "google.gmail_read_not_kept")).toMatchObject({ target: "dana.levi@gmail.com", result: "cap_reached" });
    expect(db.audit.find((a) => a.action === "google.connect")).toMatchObject({ result: "ok:gmail_read_refused:cap_reached" });
    // Google did count the consent: the ledger says so (96), so the next new account is refused as well
    expect(await countCapUsers(db)).toBe(96);
  });

  it("incremental consent with gmail.readonly unticked → partial message whose link asks for Gmail read again", async () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    const on = location(await startFromChat(user.id, "&feature=gmail_read"));
    // Google returns the previously granted scopes only (include_granted_scopes) — the new box was left empty
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${on.searchParams.get("state")}&code=abc`)));
    expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com), אבל לא ניתנה הרשאה לקרוא מיילים ב-Gmail. אפשר לחבר שוב ולסמן את כל האפשרויות.");
    expect(wa.texts.at(-1)).toContain("לא אוכל לקרוא מיילים ב-Gmail");
    expect(wa.texts.at(-1)).toMatch(/\/api\/auth\/google\/start\?t=[^&\s]+&feature=gmail_read/);
    expect(db.audit.find((a) => a.action === "google.connect")!.result).toBe(`partial:${GOOGLE_SCOPES.gmailReadonly}`);
  });

  describe("gmail.readonly that Google returns without being asked for (scope= edited on the way to Google)", () => {
    const WITH_READ = `${FIXTURE_GOOGLE_SCOPE} ${GOOGLE_SCOPES.gmailReadonly}`;
    const toolNames = (scopes: string[]) => googleTools({ google: async () => { throw new Error("unused"); }, timeZone: "Asia/Jerusalem", scopes, accountEmail: "dana.levi@gmail.com", gmailReadEnabled: true }).map((t) => t.name);

    it("feature off: not requested, not kept — no gmail_* read tools; the ledger still records what Google counted", async () => {
      vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "false");
      const user = await db.createUser("dana@example.com");
      db.seedWaIdentity(user.id, "+972501234567");
      const consent = location(await startFromChat(user.id));
      expect(consent.searchParams.get("scope")).not.toContain("gmail.readonly");
      fixture().grantedScope = WITH_READ;
      const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`)));
      expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
      const [conn] = await db.listConnections(user.id);
      expect(conn!.scopes).not.toContain(GOOGLE_SCOPES.gmailReadonly);
      expect(toolNames(conn!.scopes)).not.toContain("gmail_search_emails");
      expect(toolNames(conn!.scopes)).toContain("gmail_read_status");
      expect(db.audit.find((a) => a.action === "google.gmail_read_not_kept")).toMatchObject({ result: "disabled" });
      expect(wa.texts).toHaveLength(1);
      expect(wa.texts[0]).toContain("את תיבת ה-Gmail עצמה אני לא קוראת בשלב זה.");
      expect(wa.texts[0]).not.toContain("קריאה, חיפוש וסיכום של מיילים");
      expect(db.googleScopeGrants.map((g) => g.scope)).toContain(GOOGLE_SCOPES.gmailReadonly);
    });

    it("cap full (cap 2, 2 counted): not requested, not kept; the ledger shows 3 — Google counted the consent", async () => {
      vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
      vi.stubEnv("GOOGLE_GMAIL_READ_CAP", "2");
      for (const e of ["a@gmail.com", "b@gmail.com"]) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(e), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
      const user = await db.createUser("dana@example.com");
      const consent = location(await startFromChat(user.id));
      expect(consent.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES]);
      fixture().grantedScope = WITH_READ;
      await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`));
      const [conn] = await db.listConnections(user.id);
      expect(conn!.scopes).not.toContain(GOOGLE_SCOPES.gmailReadonly);
      expect(toolNames(conn!.scopes)).not.toContain("gmail_search_emails");
      expect(db.audit.find((a) => a.action === "google.gmail_read_not_kept")).toMatchObject({ result: "not_requested" });
      expect(await countCapUsers(db)).toBe(3);
    });

    it("an account Google already counted keeps an earlier grant that comes back with include_granted_scopes (no new slot)", async () => {
      vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
      vi.stubEnv("GOOGLE_GMAIL_READ_CAP", "2");
      for (const e of ["a@gmail.com", "dana.levi@gmail.com"]) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(e), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
      const user = await db.createUser("dana@example.com");
      db.seedConnection(user.id, "google", "dana.levi@gmail.com").status = "expired";
      const consent = location(await startFromChat(user.id));
      expect(consent.searchParams.get("scope")).toContain(GOOGLE_SCOPES.gmailReadonly); // already counted → asked
      expect(consent.searchParams.get("login_hint")).toBe("dana.levi@gmail.com");
      fixture().grantedScope = WITH_READ;
      await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`));
      expect((await db.listConnections(user.id))[0]!.scopes).toContain(GOOGLE_SCOPES.gmailReadonly);
      expect(db.audit.some((a) => a.action === "google.gmail_read_not_kept")).toBe(false);
      expect(await countCapUsers(db)).toBe(2);
    });
  });

  it("deploy order: without the ledger (migration 0008 missing) a plain connect goes on without gmail.readonly; an explicit Gmail request is refused in Hebrew", async () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    class NoLedgerDb extends MemoryDb {
      override async countGoogleScopeAccounts(): Promise<number> {
        throw new Error('relation "public.google_scope_grants" does not exist');
      }
      override async hasGoogleScopeGrant(): Promise<boolean> {
        throw new Error('relation "public.google_scope_grants" does not exist');
      }
      override async recordGoogleScopeGrant(): Promise<boolean> {
        throw new Error('relation "public.google_scope_grants" does not exist');
      }
    }
    const broken = new NoLedgerDb();
    setDbForTests(broken);
    const user = await broken.createUser("dana@example.com");
    broken.seedWaIdentity(user.id, "+972501234567");
    const base = await startFromChat(user.id);
    expect(base.status).toBe(303);
    expect(location(base).searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES]);
    const feature = await startFromChat(user.id, "&feature=gmail_read");
    expect(feature.status).toBe(403);
    expect(await feature.text()).toBe("קריאת Gmail אינה זמינה כרגע. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");
    // the connect itself completes (the ledger write is best effort)
    const s2 = location(await startFromChat(user.id)).searchParams.get("state")!;
    const cb = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${s2}&code=abc`)));
    expect(cb.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    expect((await broken.listConnections(user.id))[0]!.status).toBe("active");
  });

  it("the grant is in the ledger even when a later step of the callback fails (Google counted the consent already)", async () => {
    class FailingUpsertDb extends MemoryDb {
      override async upsertConnection(): Promise<never> {
        throw new Error("db write failed");
      }
    }
    const failing = new FailingUpsertDb();
    setDbForTests(failing);
    const user = await failing.createUser("dana@example.com");
    const state = location(await startFromChat(user.id)).searchParams.get("state")!;
    await expect(callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=abc`))).rejects.toThrow("db write failed");
    expect(failing.googleScopeGrants.map((g) => g.scope).sort()).toEqual([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.tasks].sort());
  });

  it("real Google project: the partial-consent message carries the 'unverified app' heads-up", async () => {
    vi.stubEnv("DATA_MODE", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "real-secret");
    const fx = createGoogleFixture();
    vi.stubGlobal("fetch", fx.fetchImpl);
    try {
      const user = await db.createUser("dana@example.com");
      db.seedWaIdentity(user.id, "+972501234567");
      const consent = location(await startFromChat(user.id));
      expect(consent.searchParams.get("client_id")).toBe("real-client.apps.googleusercontent.com");
      fx.state.grantedScope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/tasks";
      await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`));
      const partial = wa.texts.at(-1)!;
      expect(partial).toContain("לא אוכל לשלוח מיילים מ-Gmail");
      expect(partial.split("\n").at(-1)).toBe("גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a stale state and reports token-exchange failures", async () => {
    const user = await db.createUser("dana@example.com");
    const state = location(await startFromChat(user.id)).searchParams.get("state")!;
    const profile = (await db.getUser(user.id))!.profile.oauth_pending as { google: Record<string, unknown> };
    await db.mergeUserProfile(user.id, { oauth_pending: { google: { ...profile.google, started_at: new Date(Date.now() - 31 * 60_000).toISOString() } } });
    expect(location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=abc`))).searchParams.get("error")).toContain("לא זוהתה");
    expect(await db.listConnections(user.id)).toEqual([]);
    // the user did approve at Google: logged and audited so the ledger can be reconciled with the Console's count
    expect(db.audit.at(-1)).toMatchObject({ action: "google.connect", result: "error:state_expired" });

    const s2 = location(await startFromChat(user.id)).searchParams.get("state")!;
    const bad = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${s2}&code=bad-code`)));
    expect(bad.searchParams.get("error")).toBe("החיבור ל-Google לא הושלם (invalid_grant). אפשר לנסות שוב.");
    expect(db.audit.at(-1)).toMatchObject({ action: "google.connect", result: "token:invalid_grant" });
  });

  it("fails fast in Hebrew when GOOGLE_* env vars are missing (not memory mode)", async () => {
    vi.stubEnv("DATA_MODE", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const user = await db.createUser("dana@example.com");
    const r = await startFromChat(user.id);
    expect(r.status).toBe(503);
    const body = await r.text();
    expect(body).toContain("משתני סביבה חסרים");
    expect(body).toContain("GOOGLE_CLIENT_ID");
    expect(body).toContain("GOOGLE_CLIENT_SECRET");
  });
  describe("the plan's gate (lib/billing/plans.ts entitlements, lib/connections/plan-gate.ts)", () => {
    it("trial / basic: Google next to an active Microsoft 365 → the pay page with why=second_account, nothing stored; reconnecting Google itself stays open", async () => {
      const user = await db.createUser("dana@example.com");
      db.seedConnection(user.id, "microsoft", "dana@contoso.co.il");
      for (const plan of ["trial", "basic"] as const) {
        if (plan === "basic") await asBasic(user.id);
        const refused = await startFromChat(user.id);
        expect(refused.status).toBe(303);
        const to = location(refused);
        expect(to.origin).toBe(APP);
        expect(to.pathname).toMatch(/^\/pay\/[^/]+$/);
        expect(to.searchParams.get("why")).toBe("second_account");
      }
      expect(((await db.getUser(user.id))!.profile.oauth_pending as Record<string, unknown> | undefined)?.google).toBeUndefined();

      // the account in force may reconnect (one Google connection, nothing else active)
      const solo = await db.createUser("solo@example.com");
      db.seedConnection(solo.id, "google", "solo@gmail.com");
      await asBasic(solo.id);
      expect(location(await startFromChat(solo.id)).origin).toBe("https://accounts.google.com");
    });

    it("pro: both accounts together", async () => {
      const user = await db.createUser("dana@example.com");
      db.seedConnection(user.id, "microsoft", "dana@contoso.co.il");
      await asPro(user.id);
      expect(location(await startFromChat(user.id)).origin).toBe("https://accounts.google.com");
    });

    it("basic: the pro consents (drive_read, tasks) → the pay page with why=pro_feature; a plain connect asks for no drive.readonly", async () => {
      vi.stubEnv("GOOGLE_DRIVE_READ_ENABLED", "true");
      const user = await db.createUser("dana@example.com");
      db.seedConnection(user.id, "google", "dana.levi@gmail.com");
      await asBasic(user.id);
      for (const feature of ["drive_read", "tasks"]) {
        const to = location(await startFromChat(user.id, `&feature=${feature}`));
        expect(to.pathname, feature).toMatch(/^\/pay\//);
        expect(to.searchParams.get("why"), feature).toBe("pro_feature");
      }
      expect(location(await startFromChat(user.id)).searchParams.get("scope")).not.toContain("drive.readonly");
      // Gmail read is basic too (mail is in every plan): still the incremental consent
      vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
      expect(location(await startFromChat(user.id, "&feature=gmail_read")).searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.gmailReadonly}`);
    });
  });
});
