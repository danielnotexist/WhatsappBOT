import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerEvent } from "@/lib/copy/owner-alerts";
import { MemoryDb } from "@/lib/db/memory";
import { ConsoleMailer } from "@/lib/mail/console";
import type { Mailer } from "@/lib/mail/types";
import { RecordingWaSender } from "@/lib/wa/sender";
import {
  DEFAULT_ALERT_SETTINGS,
  aiBudgetAlert,
  alertSettingsFromForm,
  captureOwnerAlerts,
  checkErrorSpike,
  connectionExpiredAlert,
  connectionExpiredEvent,
  dedupeKey,
  flushOwnerDigest,
  inQuietTime,
  loadAlertSettings,
  notifyOwner,
  ownerAlert,
  ownerAlertsSlot,
  ownerRecipients,
  parseAlertSettings,
  resetBudgetAlertsForTests,
  runOwnerAlertsJob,
  saveAlertSettings,
  scheduleOwnerAlertsJob,
  sendTestAlert,
  settleOwnerAlerts,
  stopCapturingOwnerAlerts,
  type NotifyDeps,
} from "./alerts";

/**
 * The owner's alerts (lib/admin/alerts.ts): once per event, a rate limit per type, the switches, quiet hours with the
 * morning digest, the urgent types that skip them, the SUPPORT_EMAIL merge, and a send that fails without throwing.
 */

const OWNER = "danielnotexist@gmail.com";
const ENV = { NODE_ENV: "test", DATA_MODE: "memory", APP_URL: "https://alze.example" };
const U1 = "11111111-1111-4111-8111-111111111111";

// Israel time (IDT, UTC+3 until 25.10.2026): Wednesday 21.10
const NOON = new Date("2026-10-21T09:00:00Z"); // 12:00
const NIGHT = new Date("2026-10-21T20:00:00Z"); // 23:00
const LATE = new Date("2026-10-21T20:30:00Z"); // 23:30
const MORNING = new Date("2026-10-22T04:15:00Z"); // Thursday 07:15
const SHABBAT_NOON = new Date("2026-10-24T09:00:00Z"); // Saturday 12:00

let db: MemoryDb;
let mailer: ConsoleMailer;
let clock: Date;

const deps = (extra: Partial<NotifyDeps> = {}): NotifyDeps => ({ db, mailer, now: clock, env: ENV, ...extra });
const signup = (id = U1, email = "dana@example.co.il"): OwnerEvent => ({ type: "signup", userId: id, email, source: { utm_source: "google", utm_campaign: "spring" } });
const failed = (ref: string): OwnerEvent => ({ type: "payment_failed", userId: U1, email: "dana@example.co.il", name: "דנה לוי", amountIls: 99, reason: "חיוב חודשי: סירוב של חברת האשראי (קוד 4).", ref });

beforeEach(() => {
  db = new MemoryDb();
  mailer = new ConsoleMailer();
  clock = NOON;
  db.now = () => clock;
  resetBudgetAlertsForTests();
});
afterEach(() => {
  stopCapturingOwnerAlerts();
  vi.restoreAllMocks();
});

