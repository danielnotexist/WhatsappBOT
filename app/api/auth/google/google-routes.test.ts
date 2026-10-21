import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import { decryptToken } from "@/lib/crypto";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES } from "@/lib/google/oauth";
import { googleAccountHash } from "@/lib/google/user-cap";
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
    fixture().grantedScope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file";
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

  it("web onboarding under the cap asks for gmail.readonly too (default on with GOOGLE_CLIENT_ID); unticking it is a choice, not a partial failure", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    jar.session = createSessionToken(user.id);
    const consent = location(await startGet(new Request(`${APP}/api/auth/google/start?returnTo=onboarding`)));
    expect(consent.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly]);
    const pending = ((await db.getUser(user.id))!.profile.oauth_pending as { google: { scopes: string[] } }).google;
    expect(pending.scopes).toContain(GOOGLE_SCOPES.gmailReadonly);

    // granular consent: the user leaves gmail.readonly unticked (the fixture grants the base set only)
    const ok = location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${consent.searchParams.get("state")}&code=abc`)));
    expect(ok.pathname).toBe("/start/ready");
    expect(ok.searchParams.get("notice")).toBe("החיבור ל-Google הושלם (dana.levi@gmail.com).");
    expect(wa.texts).toHaveLength(1); // connect_done only — no "partial" message with a link
    expect(wa.texts[0]).toContain("את תיבת ה-Gmail אני לא קוראת, כי ההרשאה לכך לא סומנה. אפשר לבקש ממני בהמשך לקרוא מיילים, ואשלח קישור לאישור.");
    expect(db.audit.find((a) => a.action === "google.connect")).toMatchObject({ result: "ok:gmail_read_declined" });
    // calendar.events / gmail.send are not verified yet → Google counts this account already
    expect(db.googleScopeGrants.map((g) => g.scope).sort()).toEqual([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend].sort());
  });

  it("at the cap: a new account connects without gmail.readonly, an explicit request gets one Hebrew line, an account Google already counted still can", async () => {
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    for (let i = 0; i < 95; i++) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(`user${i}@gmail.com`), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
    const newcomer = await db.createUser("new@example.com");
    const base = location(await startFromChat(newcomer.id));
    expect(base.searchParams.get("scope")!.split(" ")).toEqual([...GOOGLE_BASE_SCOPES]);
    const refused = await startFromChat(newcomer.id, "&feature=gmail_read");
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("קריאת Gmail פתוחה כרגע רק למשתמשים הראשונים, והמקומות התמלאו. היא תיפתח שוב אחרי בדיקת האבטחה של Google; היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד.");

    const veteran = await db.createUser("veteran@example.com");
    const conn = db.seedConnection(veteran.id, "google", "user7@gmail.com");
    conn.status = "revoked"; // disconnected once — Google still counts the account, so asking again costs no slot
    const again = location(await startFromChat(veteran.id, "&feature=gmail_read"));
    expect(again.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.gmailReadonly}`);
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

  it("refuses a stale state and reports token-exchange failures", async () => {
    const user = await db.createUser("dana@example.com");
    const state = location(await startFromChat(user.id)).searchParams.get("state")!;
    const profile = (await db.getUser(user.id))!.profile.oauth_pending as { google: Record<string, unknown> };
    await db.mergeUserProfile(user.id, { oauth_pending: { google: { ...profile.google, started_at: new Date(Date.now() - 31 * 60_000).toISOString() } } });
    expect(location(await callbackGet(new Request(`${APP}/api/auth/google/callback?state=${state}&code=abc`))).searchParams.get("error")).toContain("לא זוהתה");
    expect(await db.listConnections(user.id)).toEqual([]);

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
});
