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
  checkGoogleUserCapAlerts,
  countCapUsers,
  googleAccountHash,
  googleAccountOf,
  googleCapConfig,
  googleConnectShowsUnverified,
  driveReadAccess,
  gmailReadAccess,
  keepGrantedGmailRead,
  keepGrantedRestrictedRead,
  maybeCheckGoogleUserCapAlerts,
  recordGoogleGrants,
  resetGoogleUserCapCheckForTests,
  restrictedReadAccess,
  restrictedReadEnabled,
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
    expect(googleCapConfig({ GOOGLE_CLIENT_ID: "x" })).toEqual({ gmailReadEnabled: true, driveReadEnabled: true, cap: 95, sensitiveVerified: false, realGoogle: true });
    expect(googleCapConfig({ GOOGLE_CLIENT_ID: "x", GOOGLE_DRIVE_READ_ENABLED: "false" })).toMatchObject({ gmailReadEnabled: true, driveReadEnabled: false });
    expect(() => googleCapConfig({ GOOGLE_DRIVE_READ_ENABLED: "maybe" })).toThrow(EnvError);
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
    // a disconnect keeps the link to the account (privacy policy §5) …
    expect(h.db.googleScopeGrants.every((g) => g.user_id === user.id)).toBe(true);
    await h.db.deleteUser(user.id);
    expect(await countCapUsers(h.db)).toBe(1);
    expect(await h.db.hasGoogleScopeGrant(googleAccountHash("dana.levi@gmail.com"), READ)).toBe(true);
    // … deleting the account clears it, like the SQL table's `on delete set null`
    expect(h.db.googleScopeGrants.every((g) => g.user_id === null)).toBe(true);
  });

  it("which grants count: sensitive scopes until GOOGLE_SENSITIVE_SCOPES_VERIFIED, restricted always; non-sensitive never", async () => {
    await grant("base@gmail.com", GOOGLE_BASE_SCOPES);
    // tasks (sensitive, 23.10.2026) is counted like calendar.events and gmail.send until verified
    expect(db.googleScopeGrants.map((g) => g.scope).sort()).toEqual([GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.tasks].sort());
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

  it("the cap decision and login_hint use the same account — also a revoked connection's", () => {
    const conn = (status: "active" | "revoked", email: string) => ({ provider: "google", status, account_email: email }) as Parameters<typeof googleAccountOf>[0][number];
    expect(googleAccountOf([conn("revoked", "old@gmail.com")])).toBe("old@gmail.com");
    expect(googleAccountOf([conn("revoked", "old@gmail.com"), conn("active", "new@gmail.com")])).toBe("new@gmail.com");
    expect(googleAccountOf([])).toBeNull();
  });
});