describe("notifyOwner — the mail", () => {
  it("mails every ADMIN_EMAILS address once, with the subject, the deep link and an RTL HTML version; the row says sent", async () => {
    const r = await notifyOwner(signup(), deps({ env: { ...ENV, ADMIN_EMAILS: "a@x.co, B@x.co" } }));
    expect(r).toMatchObject({ status: "sent", channel: "email" });
    expect(mailer.ownerAlerts).toHaveLength(1);
    const m = mailer.ownerAlerts[0]!;
    expect(m.to).toEqual(["a@x.co", "b@x.co"]);
    expect(m.subject).toBe("נרשם חדש: dana@example.co.il (מקור: google)");
    expect(m.text).toContain(`https://alze.example/admin/users/${U1}`);
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain(`href="https://alze.example/admin/users/${U1}"`);
    expect(db.ownerAlerts).toHaveLength(1);
    expect(db.ownerAlerts[0]).toMatchObject({ type: "signup", status: "sent", channel: "email", dedupe_key: `signup:${U1}`, subject: m.subject });
    expect(db.ownerAlerts[0]!.sent_at).not.toBeNull();
  });

  it("defaults to the owner's address (ADMIN_EMAILS unset)", async () => {
    await notifyOwner(signup(), deps());
    expect(mailer.ownerAlerts[0]!.to).toEqual([OWNER]);
  });

  it("the same event twice is mailed once (dedupe key)", async () => {
    expect((await notifyOwner(signup(), deps())).status).toBe("sent");
    expect((await notifyOwner(signup(), deps())).status).toBe("duplicate");
    expect((await notifyOwner(failed("A1"), deps())).status).toBe("sent");
    expect((await notifyOwner(failed("A1"), deps())).status).toBe("duplicate");
    expect(mailer.ownerAlerts).toHaveLength(2);
    expect(db.ownerAlerts).toHaveLength(2);
  });

  it("a ticket answers to the person who opened it (Reply-To)", async () => {
    await notifyOwner({ type: "ticket", ticketId: "t1", subject: "חיוב כפול", fromName: "דנה", fromEmail: "dana@example.co.il", userId: null, excerpt: "חויבתי פעמיים" }, deps());
    expect(mailer.ownerAlerts[0]).toMatchObject({ subject: "פנייה חדשה: חיוב כפול", replyTo: "dana@example.co.il" });
    expect(mailer.ownerAlerts[0]!.text).toContain("https://alze.example/admin?tab=tickets#t-t1");
  });
});

describe("rate limits per type", () => {
  it("error_spike: at most one an hour; signup: 60 an hour, then limited (still recorded)", async () => {
    const spike = (slot: string): OwnerEvent => ({ type: "error_spike", count: 12, threshold: 10, top: [{ source: "bot", count: 12 }], slot });
    expect((await notifyOwner(spike("2026-10-21T12"), deps())).status).toBe("sent");
    clock = new Date(NOON.getTime() + 40 * 60_000);
    expect((await notifyOwner(spike("2026-10-21T13"), deps())).status).toBe("limited");
    expect(db.ownerAlerts.find((a) => a.dedupe_key === "error_spike:2026-10-21T13")!.status).toBe("limited");
    clock = new Date(NOON.getTime() + 61 * 60_000);
    expect((await notifyOwner(spike("2026-10-21T14"), deps())).status).toBe("sent");

    for (let i = 0; i < 60; i++) expect((await notifyOwner(signup(`u-${i}`, `u${i}@example.co.il`), deps())).status).toBe("sent");
    expect((await notifyOwner(signup("u-60", "u60@example.co.il"), deps())).status).toBe("limited");
    expect(db.ownerAlerts.find((a) => a.dedupe_key === "signup:u-60")!.status).toBe("limited");
  });

  it("payment_failed: 20 an hour, then limited (each still recorded)", async () => {
    for (let i = 0; i < 20; i++) expect((await notifyOwner(failed(`R${i}`), deps())).status).toBe("sent");
    expect((await notifyOwner(failed("R20"), deps())).status).toBe("limited");
    expect(mailer.ownerAlerts).toHaveLength(20);
  });

  it("ai_budget: once per threshold per day (the dedupe key), a new day starts again", async () => {
    const budget = (threshold: 80 | 100, day = "2026-10-21"): OwnerEvent => ({ type: "ai_budget", threshold, spentUsd: threshold === 80 ? 2.4 : 3, budgetUsd: 3, day });
    expect((await notifyOwner(budget(80), deps())).status).toBe("sent");
    expect((await notifyOwner(budget(80), deps())).status).toBe("duplicate");
    expect((await notifyOwner(budget(100), deps())).status).toBe("sent");
    expect(dedupeKey(budget(100))).toBe("ai_budget:2026-10-21:100");
    clock = new Date(NOON.getTime() + 25 * 3_600_000);
    expect((await notifyOwner(budget(80, "2026-10-22"), deps())).status).toBe("sent");
  });
});

