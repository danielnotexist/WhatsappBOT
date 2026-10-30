import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE_COOKIE, encodeSource } from "@/lib/admin/source";
import { flushServerEvents } from "@/lib/analytics/track";
import { MSA_TENANT_ID, SSO_COOKIE, openSsoPending, sealSsoPending } from "@/lib/auth/sso";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { decryptToken } from "@/lib/crypto";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { setMailerForTests } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { MS_FIXTURE_CLAIMS } from "@/lib/ms";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { GET as googleCallback } from "./google/callback/route";
import { GET as googleStart } from "./google/start/route";
import { GET as msCallback } from "./microsoft/callback/route";
import { GET as msStart } from "./microsoft/start/route";

// the start routes read the session through next/headers; the SSO cookie travels in the request itself
const jar = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "wb_session" && jar.session ? { name, value: jar.session } : undefined) }) }));

const APP = "https://app.example.co.il";
const google = () => globalSingleton("google-fixture", () => createGoogleFixture()).state;
const location = (r: Response) => new URL(r.headers.get("location")!);
const setCookies = (r: Response) => r.headers.getSetCookie();
const cookieValue = (r: Response, name: string) => {
  const line = setCookies(r).find((c) => c.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).split(";")[0]! : undefined;
};
const sessionOf = (r: Response) => verifySessionToken(cookieValue(r, "wb_session"));

/** A provider sign-in up to the consent screen: the authorize URL and the browser's cookie header for the callback. */
async function startSignIn(provider: "google" | "microsoft", from: "start" | "login", extraCookie = "") {
  const start = provider === "google" ? googleStart : msStart;
  const res = await start(new Request(`${APP}/api/auth/${provider}/start?intent=signin&from=${from}`));
  expect(res.status).toBe(303);
  const authorize = location(res);
  const sso = cookieValue(res, SSO_COOKIE)!;
  expect(sso).toBeTruthy();
  return { res, authorize, state: authorize.searchParams.get("state")!, cookie: [`${SSO_COOKIE}=${sso}`, extraCookie].filter(Boolean).join("; "), sso };
}

function callback(provider: "google" | "microsoft", query: string, cookie?: string) {
  const handler = provider === "google" ? googleCallback : msCallback;
  return handler(new Request(`${APP}/api/auth/${provider}/callback?${query}`, { headers: cookie ? { cookie } : {} }));
}