describe("Drive read (drive.readonly) — the same cap, its own switch", () => {
  const DRIVE = [GOOGLE_SCOPES.driveReadonly];
  let db: MemoryDb;
  beforeEach(() => {
    db = new MemoryDb();
  });

  it("is recorded in the ledger (restricted) and decided per account with the Gmail read", async () => {
    const cfg: GoogleCapConfig = { ...CFG, driveReadEnabled: true };
    expect(await recordGoogleGrants(db, { userId: "u1", accountEmail: "drive@gmail.com", granted: DRIVE }, { cfg: { ...cfg, sensitiveVerified: true } })).toMatchObject({ recorded: DRIVE, count: 1 });
    expect(await driveReadAccess(db, null, cfg)).toEqual({ allowed: true, reason: "under_cap", count: 1, cap: 95 });
    await seed(db, 95);
    expect(await driveReadAccess(db, "new@gmail.com", cfg)).toMatchObject({ allowed: false, reason: "cap_reached" });
    // the account that granted Drive read is counted: Gmail read costs it no new slot either
    expect(await gmailReadAccess(db, "drive@gmail.com", cfg)).toMatchObject({ allowed: true, reason: "already_counted" });
    expect(await restrictedReadAccess(db, "drive@gmail.com", "drive_read", cfg)).toMatchObject({ allowed: true, reason: "already_counted" });
  });

  it("switched off on its own: GOOGLE_DRIVE_READ_ENABLED=false leaves Gmail read alone", async () => {
    expect(await driveReadAccess(db, "a@gmail.com", { ...CFG, driveReadEnabled: false })).toMatchObject({ allowed: false, reason: "disabled" });
    expect(await driveReadAccess(db, "a@gmail.com", CFG)).toMatchObject({ allowed: false, reason: "disabled" }); // absent = off
    expect(await gmailReadAccess(db, "a@gmail.com", { ...CFG, driveReadEnabled: false })).toMatchObject({ allowed: true });
    expect(restrictedReadEnabled({ gmailReadEnabled: false, driveReadEnabled: true }, "drive_read")).toBe(true);
    expect(restrictedReadEnabled({ gmailReadEnabled: false, driveReadEnabled: true }, "gmail_read")).toBe(false);
  });

  it("the callback keeps drive.readonly by the same rules as gmail.readonly", async () => {
    const cfg: GoogleCapConfig = { ...CFG, driveReadEnabled: true };
    const granted = [...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.driveReadonly];
    const keep = (requested: string[], c: GoogleCapConfig = cfg) => keepGrantedRestrictedRead(db, { accountEmail: "new@gmail.com", granted, requested, startReason: "under_cap" }, "drive_read", c);
    expect(await keep(granted)).toEqual({ keep: true, reason: "requested" });
    expect(await keep([...GOOGLE_BASE_SCOPES])).toEqual({ keep: false, reason: "not_requested" });
    expect(await keep(granted, { ...cfg, driveReadEnabled: false })).toEqual({ keep: false, reason: "disabled" });
    expect(await keepGrantedRestrictedRead(db, { accountEmail: "new@gmail.com", granted: [...GOOGLE_BASE_SCOPES], requested: granted }, "drive_read", cfg)).toEqual({ keep: false, reason: "not_granted" });
  });

  it("the unverified-app heads-up also covers a connect that would ask for Drive read only", async () => {
    const verified: GoogleCapConfig = { ...CFG, sensitiveVerified: true, gmailReadEnabled: false, driveReadEnabled: true };
    expect(await googleConnectShowsUnverified(db, [], verified)).toBe(true);
    expect(await googleConnectShowsUnverified(db, [], { ...verified, driveReadEnabled: false })).toBe(false);
  });
});

describe("the callback keeps gmail.readonly only within the rules (keepGrantedGmailRead)", () => {
  const BASE = [...GOOGLE_BASE_SCOPES];
  const WITH_READ = [...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly];
  let db: MemoryDb;
  beforeEach(() => {
    db = new MemoryDb();
  });
  const keep = (accountEmail: string, requested: string[], startReason?: string, cfg: GoogleCapConfig = CFG) => keepGrantedGmailRead(db, { accountEmail, granted: WITH_READ, requested, startReason }, cfg);

  it("asked for under the cap → kept; not granted → nothing to keep", async () => {
    expect(await keep("new@gmail.com", WITH_READ, "under_cap")).toEqual({ keep: true, reason: "requested" });
    expect(await keepGrantedGmailRead(db, { accountEmail: "new@gmail.com", granted: BASE, requested: WITH_READ }, CFG)).toEqual({ keep: false, reason: "not_granted" });
  });

  it("not asked for (scope= edited in the consent URL, or an old grant from include_granted_scopes) → kept only for an account Google already counted", async () => {
    expect(await keep("new@gmail.com", BASE)).toEqual({ keep: false, reason: "not_requested" });
    await db.recordGoogleScopeGrant({ account_hash: googleAccountHash("veteran@gmail.com"), scope: GOOGLE_SCOPES.calendarEvents, user_id: null });
    expect(await keep("Veteran@Gmail.com", BASE)).toEqual({ keep: true, reason: "already_counted" });
  });

  it("off → never kept, also for a counted account", async () => {
    await db.recordGoogleScopeGrant({ account_hash: googleAccountHash("veteran@gmail.com"), scope: GOOGLE_SCOPES.gmailReadonly, user_id: null });
    expect(await keep("veteran@gmail.com", WITH_READ, "already_counted", { ...CFG, gmailReadEnabled: false })).toEqual({ keep: false, reason: "disabled" });
  });

  it("asked for because ANOTHER account was counted, and the user picked a new account at Google: kept only under the cap", async () => {
    await seed(db, 94);
    expect(await keep("switched@gmail.com", WITH_READ, "already_counted")).toEqual({ keep: true, reason: "requested" });
    await seed(db, 95);
    expect(await keep("switched@gmail.com", WITH_READ, "already_counted")).toEqual({ keep: false, reason: "cap_reached" });
    // the same at the cap after an under_cap decision (two consents racing): kept — that is the headroom under 100
    expect(await keep("racer@gmail.com", WITH_READ, "under_cap")).toEqual({ keep: true, reason: "requested" });
  });

  it("a ledger error drops the grant instead of failing the connect", async () => {
    const broken = new MemoryDb();
    broken.hasGoogleScopeGrant = async () => {
      throw new Error("relation google_scope_grants does not exist");
    };
    expect(await keepGrantedGmailRead(broken, { accountEmail: "a@gmail.com", granted: WITH_READ, requested: WITH_READ }, CFG)).toEqual({ keep: false, reason: "error" });
  });
});

