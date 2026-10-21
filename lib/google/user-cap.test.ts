import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { MemoryDb } from "@/lib/db/memory";
import { EnvError } from "@/lib/env";
import { setMailerForTests } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, gmailReadEnabled } from "./oauth";
import {
  alertLevels,
  capAlertMail,
  countCapUsers,
  googleAccountHash,
  googleCapConfig,
  googleConnectShowsUnverified,
  gmailReadAccess,
  recordGoogleGrants,
  unverifiedScreenExpected,
  type GoogleCapConfig,
} from "./user-cap";

const CFG: GoogleCapConfig = { gmailReadEnabled: true, cap: 95, sensitiveVerified: false, realGoogle: true };
const READ = [GOOGLE_SCOPES.gmailReadonly];

/** n distinct Google accounts already in the ledger (as Google counts them). */
async function seed(db: MemoryDb, n: number, scope: string = GOOGLE_SCOPES.gmailReadonly) {
  for (let i = 0; i < n; i++) await db.recordGoogleScopeGrant({ account_hash: googleAccountHash(`seed${i}@gmail.com`), scope, user_id: null });
}

describe("Google unverified-app user cap — configuration", () => {
  it("Gmail read defaults on with a real GOOGLE_CLIENT_ID, explicit values win, garbage fails in Hebrew", () => {
    expect(gmailReadEnabled({})).toBe(false);
    expect(gmailReadEnabled({ GOOGLE_CLIENT_ID: "x.apps.googleusercontent.com" })).toBe(true);
    expect(gmailReadEnabled({ GOOGLE_CLIENT_ID: "x", GOOGLE_GMAIL_READ_ENABLED: "" })).toBe(true);
    expect(gmailReadEnabled({ GOOGLE_CLIENT_ID: "x", GOOGLE_GMAIL_READ_ENABLED: "false" })).toBe(false);
    expect(gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "true" })).toBe(true);
    expect(() => gmailReadEnabled({ GOOGLE_GMAIL_READ_ENABLED: "maybe" })).toThrow(EnvError);
  });

  it("cap 95 and sensitive-unverified by default; the cap must be 1–100", () => {
    expect(googleCapConfig({ GOOGLE_CLIENT_ID: "x" })).toEqual({ gmailReadEnabled: true, cap: 95, sensitiveVerified: false, realGoogle: true });
    expect(googleCapConfig({ GOOGLE_GMAIL_READ_CAP: "60", GOOGLE_SENSITIVE_SCOPES_VERIFIED: "true" })).toMatchObject({ cap: 60, sensitiveVerified: true, gmailReadEnabled: false, realGoogle: false });
    // fixtures (DATA_MODE=memory / DEMO_MODE) never show Google's screen
    expect(googleCapConfig({ GOOGLE_CLIENT_ID: "x", DATA_MODE: "memory" }).realGoogle).toBe(false);
    expect(googleCapConfig({ GOOGLE_CLIENT_ID: "x", DEMO_MODE: "1" }).realGoogle).toBe(false);
    expect(() => googleCapConfig({ GOOGLE_GMAIL_READ_CAP: "101" })).toThrow(/GOOGLE_GMAIL_READ_CAP/);
    expect(() => googleCapConfig({ GOOGLE_GMAIL_READ_CAP: "many" })).toThrow(EnvError);
  });

  it("alert levels: 80 and the cap", () => {
    expect(alertLevels(95)).toEqual([80, 95]);
    expect(alertLevels(100)).toEqual([80, 100]);
    expect(alertLevels(50)).toEqual([50]);
  });

  it("the account hash is sha256 of the lowercased email (same as the SQL backfill)", () => {
    expect(googleAccountHash(" Dana.Levi@Gmail.com ")).toBe("6329af6e825cf5d306bd9ee890deeeadeca084acfc597c7801cb0c365e90e947");
  });
});

