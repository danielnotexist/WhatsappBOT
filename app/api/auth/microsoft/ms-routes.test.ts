import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { setDbForTests } from "@/lib/db";
import { RecordingWaSender } from "@/lib/wa/sender";
import { setWaSenderForTests } from "@/lib/wa";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { setGlobalSingleton } from "@/lib/global-singleton";
import { POST as notifyPost } from "../../graph/notify/route";
import { GET as callbackGet } from "./callback/route";
import { GET as startGet } from "./start/route";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

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
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
  });

  it("start (chat link) → Microsoft authorize with PKCE; callback stores the connection, subscribes and tells the user", async () => {
    const user = await db.createUser("dana@example.com");
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

    // state is single-use
    const again = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?code=abc&state=${state}`));
    expect(new URL(again.headers.get("location")!).searchParams.get("error")).toContain("לא זוהה");
    // expired / bad chat token
    expect((await startGet(new Request("https://app.example.co.il/api/auth/microsoft/start?t=bad"))).status).toBe(410);
  });

  it("return=onboarding: success lands on /start/ready, failure goes back to /start/connect (admin flag when needed)", async () => {
    const user = await db.createUser("dana@example.com");
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
    expect(wa.texts.at(-1)).toContain("/api/auth/microsoft/start?admin=1");

    const adminStart = await startGet(new Request(`https://app.example.co.il/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(user.id, "microsoft"))}`));
    const adminUrl = new URL(adminStart.headers.get("location")!);
    expect(adminUrl.pathname).toBe("/organizations/v2.0/adminconsent");
    const st2 = adminUrl.searchParams.get("state")!;
    const granted = await callbackGet(new Request(`https://app.example.co.il/api/auth/microsoft/callback?admin_consent=True&tenant=t1&state=${st2}`));
    expect(new URL(granted.headers.get("location")!).searchParams.get("notice")).toContain("אישור המנהל התקבל");
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
});