describe("operator alerts without a new grant (backfill) — checkGoogleUserCapAlerts", () => {
  afterEach(() => resetGoogleUserCapCheckForTests());

  it("a count that crossed 80 and the cap some other way alerts once per level", async () => {
    const db = new MemoryDb();
    const notified: number[] = [];
    const notify = async (a: { level: number }) => void notified.push(a.level);
    await seed(db, 79);
    expect(await checkGoogleUserCapAlerts(db, { cfg: CFG, notify })).toEqual({ count: 79, alerts: [] });
    await seed(db, 96); // e.g. the 0008 backfill
    expect(await checkGoogleUserCapAlerts(db, { cfg: CFG, notify })).toEqual({ count: 96, alerts: [80, 95] });
    expect(await checkGoogleUserCapAlerts(db, { cfg: CFG, notify })).toEqual({ count: 96, alerts: [] });
    expect(notified).toEqual([80, 95]);
    expect(db.audit.filter((a) => a.action === "ops.google_user_cap").map((a) => [a.user_id, a.target])).toEqual([
      [null, "level:80"],
      [null, "level:95"],
    ]);
  });

  it("the job worker runs it at most once an hour per instance, and never throws", async () => {
    const db = new MemoryDb();
    let counts = 0;
    const count = db.countGoogleScopeAccounts.bind(db);
    db.countGoogleScopeAccounts = async (scopes) => {
      counts++;
      return count(scopes);
    };
    const t0 = new Date("2026-10-22T08:00:00Z");
    await maybeCheckGoogleUserCapAlerts(db, t0);
    await maybeCheckGoogleUserCapAlerts(db, new Date(t0.getTime() + 59 * 60_000));
    expect(counts).toBe(1);
    await maybeCheckGoogleUserCapAlerts(db, new Date(t0.getTime() + 61 * 60_000));
    expect(counts).toBe(2);
    db.countGoogleScopeAccounts = async () => {
      throw new Error("db down");
    };
    await expect(maybeCheckGoogleUserCapAlerts(db, new Date(t0.getTime() + 3 * 60 * 60_000))).resolves.toBeUndefined();
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
    expect(at80.text).toContain("calendar.events ו-gmail.send (וגם tasks) עדיין לא אושרו");
    expect(at80.text).toContain("קריאת Gmail וקריאת Drive");
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

  it("the reconnect prompt for an expired Google connection carries it too", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "real-client.apps.googleusercontent.com");
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    h.db.seedConnection(user.id, "google", "dana.levi@gmail.com").status = "expired";
    await processInbound(h.ctx, h.inbound("מה יש לי ביומן היום?"));
    const reply = h.wa.texts.at(-1)!;
    expect(reply).toContain("החיבור ל-Google פג תוקף");
    expect(reply).toContain("/api/auth/google/start?t=");
    expect(reply.split("\n").at(-1)).toBe("גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'.");
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