describe("Google unverified-app user cap — 79 / 80 / 95 / 96 users", () => {
  let db: MemoryDb;
  let notified: number[];
  const notify = async (a: { level: number }) => void notified.push(a.level);
  const grant = (email: string, scopes: readonly string[] = READ) => recordGoogleGrants(db, { userId: `u-${email}`, accountEmail: email, granted: [...scopes] }, { cfg: CFG, notify });
  beforeEach(() => {
    db = new MemoryDb();
    notified = [];
  });

  it("79 counted → a new account may still be asked; the 80th grant raises the 80 alert once", async () => {
    await seed(db, 79);
    expect(await gmailReadAccess(db, null, CFG)).toEqual({ allowed: true, reason: "under_cap", count: 79, cap: 95 });
    expect(await grant("eighty@gmail.com")).toEqual({ recorded: READ, count: 80, alerts: [80] });
    expect(notified).toEqual([80]);
    expect((await db.getOpsFlag("google_user_cap:80"))!.value).toMatchObject({ count: 80, cap: 95, sensitive_verified: false });
    expect(db.audit.at(-1)).toMatchObject({ user_id: "u-eighty@gmail.com", action: "ops.google_user_cap", target: "level:80", result: "count:80/95" });
    // the same account again, and the 81st: no new alert
    expect(await grant("eighty@gmail.com")).toEqual({ recorded: [], count: 80, alerts: [] });
    expect((await grant("eighty-one@gmail.com")).alerts).toEqual([]);
    expect(notified).toEqual([80]);
  });

  it("94 → the 95th grant raises the 95 alert; at 95 new accounts are refused, counted ones are not", async () => {
    await seed(db, 94);
    await db.setOpsFlagOnce("google_user_cap:80", { count: 80 }); // already alerted earlier
    expect((await gmailReadAccess(db, "new@gmail.com", CFG)).allowed).toBe(true);
    expect((await grant("ninety-five@gmail.com")).alerts).toEqual([95]);
    expect(notified).toEqual([95]);
    expect(await gmailReadAccess(db, "another@gmail.com", CFG)).toEqual({ allowed: false, reason: "cap_reached", count: 95, cap: 95 });
    expect(await gmailReadAccess(db, null, CFG)).toMatchObject({ allowed: false, reason: "cap_reached" });
    // an account Google already counted costs no new slot (e.g. it disconnected and asks again)
    expect(await gmailReadAccess(db, "Ninety-Five@gmail.com", CFG)).toEqual({ allowed: true, reason: "already_counted", count: null, cap: 95 });
  });

  it("96: two consents started at 94 both finish → 96 counted, one alert per level, new accounts refused (headroom under Google's 100)", async () => {
    await seed(db, 94);
    await db.setOpsFlagOnce("google_user_cap:80", { count: 80 });
    // both users were offered gmail.readonly while the count was 94
    expect((await gmailReadAccess(db, null, CFG)).allowed).toBe(true);
    expect((await gmailReadAccess(db, null, CFG)).allowed).toBe(true);
    expect((await grant("first@gmail.com")).alerts).toEqual([95]);
    expect(await grant("second@gmail.com")).toEqual({ recorded: READ, count: 96, alerts: [] });
    expect(notified).toEqual([95]);
    expect(await gmailReadAccess(db, "third@gmail.com", CFG)).toEqual({ allowed: false, reason: "cap_reached", count: 96, cap: 95 });
    expect((await gmailReadAccess(db, "second@gmail.com", CFG)).allowed).toBe(true);
  });

  it("a jump past several levels at once (e.g. after the SQL backfill) raises each level once", async () => {
    await seed(db, 96);
    expect(await countCapUsers(db)).toBe(96);
    expect((await grant("late@gmail.com")).alerts).toEqual([80, 95]);
    expect((await grant("later@gmail.com")).alerts).toEqual([]);
    expect(notified).toEqual([80, 95]);
  });

  it("revoked or deleted users keep their slot: the ledger is never trimmed", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await recordGoogleGrants(h.db, { userId: user.id, accountEmail: "dana.levi@gmail.com", granted: READ }, { cfg: CFG, notify });
    const conn = h.db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    await h.db.revokeConnection(user.id, conn.id);
    await h.db.deleteUser(user.id);
    expect(await countCapUsers(h.db)).toBe(1);
    expect(await h.db.hasGoogleScopeGrant(googleAccountHash("dana.levi@gmail.com"), READ)).toBe(true);
  });

  it("which grants count: sensitive scopes until GOOGLE_SENSITIVE_SCOPES_VERIFIED, restricted always; non-sensitive never", async () => {
    await grant("base@gmail.com", GOOGLE_BASE_SCOPES);
    expect(db.googleScopeGrants.map((g) => g.scope).sort()).toEqual([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend].sort());
    const verified = { ...CFG, sensitiveVerified: true };
    const r = await recordGoogleGrants(db, { userId: "u2", accountEmail: "after@gmail.com", granted: [...GOOGLE_BASE_SCOPES] }, { cfg: verified, notify });
    expect(r).toEqual({ recorded: [], count: 1, alerts: [] }); // approved scopes no longer use slots…
    expect(await gmailReadAccess(db, "base@gmail.com", verified)).toMatchObject({ reason: "already_counted" }); // …but earlier grants still did
    await recordGoogleGrants(db, { userId: "u3", accountEmail: "drive-only@gmail.com", granted: ["openid", "email", GOOGLE_SCOPES.driveFile] }, { cfg: CFG, notify });
    expect(await countCapUsers(db)).toBe(1);
  });

  it("disabled → never allowed, whatever the count", async () => {
    expect(await gmailReadAccess(db, "a@gmail.com", { ...CFG, gmailReadEnabled: false })).toEqual({ allowed: false, reason: "disabled", count: null, cap: 95 });
  });
});

