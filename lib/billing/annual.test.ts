import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { captureOwnerAlerts, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { MemoryDb } from "@/lib/db/memory";
import { MockHypGateway } from "@/lib/hyp/client";
import { RecordingWaSender } from "@/lib/wa/sender";
import { annualSwitchResult, annualSwitchView, switchToAnnualFromWeb } from "./annual-switch";
import { planComparison } from "./compare";
import type { BillingContext } from "./context";
import { verifyAnnualOfferToken, verifyUpgradeOfferToken } from "./links";
import { prorate, quoteAnnualSwitch, quoteUpgrade, subtractOneYear, vatOf } from "./money";
import { PLANS, addCycle, addOneYear, annualPerMonthIls, annualSavingIls, cycleOf, isBillingCycle, planNameHe, priceOf, renewalCycleOf } from "./plans";
import { completePayment, startPayment } from "./service";
import { activateSubscription, chargeSubscription } from "./subscription";
import { upgradeFromWeb, webUpgradeResult, webUpgradeView } from "./web-upgrade";
import { handleBillingButton, handleBillingCommand } from "./whatsapp";

/**
 * Round 3, the annual cycle: the price (10 months for 12), the first charge and the renewal a year later, the
 * prorated upgrade in the middle of a year, monthly → annual with the unused month credited, the changes that wait
 * for the renewal (pro → basic, annual → monthly), and a failed annual charge. Mock HYP only.
 */

const DAY = 86_400_000;
const TOKEN = "1234567890123454580";
const PHONE = "+972501234567";

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
});

function setup(start: Date) {
  let now = start;
  const db = new MemoryDb();
  db.now = () => now;
  const hyp = new MockHypGateway("https://app.example.co.il");
  const wa = new RecordingWaSender();
  const ctx: BillingContext = { db, hyp, wa, appUrl: "https://app.example.co.il", now: () => now };
  return {
    db,
    hyp,
    wa,
    ctx,
    set: (d: Date) => (now = d),
    charges: () => hyp.calls.filter((c) => c.method === "chargeToken"),
  };
}

async function annualUser(s: ReturnType<typeof setup>, plan: "basic" | "pro", at: Date, opts: { window?: boolean } = {}) {
  const u = await s.db.createUser(`dana-${randomUUID().slice(0, 8)}@example.com`);
  await s.db.updateUserProfile(u.id, { name: "דנה לוי" });
  s.db.seedWaIdentity(u.id, PHONE);
  if (opts.window !== false) await s.db.insertMessage({ user_id: u.id, wa_message_id: `w-${u.id}`, direction: "in", text: "היי" });
  await activateSubscription(s.db, u, { plan, cycle: "annual", transId: "T0", amountIls: priceOf(plan, "annual"), acode: null, token: TOKEN, tokef: "3112", invoiceUrl: null, raw: {} }, at);
  return (await s.db.getUser(u.id))!;
}

