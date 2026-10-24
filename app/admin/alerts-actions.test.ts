import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { setMailerForTests } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";

/**
 * The alerts tab's server actions (app/admin/alerts-actions.ts): the owner with the open panel saves the settings and
 * sends a test mail, each audited (admin.alerts_update / admin.alerts_test); anyone else gets a 404 and nothing changes.
 */
const h = vi.hoisted(() => {
  class NotFound extends Error {
    readonly digest = "NEXT_HTTP_ERROR_FALLBACK;404";
  }
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return { NotFound, Redirect, session: null as { userId: string } | null, jar: new Map<string, string>() };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new h.NotFound("not found");
  },
  redirect: (url: string) => {
    throw new h.Redirect(url);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void h.jar.set(name, value),
    delete: (opt: string | { name: string }) => void h.jar.delete(typeof opt === "string" ? opt : opt.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
}));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

const { saveAlertSettingsAction, sendTestAlertAction } = await import("./alerts-actions");
const { ADMIN_COOKIE, createAdminToken } = await import("@/lib/admin/tokens");
const { loadAlertSettings, DEFAULT_ALERT_SETTINGS } = await import("@/lib/admin/alerts");

const OWNER = "danielnotexist@gmail.com";
let db: MemoryDb;
let mailer: ConsoleMailer;

beforeEach(() => {
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("DATA_MODE", "memory");
  vi.stubEnv("APP_URL", "https://alze.example");
  vi.stubEnv("ADMIN_EMAILS", "");
  db = new MemoryDb();
  setDbForTests(db);
  mailer = new ConsoleMailer();
  setMailerForTests(mailer);
  h.jar.clear();
  h.session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(undefined);
  setMailerForTests(undefined);
});

async function as(email: string, panelOpen: boolean) {
  const user = await db.createUser(email);
  h.session = { userId: user.id };
  if (panelOpen) h.jar.set(ADMIN_COOKIE, createAdminToken(user.id));
  return user;
}

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const SETTINGS = { type_ticket: "on", type_payment_failed: "on", quiet_enabled: "on", quiet_start: "23", quiet_end: "6", shabbat: "on", spike_threshold: "15" };

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "returned";
  } catch (e) {
    if (e instanceof h.NotFound) return "404";
    if (e instanceof h.Redirect) return e.url;
    throw e;
  }
}

describe("alerts tab actions", () => {
  it("not signed in, a regular user, or the owner before the panel's code: 404, nothing saved or sent", async () => {
    expect(await outcome(saveAlertSettingsAction(form(SETTINGS)))).toBe("404");
    expect(await outcome(sendTestAlertAction())).toBe("404");
    await as("someone@example.com", true);
    expect(await outcome(saveAlertSettingsAction(form(SETTINGS)))).toBe("404");
    expect(await outcome(sendTestAlertAction())).toBe("404");
    await as(OWNER, false);
    expect(await outcome(saveAlertSettingsAction(form(SETTINGS)))).toBe("404");
    expect(await outcome(sendTestAlertAction())).toBe("404");
    expect(await loadAlertSettings(db)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(mailer.ownerAlerts).toHaveLength(0);
    expect(db.audit.filter((a) => a.action.startsWith("admin.alerts"))).toHaveLength(0);
  });

  it("the owner saves the switches, the quiet hours, Shabbat and the threshold; audited", async () => {
    const owner = await as(OWNER, true);
    const to = await outcome(saveAlertSettingsAction(form(SETTINGS)));
    expect(new URL(to, "https://x").searchParams.get("notice")).toBe("הגדרות ההתראות נשמרו.");
    expect(new URL(to, "https://x").searchParams.get("tab")).toBe("alerts");
    const s = await loadAlertSettings(db);
    expect(s.types).toMatchObject({ signup: false, ticket: true, payment_failed: true, error_spike: false });
    expect(s.quiet).toEqual({ enabled: true, start: 23, end: 6, shabbat: true });
    expect(s.errorSpikeThreshold).toBe(15);
    expect(db.audit.find((a) => a.action === "admin.alerts_update")).toMatchObject({ user_id: owner.id, target: "owner_alerts:settings", result: expect.stringContaining("quiet=23-6") });
  });

  it("a bad value is refused with a Hebrew error and nothing is saved", async () => {
    await as(OWNER, true);
    const to = await outcome(saveAlertSettingsAction(form({ ...SETTINGS, quiet_start: "25" })));
    expect(new URL(to, "https://x").searchParams.get("error")).toContain("שעות השקט");
    expect(await loadAlertSettings(db)).toEqual(DEFAULT_ALERT_SETTINGS);
  });

  it("the test mail goes to the owner at once; audited", async () => {
    const owner = await as(OWNER, true);
    const to = await outcome(sendTestAlertAction());
    expect(new URL(to, "https://x").searchParams.get("notice")).toContain("מייל הבדיקה נשלח");
    expect(mailer.ownerAlerts).toHaveLength(1);
    expect(mailer.ownerAlerts[0]).toMatchObject({ to: [OWNER], subject: "מייל בדיקה מפאנל הניהול" });
    expect(db.audit.find((a) => a.action === "admin.alerts_test")).toMatchObject({ user_id: owner.id, result: "sent" });
    expect(db.ownerAlerts[0]).toMatchObject({ type: "test", status: "sent", channel: "email" });
  });
});