describe("operator alert email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setMailerForTests(undefined);
  });

  it("goes to OPERATOR_EMAIL through the app mailer; without it — log + flag only", async () => {
    const mailer = new ConsoleMailer();
    setMailerForTests(mailer);
    const db = new MemoryDb();
    await seed(db, 79);
    await recordGoogleGrants(db, { userId: "u", accountEmail: "a@gmail.com", granted: READ }, { cfg: CFG });
    expect(mailer.alerts).toEqual([]);
    expect(await db.getOpsFlag("google_user_cap:80")).not.toBeNull();

    vi.stubEnv("OPERATOR_EMAIL", "daniel@secureops.example");
    await seed(db, 95);
    await recordGoogleGrants(db, { userId: "u", accountEmail: "b@gmail.com", granted: READ }, { cfg: CFG });
    expect(mailer.alerts).toHaveLength(1);
    expect(mailer.alerts[0]!.to).toBe("daniel@secureops.example");
    expect(mailer.alerts[0]!.subject).toContain("סף 95");
  });

  it("the text says what happens and what to do next", () => {
    const at80 = capAlertMail({ level: 80, count: 80, cap: 95, sensitiveVerified: false });
    expect(at80.subject).toBe("עלזה: 80 חשבונות Google בתקרה של אפליקציה לא מאומתת (סף 80)");
    expect(at80.text).toContain("עוד 15 חשבונות");
    expect(at80.text).toContain("calendar.events ו-gmail.send עדיין לא אושרו");
    expect(at80.text).toContain("Composio");
    const at95 = capAlertMail({ level: 95, count: 95, cap: 95, sensitiveVerified: true });
    expect(at95.text).toContain("משתמשים חדשים כבר לא מתבקשים לאשר קריאת Gmail");
    expect(at95.text).not.toContain("עדיין לא אושרו");
  });
});

describe("the 'unverified app' heads-up", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only with a real Google project, when the request carries an unapproved scope", () => {
    expect(unverifiedScreenExpected({ realGoogle: false, sensitiveVerified: false }, true)).toBe(false);
    expect(unverifiedScreenExpected({ realGoogle: true, sensitiveVerified: false }, false)).toBe(true);
    expect(unverifiedScreenExpected({ realGoogle: true, sensitiveVerified: true }, false)).toBe(false);
    expect(unverifiedScreenExpected({ realGoogle: true, sensitiveVerified: true }, true)).toBe(true);
  });

  it("chat connect links: verified sensitive scopes + cap full → no heads-up; under the cap → heads-up", async () => {
    const db = new MemoryDb();
    const verified = { ...CFG, sensitiveVerified: true };
    expect(await googleConnectShowsUnverified(db, [], verified)).toBe(true);
    await seed(db, 95);
    expect(await googleConnectShowsUnverified(db, [], verified)).toBe(false);
    expect(await googleConnectShowsUnverified(db, [], CFG)).toBe(true);
  });

  it('"לחבר את גוגל" in chat carries the one-line heads-up; Microsoft links do not', async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await processInbound(h.ctx, h.inbound("לחבר את גוגל"));
    const google = h.wa.texts.at(-1)!;
    expect(google).toContain("/api/auth/google/start?t=");
    expect(google.split("\n").at(-1)).toBe("גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.");
    await processInbound(h.ctx, h.inbound("לחבר את אאוטלוק"));
    expect(h.wa.texts.at(-1)).not.toContain("אפליקציה לא מאומתת");
  });

  it("the onboarding connect button for Google carries it too", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "connect", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await processInbound(h.ctx, h.button("onb:connect:google", "Google"));
    const link = h.wa.texts.find((t) => t.includes("/api/auth/google/start?t="))!;
    expect(link.endsWith("גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.")).toBe(true);
  });
});