describe("annual pricing (lib/billing/plans.ts)", () => {
  it("10 months for 12: 990 ₪ and 2,990 ₪ a year, VAT included; the per-month equivalent and the saving", () => {
    expect(PLANS.basic).toMatchObject({ priceIls: 99, annualPriceIls: 990 });
    expect(PLANS.pro).toMatchObject({ priceIls: 299, annualPriceIls: 2990 });
    expect(priceOf("basic")).toBe(99);
    expect(priceOf("basic", "annual")).toBe(990);
    expect(priceOf("pro", "annual")).toBe(2990);
    expect(annualPerMonthIls("basic")).toBe(82.5);
    expect(annualPerMonthIls("pro")).toBe(249.17);
    expect(annualSavingIls("basic")).toBe(198);
    expect(annualSavingIls("pro")).toBe(598);
    expect(planNameHe("basic")).toBe("בסיסי");
    expect(planNameHe("basic", "annual")).toBe("בסיסי שנתי");
    expect(planNameHe("pro", "annual")).toBe("פרו שנתי");
  });

  it("the cycle of a row: monthly unless stored annual; the renewal follows a scheduled change", () => {
    expect(isBillingCycle("annual")).toBe(true);
    expect(isBillingCycle("yearly")).toBe(false);
    expect(cycleOf(null)).toBe("monthly");
    expect(cycleOf({ billing_cycle: undefined })).toBe("monthly");
    expect(cycleOf({ billing_cycle: "annual" })).toBe("annual");
    expect(renewalCycleOf({ billing_cycle: "annual", scheduled_cycle: null })).toBe("annual");
    expect(renewalCycleOf({ billing_cycle: "annual", scheduled_cycle: "monthly" })).toBe("monthly");
  });

  it("a year on: the same date, 29.2 → 28.2; the inverse for the start of the cycle", () => {
    expect(addOneYear(new Date("2026-10-25T08:00:00Z")).toISOString()).toBe("2027-10-25T08:00:00.000Z");
    expect(addOneYear(new Date("2028-02-29T08:00:00Z")).toISOString()).toBe("2029-02-28T08:00:00.000Z");
    expect(addCycle(new Date("2026-01-31T08:00:00Z"), "monthly").toISOString()).toBe("2026-02-28T08:00:00.000Z");
    expect(addCycle(new Date("2026-01-31T08:00:00Z"), "annual").toISOString()).toBe("2027-01-31T08:00:00.000Z");
    expect(subtractOneYear(new Date("2027-10-25T08:00:00Z")).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(subtractOneYear(new Date("2029-02-28T08:00:00Z")).toISOString()).toBe("2028-02-28T08:00:00.000Z");
  });

  it("the full comparison on /pricing lists the annual price of both plans", () => {
    const row = planComparison()[0]!.rows.find((r) => r.id === "price_annual")!;
    expect(row.label).toBe("מחיר לשנה, חודשיים מתנה");
    expect(row.basic).toEqual({ kind: "text", text: "990 ₪" });
    expect(row.pro).toEqual({ kind: "text", text: "2,990 ₪" });
  });
});

describe("proration (lib/billing/money.ts)", () => {
  it("an annual cycle: whole days left (rounded up), over the year's days", () => {
    const end = new Date("2027-10-25T08:00:00Z");
    expect(prorate(end, new Date("2027-04-25T08:00:00Z"), "annual")).toEqual({ daysLeft: 183, cycleDays: 365, extraMs: 0 });
    expect(prorate(end, new Date("2027-04-25T08:00:00.001Z"), "annual")).toMatchObject({ daysLeft: 183 }); // today counts
    expect(prorate(end, new Date("2026-10-25T08:00:00Z"), "annual")).toMatchObject({ daysLeft: 365 }); // the first day: the whole year
    expect(prorate(end, new Date("2027-10-25T07:59:59Z"), "annual")).toMatchObject({ daysLeft: 1 });
    expect(prorate(end, end, "annual")).toBeNull(); // the renewal is due
  });

  it("mid-year basic → pro on annual: 2,000 ₪ × days left / days of the year, at several dates", () => {
    const end = new Date("2027-10-25T08:00:00Z");
    const at = (iso: string) => quoteUpgrade(end, new Date(iso), "annual")!;
    expect(at("2027-04-25T08:00:00Z")).toMatchObject({ amountIls: 1002.74, daysLeft: 183, cycleDays: 365, nextAmountIls: 2990 });
    expect(at("2027-04-25T08:00:00Z").vatIls).toBe(vatOf(1002.74));
    expect(at("2026-10-25T08:00:00Z")).toMatchObject({ amountIls: 2000, daysLeft: 365 });
    expect(at("2027-10-24T09:00:00Z")).toMatchObject({ amountIls: 5.48, daysLeft: 1 }); // 2000 / 365
    expect(at("2027-01-01T00:00:00Z")).toMatchObject({ daysLeft: 298, amountIls: 1632.88 });
    expect(at("2027-04-25T08:00:00Z").periodEnd.toISOString()).toBe("2027-10-25T08:00:00.000Z"); // the period end stays
    // an annual plan set to move to monthly: the next charge is pro's monthly price
    expect(quoteUpgrade(end, new Date("2027-04-25T08:00:00Z"), "annual", "monthly")).toMatchObject({ amountIls: 1002.74, nextAmountIls: 299 });
  });

  it("a leap year: the year that holds 29.2 has 366 days", () => {
    const end = new Date("2028-03-01T08:00:00Z"); // from 1.3.2027
    expect(prorate(end, new Date("2028-02-28T08:00:00Z"), "annual")).toEqual({ daysLeft: 2, cycleDays: 366, extraMs: 0 });
    expect(quoteUpgrade(end, new Date("2028-02-28T08:00:00Z"), "annual")).toMatchObject({ amountIls: 10.93, daysLeft: 2 }); // 2000 × 2 / 366
    expect(quoteUpgrade(end, new Date("2027-03-01T08:00:00Z"), "annual")).toMatchObject({ amountIls: 2000, daysLeft: 366 });
    // a year paid on 29.2 ends on 28.2: measured back from its end it is the 366-day year from 28.2, so on its first
    // day 365 of 366 days are left — the clamp errs a day in the customer's favour, never the other way
    const fromLeap = addOneYear(new Date("2028-02-29T08:00:00Z"));
    expect(prorate(fromLeap, new Date("2028-02-29T08:00:00Z"), "annual")).toEqual({ cycleDays: 366, daysLeft: 365, extraMs: 0 });
    expect(quoteUpgrade(fromLeap, new Date("2028-02-29T08:00:00Z"), "annual")!.amountIls).toBeLessThan(2000);
  });

  it("next to the clock changes of Israel (UTC throughout): whole days, no 23- or 25-hour day", () => {
    // summer time starts on Friday 26.3.2027 and ends on Sunday 31.10.2027; the charge times are stored in UTC
    const spring = new Date("2027-03-27T22:00:00Z");
    expect(prorate(spring, new Date("2027-03-25T22:00:00Z"), "monthly")).toEqual({ daysLeft: 2, cycleDays: 28, extraMs: 0 });
    expect(quoteUpgrade(spring, new Date("2027-03-25T22:00:00Z"))).toMatchObject({ amountIls: 14.29 }); // 200 × 2 / 28
    const autumn = new Date("2027-11-01T08:00:00Z");
    expect(prorate(autumn, new Date("2027-10-30T08:00:00Z"), "annual")).toEqual({ daysLeft: 2, cycleDays: 365, extraMs: 0 });
    expect(quoteUpgrade(autumn, new Date("2027-10-30T08:00:00Z"), "annual")).toMatchObject({ amountIls: 10.96 }); // 2000 × 2 / 365
    expect(quoteUpgrade(new Date("2026-10-26T08:00:00Z"), new Date("2026-10-25T07:00:00Z"))).toMatchObject({ daysLeft: 2 }); // 25 hours → 2 days
  });

  it("monthly → annual: the unused part of the month credited against the year; free days beyond the month carry over", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const q = quoteAnnualSwitch("basic", "2026-11-10T10:00:00Z", now)!;
    expect(q).toMatchObject({ daysLeft: 16, cycleDays: 31, creditIls: 51.1, amountIls: 938.9, annualPriceIls: 990 }); // 99 × 16 / 31
    expect(q.vatIls).toBe(vatOf(938.9));
    expect(q.newPeriodEnd.toISOString()).toBe("2027-10-25T10:00:00.000Z");
    expect(quoteAnnualSwitch("pro", "2026-11-10T10:00:00Z", now)).toMatchObject({ creditIls: 154.32, amountIls: 2835.68 }); // 299 × 16 / 31
    // a free month already granted (next charge 10.12 instead of 10.11): one paid month credited, 16 free days kept
    const pushed = quoteAnnualSwitch("basic", "2026-12-10T10:00:00Z", now)!;
    expect(pushed).toMatchObject({ daysLeft: 30, cycleDays: 30, creditIls: 99, amountIls: 891 });
    expect(pushed.newPeriodEnd.toISOString()).toBe("2027-11-10T10:00:00.000Z");
    expect(quoteAnnualSwitch("basic", "2026-10-25T10:00:00Z", now)).toBeNull(); // the renewal is due
  });
});