describe("the switches", () => {
  it("a type switched off sends nothing and records nothing; the others go on", async () => {
    await saveAlertSettings(db, { ...DEFAULT_ALERT_SETTINGS, types: { ...DEFAULT_ALERT_SETTINGS.types, signup: false } });
    expect((await notifyOwner(signup(), deps())).status).toBe("off");
    expect((await notifyOwner(failed("X"), deps())).status).toBe("sent");
    expect(mailer.ownerAlerts.map((m) => m.subject)).toEqual([expect.stringMatching(/^תשלום נכשל/)]);
    expect(db.ownerAlerts.map((a) => a.type)).toEqual(["payment_failed"]);
  });

  it("the test mail ignores the switches and the quiet hours", async () => {
    await saveAlertSettings(db, { ...DEFAULT_ALERT_SETTINGS, types: Object.fromEntries(Object.keys(DEFAULT_ALERT_SETTINGS.types).map((k) => [k, false])) as typeof DEFAULT_ALERT_SETTINGS.types });
    clock = NIGHT;
    expect(await sendTestAlert(OWNER, deps())).toMatchObject({ status: "sent" });
    expect(mailer.ownerAlerts[0]!.subject).toBe("מייל בדיקה מפאנל הניהול");
  });

  it("settings are read safely: defaults, unknown keys dropped, bad values back to the default", async () => {
    expect(await loadAlertSettings(db)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(DEFAULT_ALERT_SETTINGS.quiet).toEqual({ enabled: true, start: 22, end: 7, shabbat: true });
    expect(parseAlertSettings({ types: { signup: false, nope: true }, quiet: { start: 30, end: 6, shabbat: "yes" }, errorSpikeThreshold: -1 })).toEqual({
      ...DEFAULT_ALERT_SETTINGS,
      types: { ...DEFAULT_ALERT_SETTINGS.types, signup: false },
      quiet: { enabled: true, start: 22, end: 6, shabbat: true },
    });
  });

  it("the tab's form: checkboxes, hours and the spike threshold; a bad value is refused", () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ type_signup: "on", type_payment_failed: "on", quiet_enabled: "on", quiet_start: "23", quiet_end: "6", spike_threshold: "25" })) f.set(k, v);
    const r = alertSettingsFromForm(f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.types).toMatchObject({ signup: true, payment_failed: true, ticket: false, error_spike: false });
    expect(r.settings.quiet).toEqual({ enabled: true, start: 23, end: 6, shabbat: false });
    expect(r.settings.errorSpikeThreshold).toBe(25);
    f.set("quiet_start", "24");
    expect(alertSettingsFromForm(f)).toMatchObject({ ok: false, error: expect.stringContaining("שעות השקט") });
    f.set("quiet_start", "22");
    f.set("spike_threshold", "0");
    expect(alertSettingsFromForm(f)).toMatchObject({ ok: false, error: expect.stringContaining("סף") });
  });
});