describe("Sign in with Microsoft / Google (memory mode)", () => {
  let db: MemoryDb;
  let wa: RecordingWaSender;
  let mailer: ConsoleMailer;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", APP);
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    db = new MemoryDb();
    wa = new RecordingWaSender();
    mailer = new ConsoleMailer();
    setDbForTests(db);
    setWaSenderForTests(wa);
    setMailerForTests(mailer);
    setGlobalSingleton("google-fixture", undefined);
    setGlobalSingleton("graph-fixture", undefined);
    setGlobalSingleton("ms-fixture-claims", undefined);
    setGlobalSingleton("rate-limiter", undefined);
    jar.session = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
    setMailerForTests(undefined);
  });

  it("Google, a new person from /start: consent with PKCE in a sealed cookie → a new account, the session, Gmail connected, on to the WhatsApp step", async () => {
    const source = encodeSource({ utm_source: "newsletter", landing: "/", at: "2026-10-28T09:00:00.000Z" });
    const { authorize, state, cookie, sso, res } = await startSignIn("google", "start", `${SOURCE_COOKIE}=${source}`);
    expect(authorize.origin + authorize.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("prompt")).toBe("consent select_account");
    expect(authorize.searchParams.get("login_hint")).toBeNull();
    expect(setCookies(res).find((c) => c.startsWith(SSO_COOKIE))).toMatch(/Path=\/api\/auth; Max-Age=900; HttpOnly; SameSite=Lax/);
    expect(db.users.size).toBe(0); // nothing is stored before the provider answers

    const cb = await callback("google", `state=${state}&code=4%2F0Asso&scope=openid`, cookie);
    expect(cb.status).toBe(303);
    const dest = location(cb);
    expect(dest.pathname).toBe("/start/ready"); // the mail step is done: straight to WhatsApp
    expect(dest.searchParams.get("connected")).toBe("google");
    const user = (await db.findUserByEmail("dana.levi@gmail.com"))!;
    expect(sessionOf(cb)?.userId).toBe(user.id);
    expect(setCookies(cb).find((c) => c.startsWith(`${SSO_COOKIE}=`))).toMatch(/Max-Age=0/); // single use
    expect(setCookies(cb).some((c) => c.startsWith("wb_admin"))).toBe(false); // the panel keeps its own code

    // the connection, exactly as the connect flow stores it
    const [conn] = await db.listConnections(user.id);
    expect(conn).toMatchObject({ provider: "google", account_email: "dana.levi@gmail.com", status: "active" });
    const secret = (await db.getConnectionSecret(conn!.id))!;
    expect(decryptToken(secret.enc_refresh!, { aad: `${user.id}:google` })).toMatch(/^1\/\/fixture-refresh-/);
    // PKCE: the code was exchanged with the verifier sealed in this browser's cookie
    const verifier = openSsoPending(sso, "google")!.verifier;
    expect(google().calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!.body).toMatchObject({ code: "4/0Asso", code_verifier: verifier });

    // the same sign-in bookkeeping as the email code, plus who signed in
    expect(db.audit.find((a) => a.action === "signup")).toMatchObject({ user_id: user.id, target: "dana.levi@gmail.com", result: "ok", reason: "google" });
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ user_id: user.id, target: "google:109876543210", result: "ok:signup", reason: "email_verified" });
    expect((await db.getUser(user.id))!.signup_source).toMatchObject({ utm_source: "newsletter" });
    expect((await db.getUser(user.id))!.last_seen_at).toBeTruthy();
    await flushServerEvents();
    expect(db.pageEvents.filter((e) => e.user_id === user.id).map((e) => e.event).sort()).toEqual(["code_ok", "mail_connected"]);
  });

  it("Google, an existing account (verified email): signed in to it, the connection refreshed, on to /account", async () => {
    const existing = await db.createUser("dana.levi@gmail.com");
    const { state, cookie } = await startSignIn("google", "login");
    const cb = await callback("google", `state=${state}&code=abc`, cookie);
    expect(cb.headers.get("location")).toBe(`${APP}/account`);
    expect(sessionOf(cb)?.userId).toBe(existing.id);
    expect(db.audit.filter((a) => a.action === "signup")).toHaveLength(0);
    expect(db.audit.find((a) => a.action === "login")).toMatchObject({ user_id: existing.id, reason: "google" });
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ result: "ok:login" });
    expect((await db.listConnections(existing.id)).map((c) => c.provider)).toEqual(["google"]);
    await flushServerEvents();
    expect(db.pageEvents.filter((e) => e.event === "code_ok")).toHaveLength(0); // started on /login: not a signup step
  });

  it("Google with email_verified=false: refused, no account and no session — even for an address nobody has", async () => {
    await db.createUser("dana.levi@gmail.com");
    google().idClaims = { email_verified: false };
    const { state, cookie } = await startSignIn("google", "login");
    const cb = await callback("google", `state=${state}&code=abc`, cookie);
    expect(cb.headers.get("location")).toBe(`${APP}/login?sso_error=unverified`);
    expect(cookieValue(cb, "wb_session")).toBeUndefined();
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ user_id: null, result: "refused:unverified" });
    expect(db.audit.some((a) => a.action === "login")).toBe(false);

    google().idClaims = { email: "new.person@example.com", email_verified: false };
    const second = await startSignIn("google", "start");
    const cb2 = await callback("google", `state=${second.state}&code=abc`, second.cookie);
    expect(location(cb2).searchParams.get("sso_error")).toBe("unverified");
    expect(await db.findUserByEmail("new.person@example.com")).toBeNull();
  });

  it("state / PKCE: a state that is not this browser's, a changed cookie, no cookie, or a code the verifier does not fit — refused, no session", async () => {
    await db.createUser("dana.levi@gmail.com");
    const { state, cookie } = await startSignIn("google", "login");
    // another state with this browser's cookie (a code from someone else's consent)
    const wrong = await callback("google", `state=${"x".repeat(state.length)}&code=abc`, cookie);
    expect(wrong.headers.get("location")).toBe(`${APP}/login?sso_error=state`);
    expect(cookieValue(wrong, "wb_session")).toBeUndefined();
    // a cookie that was changed: it does not open
    const tampered = await callback("google", `state=${state}&code=abc`, cookie.slice(0, -3) + "AAA");
    expect(location(tampered).searchParams.get("sso_error")).toBe("state");
    expect(cookieValue(tampered, "wb_session")).toBeUndefined();
    // the right state from a browser without the cookie: not a sign-in, and no one's connect either
    const noCookie = await callback("google", `state=${state}&code=abc`);
    expect(location(noCookie).pathname).toBe("/account");
    expect(location(noCookie).searchParams.get("error")).toBeTruthy();
    expect(cookieValue(noCookie, "wb_session")).toBeUndefined();
    // the provider refuses the code (a verifier that does not match the challenge answers invalid_grant)
    const pkce = await callback("google", `state=${state}&code=bad-code`, cookie);
    expect(pkce.headers.get("location")).toBe(`${APP}/login?sso_error=failed`);
    expect(cookieValue(pkce, "wb_session")).toBeUndefined();
    // a cookie sealed for Google never finishes a Microsoft sign-in
    const cross = await callback("microsoft", `state=${state}&code=abc`, cookie);
    expect(location(cross).searchParams.get("sso_error")).toBe("state");
    expect(db.audit.some((a) => a.action === "login" || a.action === "signup")).toBe(false);
  });

  it("the consent screen declined: back to the page it started from, with the reason", async () => {
    const { state, cookie } = await startSignIn("microsoft", "start");
    const cb = await callback("microsoft", `state=${state}&error=access_denied`, cookie);
    expect(cb.headers.get("location")).toBe(`${APP}/start?sso_error=denied`);
    const again = await startSignIn("microsoft", "start");
    const admin = await callback("microsoft", `state=${again.state}&error=consent_required&error_description=AADSTS65001`, again.cookie);
    expect(location(admin).searchParams.get("sso_error")).toBe("admin_required");
  });

  it("Microsoft, an existing account and an email Microsoft does not vouch for: no sign-in — the email code instead", async () => {
    const existing = await db.createUser("dana@levi-law.co.il");
    setGlobalSingleton("ms-fixture-claims", { tid: "org-tenant", oid: "attacker-oid", preferred_username: "dana@levi-law.co.il", email: "dana@levi-law.co.il", name: "?" });
    const { state, cookie, authorize } = await startSignIn("microsoft", "login");
    expect(authorize.hostname).toBe("login.microsoftonline.com");
    expect(authorize.searchParams.get("login_hint")).toBeNull();
    const cb = await callback("microsoft", `state=${state}&code=abc`, cookie);
    const dest = location(cb);
    expect(dest.pathname).toBe("/login/code");
    expect(dest.searchParams.get("email")).toBe("dana@levi-law.co.il");
    expect(dest.searchParams.get("sso")).toBe("microsoft");
    expect(Number(dest.searchParams.get("wait"))).toBe(60);
    expect(cookieValue(cb, "wb_session")).toBeUndefined();
    expect(await db.listConnections(existing.id)).toEqual([]); // nothing from the provider is kept
    expect(mailer.sent.map((m) => m.to)).toEqual(["dana@levi-law.co.il"]); // the code went to the account's own address
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ user_id: existing.id, target: "microsoft:org-tenant:attacker-oid", result: "verify_by_code", reason: "unverified" });
    expect(db.audit.some((a) => a.action === "login")).toBe(false);
  });

  it("Microsoft without xms_edov never creates an account (SSO pre-hijack): the email code for the new address instead", async () => {
    setGlobalSingleton("ms-fixture-claims", { tid: "org-tenant", oid: "o9", preferred_username: "avi@levi-law.co.il", name: "אבי" });
    const { state, cookie } = await startSignIn("microsoft", "start");
    const cb = await callback("microsoft", `state=${state}&code=abc`, cookie);
    const dest = location(cb);
    expect(dest.pathname).toBe("/login/code");
    expect(dest.searchParams.get("email")).toBe("avi@levi-law.co.il");
    expect(dest.searchParams.get("sso")).toBe("microsoft");
    expect(cookieValue(cb, "wb_session")).toBeUndefined();
    expect(await db.findUserByEmail("avi@levi-law.co.il")).toBeNull(); // no account until the address is proven
    expect(mailer.sent.map((m) => m.to)).toEqual(["avi@levi-law.co.il"]);
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ user_id: null, result: "verify_by_code:new", reason: "unverified" });
  });

  it("Microsoft, a trusted email (xms_edov or a personal account) opens the existing account → /account", async () => {
    const dana = await db.createUser("dana@levi-law.co.il");
    db.seedWaIdentity(dana.id, "+972501234567");
    const first = await startSignIn("microsoft", "login");
    const cb = await callback("microsoft", `state=${first.state}&code=abc`, first.cookie);
    expect(cb.headers.get("location")).toBe(`${APP}/account`);
    expect(sessionOf(cb)?.userId).toBe(dana.id);
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ target: "microsoft:memory-tenant:u1", result: "ok:login", reason: "xms_edov" });
    const [conn] = await db.listConnections(dana.id);
    expect(conn).toMatchObject({ provider: "microsoft", account_email: "dana@levi-law.co.il", status: "active" });
    expect((await db.getConnectionSecret(conn!.id))!.enc_access!.startsWith("v1.")).toBe(true);
    expect(wa.texts.at(-1)).toContain("החיבור ל-Microsoft 365 הושלם"); // a new connection: told in WhatsApp
    const told = wa.texts.length;
    // signing in again only refreshes the same account: no WhatsApp message on every sign-in
    const again = await startSignIn("microsoft", "login");
    await callback("microsoft", `state=${again.state}&code=abc`, again.cookie);
    expect(wa.texts.length).toBe(told);

    const avi = await db.createUser("avi@outlook.com");
    setGlobalSingleton("ms-fixture-claims", { tid: MSA_TENANT_ID, oid: "msa-1", preferred_username: "avi@outlook.com", email: "avi@outlook.com" });
    const msa = await startSignIn("microsoft", "login");
    const cb2 = await callback("microsoft", `state=${msa.state}&code=abc`, msa.cookie);
    expect(sessionOf(cb2)?.userId).toBe(avi.id);
    expect(db.audit.filter((a) => a.action === "auth.sso").at(-1)).toMatchObject({ result: "ok:login", reason: "msa" });
  });

  it("a one-account plan already on Google: Microsoft signs in, but its connection is not kept", async () => {
    const dana = await db.createUser("dana@levi-law.co.il");
    await db.upsertSubscription(dana.id, { plan: "basic", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    db.seedConnection(dana.id, "google", "dana.levi@gmail.com");
    const { state, cookie } = await startSignIn("microsoft", "login");
    const cb = await callback("microsoft", `state=${state}&code=abc`, cookie);
    expect(sessionOf(cb)?.userId).toBe(dana.id);
    expect(location(cb).pathname).toBe("/account");
    expect(location(cb).searchParams.get("error")).toContain("במסלול הזה עובדים עם חשבון אחד");
    expect((await db.listConnections(dana.id)).map((c) => c.provider)).toEqual(["google"]);
    expect(db.audit.find((a) => a.action === "auth.sso")).toMatchObject({ result: "ok:login:not_connected" });
  });

  it("with a session the routes connect, exactly as before (the state on the profile, no sign-in cookie)", async () => {
    const dana = await db.createUser("dana@example.com");
    jar.session = createSessionToken(dana.id);
    const res = await googleStart(new Request(`${APP}/api/auth/google/start?intent=signin&from=start&returnTo=onboarding`));
    expect(cookieValue(res, SSO_COOKIE)).toBeUndefined();
    const state = location(res).searchParams.get("state")!;
    expect(((await db.getUser(dana.id))!.profile.oauth_pending as { google: { state: string; returnTo: string } }).google).toMatchObject({ state, returnTo: "onboarding" });
    expect(cookieValue(res, "wb_connect_google")).toBeTruthy(); // the connect is bound to this browser
    const cb = await callback("google", `state=${state}&code=abc`, `wb_connect_google=${cookieValue(res, "wb_connect_google")}`);
    expect(location(cb).pathname).toBe("/start/ready");
    expect(cookieValue(cb, "wb_session")).toBeUndefined(); // the session was already there; the connect flow sets none
    expect(await db.listConnections(dana.id)).toMatchObject([{ provider: "google", account_email: "dana.levi@gmail.com" }]);
    expect(db.audit.some((a) => a.action === "auth.sso")).toBe(false);
  });

  it("a session whose account is gone counts as none: the provider button signs in", async () => {
    jar.session = createSessionToken("00000000-0000-4000-8000-00000000dead");
    const res = await googleStart(new Request(`${APP}/api/auth/google/start?intent=signin&from=login`));
    expect(location(res).hostname).toBe("accounts.google.com");
    expect(cookieValue(res, SSO_COOKIE)).toBeTruthy();
  });

  it("without a session and without intent=signin: still back to /start (nothing changes for old links)", async () => {
    const res = await msStart(new Request(`${APP}/api/auth/microsoft/start`));
    expect(res.headers.get("location")).toBe(`${APP}/start`);
    expect(cookieValue(res, SSO_COOKIE)).toBeUndefined();
  });

  it("a cookie whose pending sign-in expired is refused", async () => {
    const stale = sealSsoPending({ v: 1, provider: "google", state: "s1", verifier: "v", from: "login", started_at: new Date(Date.now() - 16 * 60_000).toISOString() });
    const cb = await callback("google", "state=s1&code=abc", `${SSO_COOKIE}=${stale}`);
    expect(cb.headers.get("location")).toBe(`${APP}/start?sso_error=state`);
    expect(cookieValue(cb, "wb_session")).toBeUndefined();
  });
});