describe("the annual subscription (lib/billing/subscription.ts)", () => {
  it("the first annual payment: one charge of 990, the next a year later, the payment marked annual", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await s.db.createUser("dana@example.com");
    const r = await activateSubscription(s.db, u, { plan: "basic", cycle: "annual", transId: "T1", amountIls: 990, acode: null, token: TOKEN, tokef: "3112", invoiceUrl: null, raw: {} }, new Date("2026-10-25T08:00:00Z"));
    expect(r.firstTime).toBe(true);
    expect(r.subscription).toMatchObject({ plan: "basic", status: "active", billing_cycle: "annual", scheduled_cycle: null, next_charge_at: "2027-10-25T08:00:00.000Z" });
    expect(s.db.jobs.filter((j) => j.kind === "charge" && j.status === "queued").map((j) => j.run_at)).toEqual(["2027-10-25T08:00:00.000Z"]);
    expect((await s.db.listPayments(u.id, 5))[0]).toMatchObject({ amount_ils: 990, billing_cycle: "annual" });
    expect(s.db.audit.find((a) => a.action === "subscription.activate")).toMatchObject({ target: "basic:annual", result: "ok" });
    // the message allowance stays monthly: the same 750 as monthly basic
    expect(await s.db.countTrialMessage(u.id)).toBe(749);
  });

  it("renews once a year: 990 with the year on the invoice line, then the next year; nothing in between", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    expect(await chargeSubscription(s.db, s.hyp, u, new Date("2026-11-25T08:00:00Z"))).toMatchObject({ kind: "skipped" }); // a month on: not due
    expect(s.charges()).toHaveLength(0);
    const out = await chargeSubscription(s.db, s.hyp, u, new Date("2027-10-25T08:00:00Z"));
    expect(out).toMatchObject({ kind: "charged", amountIls: 990, plan: "basic", cycle: "annual", nextChargeAt: new Date("2028-10-25T08:00:00Z") });
    expect((s.charges()[0]!.args as { items: unknown[] }).items).toEqual([{ description: "מנוי בסיסי שנתי — 25.10.2027–25.10.2028", quantity: 1, price: 990 }]);
    expect(s.db.billingApprovals.find((a) => a.kind === "renewal")).toMatchObject({ status: "succeeded", amount_ils: 990, billing_cycle: "annual" });
    expect(s.db.payments.at(-1)).toMatchObject({ amount_ils: 990, billing_cycle: "annual" });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ billing_cycle: "annual", next_charge_at: "2028-10-25T08:00:00.000Z" });
  });

  it("pro → basic on annual waits for the renewal (no refund), then charges basic's annual price", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "pro", new Date("2026-10-25T08:00:00Z"));
    await s.db.upsertSubscription(u.id, { scheduled_plan: "basic" });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ plan: "pro" }); // pro until the end of the paid year
    const out = await chargeSubscription(s.db, s.hyp, u, new Date("2027-10-25T08:00:00Z"));
    expect(out).toMatchObject({ kind: "charged", plan: "basic", cycle: "annual", amountIls: 990 });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ plan: "basic", scheduled_plan: null, billing_cycle: "annual" });
  });

  it("annual → monthly waits for the renewal: then one month at the monthly price, and monthly from there", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    await s.db.upsertSubscription(u.id, { scheduled_cycle: "monthly" });
    const out = await chargeSubscription(s.db, s.hyp, u, new Date("2027-10-25T08:00:00Z"));
    expect(out).toMatchObject({ kind: "charged", plan: "basic", cycle: "monthly", amountIls: 99, nextChargeAt: new Date("2027-11-25T08:00:00Z") });
    expect((s.charges()[0]!.args as { items: unknown[] }).items).toEqual([{ description: "מנוי בסיסי — 25.10.2027–25.11.2027", quantity: 1, price: 99 }]);
    expect(await s.db.getSubscription(u.id)).toMatchObject({ billing_cycle: "monthly", scheduled_cycle: null });
    expect(s.db.payments.at(-1)).toMatchObject({ billing_cycle: "monthly" });
  });

  it("both changes at once (pro annual → basic monthly) at the renewal", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "pro", new Date("2026-10-25T08:00:00Z"));
    await s.db.upsertSubscription(u.id, { scheduled_plan: "basic", scheduled_cycle: "monthly" });
    expect(await chargeSubscription(s.db, s.hyp, u, new Date("2027-10-25T08:00:00Z"))).toMatchObject({ kind: "charged", plan: "basic", cycle: "monthly", amountIls: 99 });
  });

  it("a cancelled annual plan runs to the end of the paid year and is not charged again", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    await s.db.upsertSubscription(u.id, { status: "cancelled", cancelled_at: "2027-01-10T08:00:00.000Z" });
    const { effectivePlan } = await import("./plans");
    expect(effectivePlan(await s.db.getSubscription(u.id), new Date("2027-10-24T08:00:00Z"))).toBe("basic");
    expect(await chargeSubscription(s.db, s.hyp, u, new Date("2027-10-25T08:00:00Z"))).toMatchObject({ kind: "skipped" });
    expect(s.charges()).toHaveLength(0);
    expect(effectivePlan(await s.db.getSubscription(u.id), new Date("2027-10-26T08:00:00Z"))).toBe("trial");
  });

  it("a declined annual charge: the same retries (days 3 / 5 / 7), past_due after day 7, the owner told ('חיוב שנתי')", async () => {
    const seen = captureOwnerAlerts();
    try {
      const s = setup(new Date("2026-10-25T08:00:00Z"));
      const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
      s.hyp.chargeOk = false;
      const due = new Date("2027-10-25T08:00:00Z");
      const day = (n: number) => new Date(due.getTime() + (n - 1) * DAY);
      expect(await chargeSubscription(s.db, s.hyp, u, day(1))).toMatchObject({ kind: "retry", failures: 1, retryAt: day(3) });
      expect(await chargeSubscription(s.db, s.hyp, u, day(3))).toMatchObject({ kind: "retry", failures: 2, retryAt: day(5) });
      expect(await chargeSubscription(s.db, s.hyp, u, day(5))).toMatchObject({ kind: "retry", failures: 3, retryAt: day(7) });
      expect((await s.db.getSubscription(u.id))!.status).toBe("active");
      expect(await chargeSubscription(s.db, s.hyp, u, day(7))).toMatchObject({ kind: "paused", failures: 4 });
      expect(await s.db.getSubscription(u.id)).toMatchObject({ status: "past_due", billing_cycle: "annual" });
      expect(s.charges().map((c) => (c.args as { amount: number }).amount)).toEqual([990, 990, 990, 990]); // never more, never twice a day
      const failed = seen.filter((x) => x.event.type === "payment_failed").map((x) => x.event as { amountIls: number; reason: string });
      expect(failed.length).toBeGreaterThan(0);
      expect(failed[0]).toMatchObject({ amountIls: 990, reason: expect.stringMatching(/^חיוב שנתי: /) });
    } finally {
      stopCapturingOwnerAlerts();
    }
  });
});