describe("quiet hours, Shabbat and the morning digest", () => {
  it("quiet time: 22:00–07:00 Israel time by default, Shabbat when on, none when start = end or off", () => {
    const s = DEFAULT_ALERT_SETTINGS;
    expect(inQuietTime(s, NOON)).toBe(false);
    expect(inQuietTime(s, NIGHT)).toBe(true);
    expect(inQuietTime(s, new Date("2026-10-22T03:59:00Z"))).toBe(true); // 06:59
    expect(inQuietTime(s, new Date("2026-10-22T04:00:00Z"))).toBe(false); // 07:00
    expect(inQuietTime(s, SHABBAT_NOON)).toBe(true);
    expect(inQuietTime({ ...s, quiet: { ...s.quiet, shabbat: false } }, SHABBAT_NOON)).toBe(false);
    expect(inQuietTime({ ...s, quiet: { ...s.quiet, enabled: false } }, NIGHT)).toBe(false);
    expect(inQuietTime({ ...s, quiet: { ...s.quiet, start: 9, end: 9 } }, NIGHT)).toBe(false);
    expect(inQuietTime({ ...s, quiet: { ...s.quiet, start: 9, end: 17 } }, NOON)).toBe(true);
  });

  it("non-urgent alerts wait through the night and go as one digest in the morning; nothing goes twice", async () => {
    clock = NIGHT;
    expect((await notifyOwner(signup(), deps())).status).toBe("queued");
    expect((await notifyOwner({ type: "ticket", ticketId: "t9", subject: "שאלה", fromName: "רון", fromEmail: "ron@example.co.il" }, deps())).status).toBe("queued");
    expect((await notifyOwner({ type: "ai_budget", threshold: 80, spentUsd: 2.5, budgetUsd: 3, day: "2026-10-21" }, deps())).status).toBe("queued");
    expect(mailer.ownerAlerts).toHaveLength(0);

    clock = LATE;
    expect(await flushOwnerDigest(deps())).toEqual({ status: "skipped", reason: "quiet time" });
    expect(mailer.ownerAlerts).toHaveLength(0);

    clock = MORNING;
    expect(await flushOwnerDigest(deps())).toMatchObject({ status: "sent", channel: "digest" });
    expect(mailer.ownerAlerts).toHaveLength(1);
    const d = mailer.ownerAlerts[0]!;
    expect(d.subject).toBe("סיכום שעות השקט: 3 התראות");
    expect(d.text).toContain("נרשם חדש: dana@example.co.il (מקור: google)");
    expect(d.text).toContain(`https://alze.example/admin/users/${U1}`);
    expect(d.text).toContain("https://alze.example/admin?tab=tickets#t-t9");
    expect(d.text.indexOf("נרשם חדש")).toBeLessThan(d.text.indexOf("פנייה חדשה"));
    expect(d.html).toContain("סיכום שעות השקט");
    expect(db.ownerAlerts.every((a) => a.status === "sent" && a.channel === "digest")).toBe(true);
    expect(await flushOwnerDigest(deps())).toEqual({ status: "skipped", reason: "nothing queued" });
    expect(mailer.ownerAlerts).toHaveLength(1);
  });

  it("urgent types skip the quiet hours and Shabbat: a failed payment, a charge to check, an error spike, the budget at 100%", async () => {
    for (const at of [NIGHT, SHABBAT_NOON]) {
      clock = at;
      const tag = at.toISOString();
      expect((await notifyOwner(failed(`F${tag}`), deps())).status).toBe("sent");
      expect((await notifyOwner({ type: "charge_unknown", userId: U1, amountIls: 299, reason: "אין תשובה", ref: `U${tag}` }, deps())).status).toBe("sent");
      expect((await notifyOwner({ type: "ai_budget", threshold: 100, spentUsd: 3, budgetUsd: 3, day: tag }, deps())).status).toBe("sent");
      expect((await notifyOwner({ type: "connection_expired_paid", userId: U1, provider: "google", plan: "פרו", connectionId: "c1", day: tag }, deps())).status).toBe("queued");
    }
    clock = NIGHT;
    expect((await notifyOwner({ type: "error_spike", count: 30, threshold: 10, top: [], slot: "2026-10-21T23" }, deps())).status).toBe("sent");
    expect(mailer.ownerAlerts).toHaveLength(7);
  });

  it("a digest that fails goes back to the queue once, then is marked failed (no endless retries)", async () => {
    clock = NIGHT;
    await notifyOwner(signup(), deps());
    clock = MORNING;
    const broken: Mailer = { sendOtp: async () => ({ id: null }), sendOwnerAlert: async () => Promise.reject(new Error("Resend 500: down")) };
    expect(await flushOwnerDigest(deps({ mailer: broken }))).toMatchObject({ status: "failed" });
    expect(db.ownerAlerts[0]).toMatchObject({ status: "queued", error: expect.stringContaining("Resend 500") });
    expect(await flushOwnerDigest(deps({ mailer: broken }))).toMatchObject({ status: "failed" });
    expect(db.ownerAlerts[0]!.status).toBe("failed");
    expect(await flushOwnerDigest(deps())).toEqual({ status: "skipped", reason: "nothing queued" });
  });
});

describe("a send failure never throws", () => {
  it("the provider fails → the row is failed, the error is in app_errors, the caller gets a result", async () => {
    const broken: Mailer = { sendOtp: async () => ({ id: null }), sendOwnerAlert: async () => Promise.reject(new Error("Resend 503: unavailable")) };
    const r = await notifyOwner(failed("Z1"), deps({ mailer: broken }));
    expect(r).toMatchObject({ status: "failed", error: expect.stringContaining("Resend 503") });
    expect(db.ownerAlerts[0]).toMatchObject({ status: "failed", channel: null });
    expect(db.appErrors.map((e) => e.source)).toEqual(["owner_alerts"]);
  });

  it("no real mail in this environment (the demo without LIVE_SUPPORT_MAIL) → failed with a Hebrew reason, not an error report", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await notifyOwner(failed("Z2"), { db, now: clock, env: { NODE_ENV: "test", DEMO_MODE: "1", APP_URL: "https://alze.example", TOKEN_ENC_KEY: Buffer.alloc(32, 3).toString("base64") } });
    expect(r.status).toBe("failed");
    expect(db.ownerAlerts[0]!.error).toContain("LIVE_SUPPORT_MAIL");
    expect(db.appErrors).toHaveLength(0);
  });

  it("the store itself fails → status error, reported, nothing thrown", async () => {
    vi.spyOn(db, "claimOwnerAlert").mockRejectedValue(new Error("db down"));
    await expect(notifyOwner(signup(), deps())).resolves.toMatchObject({ status: "error", error: "db down" });
    expect(db.appErrors[0]).toMatchObject({ source: "owner_alerts", message: "db down" });
  });

  it("ownerAlert() (the call sites' one-liner) returns at once and never throws", () => {
    expect(() => ownerAlert(signup(), { db: { getOpsFlag: () => Promise.reject(new Error("x")) } as unknown as MemoryDb })).not.toThrow();
  });
});