describe("Sign in with Microsoft / Google in the demo without the providers (fixtures)", () => {
  let db: MemoryDb;
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("APP_URL", APP);
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    db = new MemoryDb();
    setDbForTests(db);
    setWaSenderForTests(new RecordingWaSender());
    setGlobalSingleton("google-fixture", undefined);
    setGlobalSingleton("ms-fixture-claims", undefined);
    jar.session = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
  });

  it("Google from /start: the fixture account through the same rules — signed up, the demo connection, the WhatsApp step", async () => {
    const res = await googleStart(new Request(`${APP}/api/auth/google/start?intent=signin&from=start`));
    expect(location(res).pathname).toBe("/start/ready");
    expect(location(res).searchParams.get("connected")).toBe("google");
    const user = (await db.findUserByEmail("dana.levi@gmail.com"))!;
    const session = sessionOf(res)!;
    expect(session.userId).toBe(user.id);
    expect(session.email).toBe("dana.levi@gmail.com"); // the demo on memory: the email rides in the session
    expect(db.audit.find((a) => a.action === "google.connect")).toMatchObject({ result: "ok:demo" });
    expect(cookieValue(res, SSO_COOKIE)).not.toMatch(/^v1\./); // never left the site: only the clearing header
  });

  it("Microsoft from /login: an existing fixture account → /account", async () => {
    const dana = await db.createUser(String(MS_FIXTURE_CLAIMS.email));
    const res = await msStart(new Request(`${APP}/api/auth/microsoft/start?intent=signin&from=login`));
    expect(res.headers.get("location")).toBe(`${APP}/account`);
    expect(sessionOf(res)?.userId).toBe(dana.id);
    expect(db.audit.find((a) => a.action === "ms.connect")).toMatchObject({ result: "ok:demo" });
  });
});