describe("the first annual payment through the pay page (lib/billing/service.ts)", () => {
  it("the HYP page: 990 ₪, the cycle in Order, the year on the invoice line", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await s.db.createUser("dana@example.com");
    await startPayment(s.ctx, u, "basic", "annual");
    expect(s.hyp.calls[0]!.args).toMatchObject({ Amount: 990, Order: `${u.id}:basic:annual`, heshDesc: "[0~מנוי בסיסי שנתי — שנה~1~990]" });
    await startPayment(s.ctx, u, "pro", "annual");
    expect(s.hyp.calls[1]!.args).toMatchObject({ Amount: 2990, Order: `${u.id}:pro:annual` });
    await startPayment(s.ctx, u, "basic");
    expect(s.hyp.calls[2]!.args).toMatchObject({ Amount: 99, Order: `${u.id}:basic` }); // monthly is unchanged
  });

  it("the redirect activates the annual cycle a year out and confirms it in WhatsApp (window: text + receipt)", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await s.db.createUser("dana@example.com");
    s.db.seedWaIdentity(u.id, PHONE);
    await s.db.insertMessage({ user_id: u.id, wa_message_id: "w1", direction: "in", text: "היי" });
    const r = await completePayment(s.ctx, `Id=501&CCode=0&Amount=990&Order=${u.id}%3Abasic%3Aannual&Sign=x`);
    expect(r).toMatchObject({ ok: true, plan: "basic", cycle: "annual", firstTime: true });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ billing_cycle: "annual", next_charge_at: "2027-10-25T08:00:00.000Z" });
    expect(s.wa.sent.map((x) => x.kind)).toEqual(["text", "document"]);
    expect(s.wa.sent[0]!.body).toContain("בסיסי שנתי");
    // outside the window: the annual success template
    const s2 = setup(new Date("2026-10-25T08:00:00Z"));
    const u2 = await s2.db.createUser("noa@example.com");
    s2.db.seedWaIdentity(u2.id, "+972501234568");
    await completePayment(s2.ctx, `Id=502&CCode=0&Amount=2990&Order=${u2.id}%3Apro%3Aannual&Sign=x`);
    expect(s2.wa.sent.map((x) => x.template?.name)).toEqual(["payment_success_annual"]);
  });

  it("an annual Order paid with less than the annual price is activated monthly, and audited", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await s.db.createUser("dana@example.com");
    const r = await completePayment(s.ctx, `Id=503&CCode=0&Amount=99&Order=${u.id}%3Abasic%3Aannual&Sign=x`);
    expect(r).toMatchObject({ ok: true, cycle: "monthly" });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ billing_cycle: "monthly", next_charge_at: "2026-11-25T08:00:00.000Z" });
    expect(s.db.audit.find((a) => a.action === "payment.amount_mismatch")).toMatchObject({ target: "503", result: "annual:99" });
    expect(await completePayment(s.ctx, `Id=504&CCode=0&Amount=99&Order=${u.id}%3Abasic%3Ayearly&Sign=x`)).toMatchObject({ ok: false, reason: "bad_order" });
    expect(await completePayment(s.ctx, `Id=505&CCode=0&Amount=99&Order=${u.id}%3Acard%3Aannual&Sign=x`)).toMatchObject({ ok: false, reason: "bad_order" });
  });
});