describe("SUPPORT_EMAIL and the owner: one mail, not two", () => {
  it("the ticket already went to an owner address → merged, no second mail", async () => {
    const t: OwnerEvent = { type: "ticket", ticketId: "t1", subject: "עזרה", fromName: "דנה", fromEmail: "d@example.co.il" };
    expect(await notifyOwner(t, deps({ alreadyMailed: [OWNER.toUpperCase()] }))).toMatchObject({ status: "merged" });
    expect(mailer.ownerAlerts).toHaveLength(0);
    expect(db.ownerAlerts[0]).toMatchObject({ status: "merged", channel: "email" });
  });

  it("merged also at night (never queued for the digest); a second owner still gets the alert", async () => {
    clock = NIGHT;
    const t = (id: string): OwnerEvent => ({ type: "ticket", ticketId: id, subject: "עזרה", fromName: "דנה", fromEmail: "d@example.co.il" });
    expect((await notifyOwner(t("t2"), deps({ alreadyMailed: [OWNER] }))).status).toBe("merged");
    clock = NOON;
    expect((await notifyOwner(t("t3"), deps({ env: { ...ENV, ADMIN_EMAILS: `${OWNER},partner@x.co` }, alreadyMailed: [OWNER] }))).status).toBe("sent");
    expect(mailer.ownerAlerts.map((m) => m.to)).toEqual([["partner@x.co"]]);
    expect(ownerRecipients({ ADMIN_EMAILS: "a@x.co,b@x.co" }, ["B@X.CO"])).toEqual(["a@x.co"]);
  });
});

describe("WhatsApp (off until the template is approved)", () => {
  it("off by default: mail only", async () => {
    const wa = new RecordingWaSender();
    await notifyOwner(failed("W0"), deps({ wa }));
    expect(wa.sent).toHaveLength(0);
  });

  it("OWNER_ALERT_WA=1 + ADMIN_PHONE → the owner_alert template too", async () => {
    const wa = new RecordingWaSender();
    const r = await notifyOwner(failed("W1"), deps({ wa, env: { ...ENV, OWNER_ALERT_WA: "1", ADMIN_PHONE: "+972501234567" } }));
    expect(r).toMatchObject({ status: "sent", channel: "email+whatsapp" });
    expect(wa.sent[0]).toMatchObject({ kind: "template", to: "+972501234567", template: { name: "owner_alert", params: [{ type: "text", text: expect.stringMatching(/^תשלום נכשל: 99 ₪, דנה לוי$/) }] } });
  });

  it("OWNER_ALERT_WA=1 without ADMIN_PHONE → the mail still goes, the Hebrew reason names ADMIN_PHONE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await notifyOwner(failed("W2"), deps({ env: { ...ENV, OWNER_ALERT_WA: "1" } }));
    expect(r).toMatchObject({ status: "sent", channel: "email", error: expect.stringContaining("ADMIN_PHONE") });
  });
});

