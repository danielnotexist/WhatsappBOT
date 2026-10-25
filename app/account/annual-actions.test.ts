import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { annualSwitchView } from "@/lib/billing/annual-switch";
import { activateSubscription } from "@/lib/billing/subscription";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { setHypForTests } from "@/lib/hyp";
import { MockHypGateway } from "@/lib/hyp/client";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { cancelSubscriptionAction, keepAnnualAction, scheduleMonthlyAction, switchToAnnualAction } from "./actions";

/**
 * The plan area's cycle actions (round 3) against MemoryDb and the mock HYP: [מעבר לשנתי עכשיו] charges the shown
 * amount once for the session's own user, "מעבר לחיוב חודשי" only schedules (nothing charged, nothing refunded), its
 * undo, and the cancel of an annual plan (to the end of the year, no refund). The user id comes from the session only.
 */
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return { Redirect, session: null as { userId: string } | null };
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new h.Redirect(url);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

async function submit(action: (fd: FormData) => Promise<void>, fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const thrown = await action(fd).then(
    () => null,
    (e: unknown) => e,
  );
  if (!(thrown instanceof h.Redirect)) throw new Error(`expected a redirect, got ${String(thrown)}`);
  const url = new URL(thrown.url, "https://app.example");
  return { path: url.pathname, notice: url.searchParams.get("notice"), error: url.searchParams.get("error"), tab: url.searchParams.get("tab") };
}

const DAY = 86_400_000;
let db: MemoryDb;
let hyp: MockHypGateway;
const charges = () => hyp.calls.filter((c) => c.method === "chargeToken");

async function subscriber(cycle: "monthly" | "annual", plan: "basic" | "pro" = "basic") {
  const user = await db.createUser(`u-${Math.random().toString(36).slice(2)}@example.com`);
  const price = cycle === "annual" ? (plan === "basic" ? 990 : 2990) : plan === "basic" ? 99 : 299;
  await activateSubscription(db, user, { plan, cycle, transId: `T-${user.id}`, amountIls: price, acode: null, token: "1234567890123454580", tokef: "3112", invoiceUrl: null, raw: {} }, new Date(Date.now() - 10 * DAY));
  h.session = { userId: user.id };
  return user;
}

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  db = new MemoryDb();
  hyp = new MockHypGateway("https://app.example.co.il");
  setDbForTests(db);
  setHypForTests(hyp);
  setWaSenderForTests(new RecordingWaSender());
});
afterEach(() => {
  setDbForTests(undefined);
  setHypForTests(undefined);
  setWaSenderForTests(undefined);
  h.session = null;
});

describe("the cycle actions of /account", () => {
  it("without a session: back to /start, nothing charged", async () => {
    expect(await submit(switchToAnnualAction, { offer: "x" })).toMatchObject({ path: "/start" });
    expect(await submit(scheduleMonthlyAction)).toMatchObject({ path: "/start" });
    expect(await submit(keepAnnualAction)).toMatchObject({ path: "/start" });
    expect(charges()).toHaveLength(0);
  });

  it("[מעבר לשנתי עכשיו]: the shown amount once, annual a year from today, the notice in the plan area", async () => {
    const user = await subscriber("monthly");
    const view = await annualSwitchView({ db, now: () => new Date() }, user, await db.getSubscription(user.id));
    if (view.kind !== "offer") throw new Error(JSON.stringify(view));
    const r = await submit(switchToAnnualAction, { offer: view.offer.offerToken });
    expect(r).toMatchObject({ path: "/account", tab: "plan", error: null });
    expect(r.notice).toMatch(/^עברת לחיוב שנתי: מסלול בסיסי שנתי\. חויבו [\d.,]+ ₪, והחיוב הבא: 990 ₪ ב-/);
    expect(charges()).toHaveLength(1);
    expect((charges()[0]!.args as { amount: number }).amount).toBe(view.offer.amountIls);
    const sub = (await db.getSubscription(user.id))!;
    expect(sub.billing_cycle).toBe("annual");
    expect(Math.abs(Date.parse(sub.next_charge_at!) - view.offer.newPeriodEnd.getTime())).toBeLessThan(60_000);
    // the same form again (back + resubmit): the first result, no second charge
    expect((await submit(switchToAnnualAction, { offer: view.offer.offerToken })).notice).toBe(r.notice);
    expect(charges()).toHaveLength(1);
  });

  it("another user's offer, or a forged one, is refused and charges nothing", async () => {
    const owner = await subscriber("monthly");
    const view = await annualSwitchView({ db, now: () => new Date() }, owner, await db.getSubscription(owner.id));
    if (view.kind !== "offer") throw new Error(JSON.stringify(view));
    await subscriber("monthly"); // the session is now someone else
    expect(await submit(switchToAnnualAction, { offer: view.offer.offerToken })).toMatchObject({ tab: "plan", error: expect.stringContaining("לא בוצע חיוב") });
    expect(await submit(switchToAnnualAction, { offer: "forged.token" })).toMatchObject({ error: expect.stringContaining("לא בוצע חיוב") });
    expect(charges()).toHaveLength(0);
    expect((await db.getSubscription(owner.id))!.billing_cycle).toBe("monthly");
  });

  it("annual → monthly is scheduled for the renewal (no charge, no refund) and can be undone", async () => {
    const user = await subscriber("annual");
    const before = (await db.getSubscription(user.id))!;
    const r = await submit(scheduleMonthlyAction);
    expect(r).toMatchObject({ tab: "plan", error: null });
    expect(r.notice).toContain("החיוב יהיה חודשי: 99 ₪ לחודש");
    expect(r.notice).toContain("אין החזר");
    expect(await db.getSubscription(user.id)).toMatchObject({ billing_cycle: "annual", scheduled_cycle: "monthly", next_charge_at: before.next_charge_at });
    expect((await submit(scheduleMonthlyAction)).error).toBe("המעבר לחיוב חודשי כבר נקבע.");
    expect(await submit(keepAnnualAction)).toMatchObject({ notice: "המעבר לחיוב חודשי בוטל. המנוי נשאר שנתי." });
    expect(await db.getSubscription(user.id)).toMatchObject({ billing_cycle: "annual", scheduled_cycle: null });
    expect((await submit(keepAnnualAction)).error).toBe("לא נקבע מעבר לחיוב חודשי.");
    expect(charges()).toHaveLength(0);
    expect(db.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["subscription.cycle_monthly_scheduled", "subscription.cycle_monthly_cleared"]));
  });

  it("a monthly plan has nothing to schedule", async () => {
    await subscriber("monthly");
    expect((await submit(scheduleMonthlyAction)).error).toBe("החיוב כבר חודשי.");
  });

  it("cancelling an annual plan: active to the end of the paid year, no refund, the scheduled change dropped", async () => {
    const user = await subscriber("annual", "pro");
    await submit(scheduleMonthlyAction);
    const r = await submit(cancelSubscriptionAction);
    expect(r.notice).toMatch(/^המנוי בוטל ויישאר פעיל עד .+\. לא יהיה חיוב נוסף\. על החלק שנותר מהשנה אין החזר\.$/);
    expect(await db.getSubscription(user.id)).toMatchObject({ status: "cancelled", plan: "pro", billing_cycle: "annual", scheduled_cycle: null });
    expect(charges()).toHaveLength(0);
    expect((await submit(scheduleMonthlyAction)).error).toBe("המנוי בוטל, ולכן אין חידוש לשנות.");
  });
});