describe("basic → pro in the middle of an annual year (lib/billing/web-upgrade.ts)", () => {
  it("the prorated difference of the annual prices, once; pro at once, the year's end unchanged, the next charge 2,990", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    s.set(new Date("2027-04-25T08:00:00Z"));
    const v = await webUpgradeView(s.ctx, u, await s.db.getSubscription(u.id));
    if (v.kind !== "offer") throw new Error(JSON.stringify(v));
    expect(v.offer).toMatchObject({ amountIls: 1002.74, daysLeft: 183, cycle: "annual", nextAmountIls: 2990 });
    expect(verifyUpgradeOfferToken(v.offer.offerToken, { now: s.ctx.now() })).toMatchObject({ amountIls: 1002.74 });
    const [a, b] = await Promise.all([upgradeFromWeb(s.ctx, u, v.offer.offerToken), upgradeFromWeb(s.ctx, u, v.offer.offerToken)]);
    expect(a).toEqual(b);
    expect(s.charges()).toHaveLength(1);
    expect(s.charges()[0]!.args).toMatchObject({ amount: 1002.74, items: [{ description: "שדרוג למסלול פרו שנתי — יתרת התקופה עד 25.10.2027", quantity: 1, price: 1002.74 }] });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ plan: "pro", billing_cycle: "annual", next_charge_at: "2027-10-25T08:00:00.000Z" });
    expect(s.db.payments.at(-1)).toMatchObject({ amount_ils: 1002.74, billing_cycle: "annual" });
    if (a.kind !== "done") throw new Error(a.kind);
    expect(await webUpgradeResult(s.ctx, u.id, a.approvalId)).toMatchObject({ status: "succeeded", amountIls: 1002.74, nextAmountIls: 2990 });
    // the renewal a year from the start: pro's annual price
    expect(await chargeSubscription(s.db, s.hyp, (await s.db.getUser(u.id))!, new Date("2027-10-25T08:00:00Z"))).toMatchObject({ kind: "charged", plan: "pro", cycle: "annual", amountIls: 2990 });
  });
});