describe("the owner_alerts job", () => {
  async function errors(n: number, source = "bot") {
    for (let i = 0; i < n; i++) await db.insertAppError({ source, message: `boom ${i}` });
  }

  it("an error spike: the last hour at or over the threshold, with the top sources; the alerts' own errors do not count", async () => {
    await errors(6, "bot");
    await errors(3, "jobs");
    await errors(5, "owner_alerts");
    expect(await checkErrorSpike(deps())).toBeNull();
    await errors(1, "billing");
    expect(await checkErrorSpike(deps())).toMatchObject({ status: "sent" });
    const m = mailer.ownerAlerts[0]!;
    expect(m.subject).toBe("קפיצה בתקלות: 10 בשעה האחרונה");
    expect(m.text).toMatch(/bot: 6[\s\S]*jobs: 3[\s\S]*billing: 1/);
    expect(m.text).not.toContain("owner_alerts");
    // the same hour again: one mail
    expect(await checkErrorSpike(deps())).toMatchObject({ status: "duplicate" });
    // the threshold is a setting
    await saveAlertSettings(db, { ...DEFAULT_ALERT_SETTINGS, errorSpikeThreshold: 50 });
    clock = new Date(NOON.getTime() + 2 * 3_600_000);
    await errors(20);
    expect(await checkErrorSpike(deps())).toBeNull();
  });

  it("runs the spike check and the digest; the tick schedules one job per quarter-hour", async () => {
    expect(await runOwnerAlertsJob(deps())).toEqual({ spike: "none", digest: "skipped: nothing queued" });
    expect(ownerAlertsSlot(new Date("2026-10-21T09:44:59Z")).key).toBe("owner_alerts:2026-10-21T09:30");
    expect(await scheduleOwnerAlertsJob(db, new Date("2026-10-21T09:31:00Z"))).toBe(true);
    expect(await scheduleOwnerAlertsJob(db, new Date("2026-10-21T09:44:00Z"))).toBe(false);
    expect(await scheduleOwnerAlertsJob(db, new Date("2026-10-21T09:45:00Z"))).toBe(true);
    expect(db.jobs.map((j) => [j.kind, j.user_id, j.dedupe_key, j.run_at])).toEqual([
      ["owner_alerts", null, "owner_alerts:2026-10-21T09:30", "2026-10-21T09:30:00.000Z"],
      ["owner_alerts", null, "owner_alerts:2026-10-21T09:45", "2026-10-21T09:45:00.000Z"],
    ]);
  });
});

describe("the hooks", () => {
  it("the AI budget: 80% once, 100% once, nothing below — per day", () => {
    const seen = captureOwnerAlerts();
    aiBudgetAlert(db, "2026-10-21", 1.5, 3);
    aiBudgetAlert(db, "2026-10-21", 2.4, 3);
    aiBudgetAlert(db, "2026-10-21", 2.7, 3);
    aiBudgetAlert(db, "2026-10-21", 3.01, 3);
    aiBudgetAlert(db, "2026-10-21", 3.2, 3);
    aiBudgetAlert(db, "2026-10-22", 2.5, 3);
    aiBudgetAlert(db, "2026-10-22", 2.5, 0);
    expect(seen.map((s) => s.event)).toEqual([
      { type: "ai_budget", threshold: 80, spentUsd: 2.4, budgetUsd: 3, day: "2026-10-21" },
      { type: "ai_budget", threshold: 100, spentUsd: 3.01, budgetUsd: 3, day: "2026-10-21" },
      { type: "ai_budget", threshold: 80, spentUsd: 2.5, budgetUsd: 3, day: "2026-10-22" },
    ]);
  });

  it("a connection that expired is an alert only when its user pays", async () => {
    const seen = captureOwnerAlerts();
    const trial = await db.createUser("trial@example.co.il");
    const paying = await db.createUser("paying@example.co.il");
    await db.updateUserProfile(paying.id, { name: "רון כהן" });
    await db.upsertSubscription(paying.id, { plan: "pro", status: "active", next_charge_at: new Date(NOON.getTime() + 20 * 86_400_000).toISOString() });
    expect(await connectionExpiredEvent(db, { id: "c0", user_id: trial.id, provider: "google" }, NOON)).toBeNull();
    connectionExpiredAlert(db, { id: "c0", user_id: trial.id, provider: "google" }, NOON);
    connectionExpiredAlert(db, { id: "c1", user_id: paying.id, provider: "microsoft" }, NOON);
    await settleOwnerAlerts();
    expect(seen.map((s) => s.event)).toEqual([
      { type: "connection_expired_paid", userId: paying.id, email: "paying@example.co.il", name: "רון כהן", provider: "microsoft", plan: "פרו", connectionId: "c1", day: "2026-10-21" },
    ]);
    expect(dedupeKey(seen[0]!.event)).toBe("connection_expired:c1:2026-10-21");
    expect(mailer.ownerAlerts).toHaveLength(0);
  });
});
