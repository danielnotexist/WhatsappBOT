import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { POST as notifyPost } from "../../graph/notify/route";
import { GET as rawCallbackGet } from "./callback/route";
import { GET as rawStartGet } from "./start/route";
import { flushServerEvents } from "@/lib/analytics/track";
import { createSessionToken } from "@/lib/auth/session";

const jar = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "wb_session" && jar.session ? { name, value: jar.session } : undefined) }) }));

/** One browser: the cookies the routes set (the connect binding, lib/auth/connect-cookie.ts) go back with each request. */
const browser = new Map<string, string>();
const withBrowser = (handler: (r: Request) => Promise<Response>) => async (req: Request) => {
  const headers = new Headers(req.headers);
  if (browser.size && !headers.has("cookie")) headers.set("cookie", [...browser].map(([k, v]) => `${k}=${v}`).join("; "));
  const res = await handler(new Request(req.url, { headers }));
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const i = pair!.indexOf("=");
    const name = pair!.slice(0, i).trim();
    if (attrs.some((a) => a.trim() === "Max-Age=0")) browser.delete(name);
    else browser.set(name, pair!.slice(i + 1));
  }
  return res;
};
const startGet = withBrowser(rawStartGet);
const callbackGet = withBrowser(rawCallbackGet);

describe("Microsoft connect routes (memory mode)", () => {
  let db: MemoryDb;
  let wa: RecordingWaSender;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    db = new MemoryDb();
    wa = new RecordingWaSender();
    setDbForTests(db);
    setWaSenderForTests(wa);
    setGlobalSingleton("graph-fixture", undefined);
    setGlobalSingleton("ms-fixture-claims", undefined);
    jar.session = undefined;
    browser.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
  });

  it("start (chat link) → Microsoft authorize with PKCE; callback stores the connection, subscribes and tells the user", async () => {
    // a chat link alone: the account's own address, vouched for by Microsoft (xms_edov in the fixture)
    const user = await db.createUser("dana@levi-law.co.il");
    db.seedWaIdentity(user.id, "+972501234567");
    const t = createConnectLinkToken(user.id, "microsoft");
    const start = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?t=${encodeURIComponent(t)}`));
    expect(start.status).toBe(303);
    const authorize = new URL(start.headers.get("location")!);
    expect(authorize.hostname).toBe("login.microsoftonline.com");
    const state = authorize.searchParams.get("state")!;
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(((await db.getUser(user.id))!.profile.oauth_pending as { microsoft: { state: string } }).microsoft.state).toBe(state);

    const cb = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?code=abc&state=${state}`));
    expect(cb.status).toBe(303);
    expect(new URL(cb.headers.get("location")!).searchParams.get("notice")).toContain("הושלם");
    const conns = await db.listConnections(user.id);
    expect(conns).toHaveLength(1);
    expect(conns[0]).toMatchObject({ provider: "microsoft", account_email: "dana@levi-law.co.il", tenant_id: "memory-tenant", status: "active" });
    expect((await db.getConnectionSecret(conns[0]!.id))!.enc_access!.startsWith("v1.")).toBe(true);
    expect(await db.listGraphSubscriptionsForConnection(conns[0]!.id)).toHaveLength(1);
    expect(wa.texts.at(-1)).toContain("החיבור ל-Microsoft 365 הושלם");
    expect((await db.getUser(user.id))!.name).toBe("דנה לוי");
    await flushServerEvents(); // the signup funnel's "mail connected" step
    expect(db.pageEvents.filter((e) => e.event === "mail_connected").map((e) => e.user_id)).toEqual([user.id]);

    // state is single-use
    const again = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?code=abc&state=${state}`));
    expect(new URL(again.headers.get("location")!).searchParams.get("error")).toContain("לא זוהה");
    // expired / bad chat token
    expect((await startGet(new Request("https://app.example.co.il/api/auth/microsoft/start?t=bad"))).status).toBe(410);
  });

  it("return=onboarding: success lands on /start/ready, failure goes back to /start/connect (admin flag when needed)", async () => {
    const user = await db.createUser("dana@levi-law.co.il");
    const start = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?returnTo=onboarding&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const ok = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?code=abc&state=${state}`));
    const okUrl = new URL(ok.headers.get("location")!);
    expect(okUrl.pathname).toBe("/start/ready");
    expect(okUrl.searchParams.get("connected")).toBe("microsoft");

    const again = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?returnTo=onboarding&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    const st2 = new URL(again.headers.get("location")!).searchParams.get("state")!;
    const denied = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?error=consent_required&error_description=AADSTS65001&state=${st2}`));
    const deniedUrl = new URL(denied.headers.get("location")!);
    expect(deniedUrl.pathname).toBe("/start/connect");
    expect(deniedUrl.searchParams.get("admin")).toBe("1");
    expect(deniedUrl.searchParams.get("error")).toContain("מנהל ה-IT");

    // anything else in `return` keeps the personal area (allow-list)
    const other = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?return=https://evil.example&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    const st3 = new URL(other.headers.get("location")!).searchParams.get("state")!;
    const back = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?code=abc&state=${st3}`));
    expect(new URL(back.headers.get("location")!).pathname).toBe("/account");
  });

  it("admin consent is required → Hebrew IT text with the admin link in WhatsApp", async () => {
    const user = await db.createUser("dana@example.com");
    await db.updateUserProfile(user.id, { business_name: "משרד לוי" });
    db.seedWaIdentity(user.id, "+972501234567");
    const t = createConnectLinkToken(user.id, "microsoft");
    const start = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?t=${encodeURIComponent(t)}`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cb = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?error=consent_required&error_description=AADSTS65001%3A+admin+consent+needed&state=${state}`));
    expect(new URL(cb.headers.get("location")!).searchParams.get("error")).toContain("אישור מנהל");
    expect(wa.texts.at(-1)).toContain("משרד לוי");
    expect(wa.texts.at(-1)).toContain("/api/auth/microsoft/start?admin=1&t=");

    // the IT admin opens the forwarded link in their own browser, without any session: the admin consent only
    const adminLink = wa.texts.at(-1)!.match(/https:\/\/\S+admin=1&t=[^\s"]+/)![0];
    browser.clear();
    const adminStart = await startGet(new Request(adminLink));
    const adminUrl = new URL(adminStart.headers.get("location")!);
    expect(adminUrl.pathname).toBe("/organizations/v2.0/adminconsent");
    const st2 = adminUrl.searchParams.get("state")!;
    const granted = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?admin_consent=True&tenant=t1&state=${st2}`));
    expect(new URL(granted.headers.get("location")!).searchParams.get("notice")).toContain("אישור המנהל התקבל");
    // an admin link is admin-only: without admin=1 it is refused
    expect((await startGet(new Request(adminLink.replace("admin=1&", "")))).status).toBe(410);
  });

  it("graph notify answers the validation handshake and accepts only matching clientState", async () => {
    const v = await notifyPost(new Request("https://app.example.co.il/api/graph/notify?validationToken=abc%20123", { method: "POST" }));
    expect(v.status).toBe(200);
    expect(await v.text()).toBe("abc 123");
    expect(v.headers.get("content-type")).toContain("text/plain");
    const user = await db.createUser("dana@example.com");
    const conn = db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
    await db.upsertGraphSubscription({ connection_id: conn.id, subscription_id: "sub-1", resource: "me/mailFolders('inbox')/messages", expires_at: new Date().toISOString(), client_state: "secret" });
    const n = await notifyPost(new Request("https://app.example.co.il/api/graph/notify", { method: "POST", body: JSON.stringify({ value: [{ subscriptionId: "sub-1", clientState: "secret", changeType: "created", resource: "x" }, { subscriptionId: "sub-1", clientState: "wrong", changeType: "created" }] }) }));
    expect(n.status).toBe(202);
    expect(await n.json()).toEqual({ accepted: 1 });
    expect(db.audit.filter((a) => a.action === "graph.notification")).toHaveLength(1);
  });

  it("graph notify bounds the echo and refuses odd or oversized bodies before any lookup", async () => {
    const APP = "https://app.example.co.il/api/graph/notify";
    const real = "Validation: Testing client application reachability for subscription Request-Id: 3e33d2a4-1c4b-4e5f-9a1b-0c2d3e4f5a6b";
    const ok = await notifyPost(new Request(`${APP}?validationToken=${encodeURIComponent(real)}`, { method: "POST" }));
    expect(await ok.text()).toBe(real);
    expect(ok.headers.get("content-disposition")).toBe("attachment");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await notifyPost(new Request(`${APP}?validationToken=${encodeURIComponent("<b>שירות לקוחות: להתקשר</b>")}`, { method: "POST" }))).status).toBe(400);
    expect((await notifyPost(new Request(`${APP}?validationToken=${"a".repeat(513)}`, { method: "POST" }))).status).toBe(400);
    expect((await notifyPost(new Request(`${APP}?validationToken=`, { method: "POST" }))).status).toBe(400);

    const lookups = vi.spyOn(db, "findGraphSubscription");
    for (const body of ["null", '{"value":{}}', '{"value":[null]}', "not json", JSON.stringify({ value: Array.from({ length: 101 }, (_, i) => ({ subscriptionId: `s${i}`, clientState: "x" })) })]) {
      expect((await notifyPost(new Request(APP, { method: "POST", body }))).status).toBe(400);
    }
    expect(lookups).not.toHaveBeenCalled();
    // many notifications for one subscription: one lookup
    const same = JSON.stringify({ value: Array.from({ length: 50 }, () => ({ subscriptionId: "sub-x", clientState: "x" })) });
    expect((await notifyPost(new Request(APP, { method: "POST", body: same }))).status).toBe(202);
    expect(lookups).toHaveBeenCalledTimes(1);
    lookups.mockRestore();
  });
  it("the plan's gate: on the trial and basic Microsoft 365 cannot join an active Google account (the pay page, why=second_account); pro connects both; the admin consent is not gated", async () => {
    const APP = "https://app.example.co.il";
    const user = await db.createUser("dana@example.com");
    db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    jar.session = createSessionToken(user.id); // signed in: the refusal may land on the personal pay page
    const start = () => startGet(new Request(`${APP}/api/auth/microsoft/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    const refused = await start();
    expect(refused.status).toBe(303);
    const to = new URL(refused.headers.get("location")!);
    expect(to.origin + to.pathname).toMatch(new RegExp(`^${APP}/pay/[^/]+$`));
    expect(to.searchParams.get("why")).toBe("second_account");
    expect((await db.getUser(user.id))!.profile.oauth_pending).toBeUndefined();
    await db.upsertSubscription(user.id, { plan: "basic", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    expect(new URL((await start()).headers.get("location")!).searchParams.get("why")).toBe("second_account");
    // the IT admin's tenant-wide consent connects nothing: not gated
    const admin = await startGet(new Request(`${APP}/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft", { purpose: "admin" }))}`));
    expect(new URL(admin.headers.get("location")!).pathname).toContain("adminconsent");
    // a chat link alone never mints a pay link: a plain notice
    jar.session = undefined;
    const alone = await start();
    expect(alone.status).toBe(403);
    expect(await alone.text()).toContain("בחבילה הנוכחית אפשר לחבר חשבון אחד");
    jar.session = createSessionToken(user.id);
    await db.upsertSubscription(user.id, { plan: "pro" });
    expect(new URL((await start()).headers.get("location")!).hostname).toBe("login.microsoftonline.com");
  });

  it("pro asks for the Teams transcript pair (meeting summaries); when only that needs the IT admin, the connect goes on without it", async () => {
    const APP = "https://app.example.co.il";
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    jar.session = createSessionToken(user.id); // signed in: another mailbox than the account's address may connect
    const start = (q = "") => startGet(new Request(`${APP}/api/auth/microsoft/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft", { purpose: q.includes("admin=1") ? "admin" : "user" }))}${q}`));
    const scopesOf = (r: Response) => new URL(r.headers.get("location")!).searchParams.get("scope")!.split(" ");
    // the trial (and basic): the base set only
    expect(scopesOf(await start())).not.toContain("OnlineMeetingTranscript.Read.All");
    await db.upsertSubscription(user.id, { plan: "pro", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    const first = await start();
    expect(scopesOf(first)).toEqual(expect.arrayContaining(["OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All", "Mail.ReadWrite"]));
    // the admin's consent of a pro user covers it too
    expect(new URL((await start("&admin=1")).headers.get("location")!).searchParams.get("scope")).toContain("https://graph.microsoft.com/OnlineMeetingTranscript.Read.All");

    // "Need admin approval" → "Return to the application without granting consent"
    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    const back = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?error=access_denied&error_description=${encodeURIComponent("AADSTS65004: User declined to consent to access the app.")}&state=${state}`));
    const again = new URL(back.headers.get("location")!);
    expect(again.hostname).toBe("login.microsoftonline.com");
    expect(again.searchParams.get("scope")).not.toContain("OnlineMeeting");
    const fresh = (await db.getUser(user.id))!;
    expect(fresh.profile.ms_meetings_consent).toBe("admin_required");
    expect((fresh.profile.oauth_pending as { microsoft: { state: string; meetings: boolean } }).microsoft).toMatchObject({ state: again.searchParams.get("state"), meetings: false });
    // the base connect completes
    const done = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${again.searchParams.get("state")}`));
    expect(new URL(done.headers.get("location")!).searchParams.get("notice")).toContain("הושלם");
    expect(await db.listConnections(user.id)).toHaveLength(1);
    // a second decline (no meeting scopes asked any more) is a plain failure, not a loop
    const s2 = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    await db.mergeUserProfile(user.id, { oauth_pending: { microsoft: { ...((await db.getUser(user.id))!.profile.oauth_pending as { microsoft: Record<string, unknown> }).microsoft, meetings: false } } });
    const plain = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?error=access_denied&state=${s2}`));
    expect(new URL(plain.headers.get("location")!).hostname).toBe("app.example.co.il");
  });

  describe("connect security (security round, area C)", () => {
    const APP = "https://app.example.co.il";
    const startWith = async (userId: string, q = "") => startGet(new Request(`${APP}/api/auth/microsoft/start?t=${encodeURIComponent(createConnectLinkToken(userId, "microsoft", { purpose: q.includes("admin=1") ? "admin" : "user" }))}${q}`));
    const stateOf = (r: Response) => new URL(r.headers.get("location")!).searchParams.get("state")!;

    it("a pending state older than 30 minutes is refused without exchanging the code (also the admin consent)", async () => {
      const user = await db.createUser("dana@levi-law.co.il");
      db.seedWaIdentity(user.id, "+972501234567");
      for (const q of ["", "&admin=1"]) {
        const state = stateOf(await startWith(user.id, q));
        const pending = ((await db.getUser(user.id))!.profile.oauth_pending as { microsoft: Record<string, unknown> }).microsoft;
        await db.mergeUserProfile(user.id, { oauth_pending: { microsoft: { ...pending, started_at: new Date(Date.now() - 31 * 60_000).toISOString() } } });
        const cb = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?${q ? "admin_consent=True&tenant=t1" : "code=abc"}&state=${state}`));
        expect(new URL(cb.headers.get("location")!).searchParams.get("error"), q).toContain("לא זוהה");
        expect(db.audit.at(-1), q).toMatchObject({ result: "error:state_expired" });
      }
      expect(await db.listConnections(user.id)).toEqual([]);
      expect(wa.texts).toEqual([]); // no "the admin approved" either
    });

    it("the callback finishes only in the browser that started it: a captured authorize URL attaches nothing", async () => {
      const attacker = await db.createUser("attacker@example.com");
      db.seedWaIdentity(attacker.id, "+972501234567");
      jar.session = createSessionToken(attacker.id);
      const start = await startGet(new Request(`${APP}/api/auth/microsoft/start`));
      expect(start.headers.getSetCookie().some((c) => c.startsWith("wb_connect_microsoft=") && c.includes("HttpOnly"))).toBe(true);
      jar.session = undefined; // the victim's browser
      const cb = await rawCallbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(start)}`));
      expect(new URL(cb.headers.get("location")!).searchParams.get("error")).toContain("התחיל בדפדפן אחר");
      expect(await db.listConnections(attacker.id)).toEqual([]);
      expect(wa.texts).toEqual([]);
      expect(db.audit.at(-1)).toMatchObject({ action: "ms.connect", result: "error:unbound" });
    });

    it("a chat link alone adds only the account's own address, and only when Microsoft vouches for it", async () => {
      // another mailbox (the fixture's dana@levi-law.co.il) for the account dana@example.com
      const user = await db.createUser("dana@example.com");
      const cb = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(await startWith(user.id))}`));
      expect(new URL(cb.headers.get("location")!).searchParams.get("error")).toContain("קישור מהשיחה מחבר רק");
      expect(await db.listConnections(user.id)).toEqual([]);
      expect(db.audit.at(-1)).toMatchObject({ action: "ms.connect", result: "error:chat_other_mailbox" });
      // the same address, but a work account without xms_edov (Microsoft does not vouch for the email claim)
      const own = await db.createUser("dana@levi-law.co.il");
      setGlobalSingleton("ms-fixture-claims", { tid: "org-tenant", oid: "attacker-oid", preferred_username: "dana@levi-law.co.il", email: "dana@levi-law.co.il" });
      const cb2 = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(await startWith(own.id))}`));
      expect(new URL(cb2.headers.get("location")!).searchParams.get("error")).toContain("קישור מהשיחה מחבר רק");
      expect(await db.listConnections(own.id)).toEqual([]);
      // signed in to the account, the same consent connects
      jar.session = createSessionToken(own.id);
      const cb3 = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(await startWith(own.id))}`));
      expect(new URL(cb3.headers.get("location")!).searchParams.get("notice")).toContain("הושלם");
    });

    it("a chat link works once; a user link cannot open the admin consent", async () => {
      const user = await db.createUser("dana@levi-law.co.il");
      const t = createConnectLinkToken(user.id, "microsoft");
      expect((await startGet(new Request(`${APP}/api/auth/microsoft/start?t=${encodeURIComponent(t)}`))).status).toBe(303);
      const again = await startGet(new Request(`${APP}/api/auth/microsoft/start?t=${encodeURIComponent(t)}`));
      expect(again.status).toBe(410);
      expect(await again.text()).toContain("פעם אחת");
      const asAdmin = await startGet(new Request(`${APP}/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
      expect(asAdmin.status).toBe(410);
    });

    it("an id_token for another app, from another issuer or expired is refused before anything is stored", async () => {
      const user = await db.createUser("dana@levi-law.co.il");
      jar.session = createSessionToken(user.id);
      const now = Math.floor(Date.now() / 1000);
      for (const extra of [{ aud: "another-app" }, { iss: "https://login.microsoftonline.com/other-tenant/v2.0" }, { exp: now - 3600 }]) {
        setGlobalSingleton("ms-fixture-claims", { tid: "memory-tenant", oid: "u1", preferred_username: "dana@levi-law.co.il", email: "dana@levi-law.co.il", xms_edov: true, ...extra });
        const cb = await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(await startGet(new Request(`${APP}/api/auth/microsoft/start`)))}`));
        expect(new URL(cb.headers.get("location")!).searchParams.get("error"), JSON.stringify(extra)).toBe("החיבור נכשל (invalid_id_token). אפשר לנסות שוב.");
      }
      expect(await db.listConnections(user.id)).toEqual([]);
    });

    it("graph notify drops notifications of a disconnected mailbox; disconnecting removes the subscription", async () => {
      const user = await db.createUser("dana@levi-law.co.il");
      const conn = db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
      await db.upsertGraphSubscription({ connection_id: conn.id, subscription_id: "sub-9", resource: "me/mailFolders('inbox')/messages", expires_at: new Date().toISOString(), client_state: "secret" });
      // a revoked connection whose subscription row is still there (SupabaseDb before this fix)
      conn.status = "revoked";
      const n = await notifyPost(new Request(`${APP}/api/graph/notify`, { method: "POST", body: JSON.stringify({ value: [{ subscriptionId: "sub-9", clientState: "secret", changeType: "created", resource: "x" }] }) }));
      expect(await n.json()).toEqual({ accepted: 0 });
      expect(db.audit.filter((a) => a.action === "graph.notification")).toHaveLength(0);
      // a real connection (its inbox subscription made at Graph), then "ניתוק"
      jar.session = createSessionToken(user.id);
      await callbackGet(new Request(`${APP}/api/auth/microsoft/callback?code=abc&state=${stateOf(await startGet(new Request(`${APP}/api/auth/microsoft/start`)))}`));
      const live = (await db.listConnections(user.id)).find((c) => c.status === "active")!;
      const [sub] = await db.listGraphSubscriptionsForConnection(live.id);
      expect(sub).toBeTruthy();
      const { disconnectConnectionFor } = await import("@/lib/account/service");
      expect((await disconnectConnectionFor(db, user.id, live.id)).ok).toBe(true);
      expect(await db.findGraphSubscription(sub!.subscription_id)).toBeNull();
      // …and at Graph too, so Microsoft stops notifying for it
      const graph = globalSingleton<{ state: { calls: { method: string; url: string }[]; subscriptions: unknown[] } }>("graph-fixture", () => { throw new Error("no graph fixture"); });
      expect(graph.state.calls.some((c) => c.method === "DELETE" && c.url.endsWith(`/subscriptions/${sub!.subscription_id}`))).toBe(true);
      expect(graph.state.subscriptions).toEqual([]);
    });
  });
});