describe("monthly → annual from /account (lib/billing/annual-switch.ts)", () => {
  async function monthlyUser(s: ReturnType<typeof setup>, opts: { window?: boolean } = {}) {
    const u = await s.db.createUser(`dana-${randomUUID().slice(0, 8)}@example.com`);
    s.db.seedWaIdentity(u.id, PHONE);
    if (opts.window !== false) await s.db.insertMessage({ user_id: u.id, wa_message_id: `w-${u.id}`, direction: "in", text: "היי" });
    await activateSubscription(s.db, u, { plan: "basic", transId: "T0", amountIls: 99, acode: null, token: TOKEN, tokef: "3112", invoiceUrl: null, raw: {} }, new Date("2026-10-10T10:00:00Z"));
    return (await s.db.getUser(u.id))!;
  }

  it("the offer: the credit of the unused month, a year from today; one charge; annual from now", async () => {
    const s = setup(new Date("2026-10-25T10:00:00Z"));
    const u = await monthlyUser(s);
    const v = await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id));
    if (v.kind !== "offer") throw new Error(JSON.stringify(v));
    expect(v.offer).toMatchObject({ plan: "basic", amountIls: 938.9, creditIls: 51.1, annualPriceIls: 990, daysLeft: 16, last4: "4580" });
    expect(v.offer.newPeriodEnd.toISOString()).toBe("2027-10-25T10:00:00.000Z");
    // the signed offer is of its own purpose: an upgrade form cannot carry it, and the other way round
    expect(verifyAnnualOfferToken(v.offer.offerToken, { now: s.ctx.now() })).toMatchObject({ amountIls: 938.9 });
    expect(verifyUpgradeOfferToken(v.offer.offerToken, { now: s.ctx.now() })).toBeNull();
    expect(await upgradeFromWeb(s.ctx, u, v.offer.offerToken)).toEqual({ kind: "expired" });

    const [a, b] = await Promise.all([switchToAnnualFromWeb(s.ctx, u, v.offer.offerToken), switchToAnnualFromWeb(s.ctx, u, v.offer.offerToken)]);
    expect(a).toEqual(b);
    expect(s.charges()).toHaveLength(1);
    expect(s.charges()[0]!.args).toMatchObject({ amount: 938.9, items: [{ description: "מנוי בסיסי שנתי — 25.10.2026–25.10.2027, בקיזוז 51.10 ₪ מהחודש הנוכחי", quantity: 1, price: 938.9 }] });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ plan: "basic", billing_cycle: "annual", next_charge_at: "2027-10-25T10:00:00.000Z", charge_failures: 0 });
    expect(s.db.payments.at(-1)).toMatchObject({ amount_ils: 938.9, billing_cycle: "annual" });
    expect(s.db.audit.some((e) => e.action === "subscription.cycle_annual")).toBe(true);
    if (a.kind !== "done") throw new Error(a.kind);
    expect(await annualSwitchResult(s.ctx, u.id, a.approvalId)).toMatchObject({ status: "succeeded", amountIls: 938.9, nextAmountIls: 990 });
    // the same form again, later: the first result, no second charge
    s.set(new Date("2026-10-25T11:00:00Z"));
    expect(await switchToAnnualFromWeb(s.ctx, u, v.offer.offerToken)).toEqual(a);
    expect(s.charges()).toHaveLength(1);
    // WhatsApp: the confirmation, then the receipt
    expect(s.wa.sent.map((x) => x.kind)).toEqual(["text", "document"]);
    // now annual: no second offer
    expect(await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id))).toEqual({ kind: "not_monthly" });
  });

  it("a decline changes nothing (still monthly, the next charge as it was); blocked while a change is scheduled or a charge is overdue", async () => {
    const s = setup(new Date("2026-10-25T10:00:00Z"));
    const u = await monthlyUser(s);
    const v = await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id));
    if (v.kind !== "offer") throw new Error(JSON.stringify(v));
    s.hyp.chargeOk = false;
    const out = await switchToAnnualFromWeb(s.ctx, u, v.offer.offerToken);
    if (out.kind !== "done") throw new Error(out.kind);
    expect(await annualSwitchResult(s.ctx, u.id, out.approvalId)).toMatchObject({ status: "failed", failure: "declined" });
    expect(await s.db.getSubscription(u.id)).toMatchObject({ billing_cycle: "monthly", next_charge_at: "2026-11-10T10:00:00.000Z", charge_failures: 0 });

    await s.db.upsertSubscription(u.id, { scheduled_plan: "basic" });
    expect(await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id))).toEqual({ kind: "blocked", reason: "scheduled" });
    await s.db.upsertSubscription(u.id, { scheduled_plan: null, charge_failures: 1 });
    expect(await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id))).toEqual({ kind: "blocked", reason: "settle" });
  });

  it("an offer priced before the cycle changed is refused, and nothing is charged", async () => {
    const s = setup(new Date("2026-10-25T10:00:00Z"));
    const u = await monthlyUser(s);
    const v = await annualSwitchView(s.ctx, u, await s.db.getSubscription(u.id));
    if (v.kind !== "offer") throw new Error(JSON.stringify(v));
    await s.db.upsertSubscription(u.id, { next_charge_at: "2026-12-10T10:00:00.000Z" }); // e.g. a free month just granted
    expect(await switchToAnnualFromWeb(s.ctx, u, v.offer.offerToken)).toEqual({ kind: "changed" });
    expect(s.charges()).toHaveLength(0);
  });
});

describe("the annual plan in WhatsApp (lib/billing/whatsapp.ts)", () => {
  it("[שדרוג] mid-year: the prorated annual difference, the next charge per year; the press charges it once", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    s.set(new Date("2027-04-25T08:00:00Z"));
    await s.db.insertMessage({ user_id: u.id, wa_message_id: "w-up", direction: "in", text: "שדרוג" });
    s.wa.sent.length = 0;
    expect(await handleBillingCommand(s.ctx, u, PHONE, "שדרוג")).toBe(true);
    const offer = s.wa.sent.at(-1)!;
    expect(offer.body).toContain("לתשלום עכשיו: 1002.74 ₪");
    expect(offer.body).toContain("2990 ₪ לשנה");
    const a = s.db.billingApprovals.find((x) => x.kind === "upgrade")!;
    expect(a).toMatchObject({ amount_ils: 1002.74, billing_cycle: "annual" });
    await handleBillingButton(s.ctx, u, PHONE, `bill:ok:${a.id}`, "wamid.up1");
    await handleBillingButton(s.ctx, u, PHONE, `bill:ok:${a.id}`, "wamid.up2"); // a double press
    expect(s.charges()).toHaveLength(1);
    expect(await s.db.getSubscription(u.id)).toMatchObject({ plan: "pro", billing_cycle: "annual", next_charge_at: "2027-10-25T08:00:00.000Z" });
  });

  it("[ביטול מנוי] on annual: active to the end of the year, and the text says there is no refund", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "basic", new Date("2026-10-25T08:00:00Z"));
    s.set(new Date("2027-01-10T08:00:00Z"));
    await s.db.insertMessage({ user_id: u.id, wa_message_id: "w-c", direction: "in", text: "ביטול מנוי" });
    s.wa.sent.length = 0;
    await handleBillingCommand(s.ctx, u, PHONE, "ביטול מנוי");
    expect(s.wa.sent.at(-1)!.body).toContain("על החלק שנותר מהשנה אין החזר");
    const a = s.db.billingApprovals.find((x) => x.kind === "cancel")!;
    await handleBillingButton(s.ctx, u, PHONE, `bill:ok:${a.id}`, "wamid.c1");
    expect(await s.db.getSubscription(u.id)).toMatchObject({ status: "cancelled", billing_cycle: "annual", next_charge_at: "2027-10-25T08:00:00.000Z" });
    expect(s.charges()).toHaveLength(0);
  });

  it("[מה מצב המנוי] names the annual plan and its yearly price", async () => {
    const s = setup(new Date("2026-10-25T08:00:00Z"));
    const u = await annualUser(s, "pro", new Date("2026-10-25T08:00:00Z"));
    s.wa.sent.length = 0;
    await handleBillingCommand(s.ctx, u, PHONE, "מה מצב המנוי?");
    const body = s.wa.sent.at(-1)!.body;
    expect(body).toContain("פרו שנתי");
    expect(body).toContain("2990");
  });
});
