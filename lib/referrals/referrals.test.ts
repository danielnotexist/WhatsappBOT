import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIT_LABELS } from "@/lib/admin/audit-labels";
import { captureOwnerAlerts, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { sendOtp, verifyOtp, type OtpDeps } from "@/lib/auth/otp";
import type { BillingContext } from "@/lib/billing/context";
import { completePayment } from "@/lib/billing/service";
import { activateSubscription, chargeSubscription } from "@/lib/billing/subscription";
import { MemoryDb } from "@/lib/db/memory";
import type { UserRow } from "@/lib/db/types";
import { MockHypGateway } from "@/lib/hyp/client";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { RecordingWaSender } from "@/lib/wa/sender";
import { generateReferralCode, normalizeReferralCode, referralCodeFromCookieHeader, referralLinkFor } from "./code";
import { handleReferralKeyword, isReferralCommand } from "./commands";
import { REFERRAL_ALPHABET, REFERRAL_CAP_PER_YEAR, REFERRAL_CODE_LENGTH, REFERRAL_FREE_DAYS } from "./constants";
import { abuseReason, attachReferralOnSignup, emailIdentity, referralLinkOf, referralStats, rewardReferralAfterFirstPayment } from "./service";

/**
 * "חבר מביא חבר" (round 3): the code, the sign-up through the link, every anti-abuse rule, and the reward — only
 * after the friend's first real payment, exactly once (retries, parallel redirects), within the yearly cap, and the
 * pending month of a referrer without a paid plan applied at their first payment. Mock HYP, MemoryDb (which mirrors
 * referral_reward() of migration 0018; the SQL itself is tested in supabase/tests/annual_referrals.test.sql).
 */

const DAY = 86_400_000;
const T0 = new Date("2026-10-25T08:00:00Z");

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
});
afterEach(() => vi.restoreAllMocks());

function setup(start = T0) {
  let now = start;
  const db = new MemoryDb();
  db.now = () => now;
  const hyp = new MockHypGateway("https://app.example.co.il");
  const wa = new RecordingWaSender();
  const ctx: BillingContext = { db, hyp, wa, appUrl: "https://app.example.co.il", now: () => now };
  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  /** a first payment through the pay page (HYP mock redirect): `id` is the transaction (the mock card's digits follow it) */
  const pay = (u: UserRow, id: string, plan: "basic" | "pro" = "basic") => completePayment(ctx, `Id=${id}&CCode=0&Amount=${plan === "basic" ? 99 : 299}&Order=${u.id}%3A${plan}&Sign=x`);
  const next = async (u: UserRow) => (await db.getSubscription(u.id))?.next_charge_at ?? null;
  return { db, hyp, wa, ctx, advance, pay, next, now: () => now };
}

/** referrer A with a link; B signs up through it */
async function pair(s: ReturnType<typeof setup>, emails: [string, string] = ["dana@example.com", "noa@example.com"]) {
  const a = await s.db.createUser(emails[0]);
  const { code } = await referralLinkOf(s.db, a.id, s.ctx.appUrl);
  const b = await s.db.createUser(emails[1]);
  const row = await attachReferralOnSignup(s.db, b, code);
  return { a, b, code, row };
}

const plus = (iso: string | null, days: number) => new Date(Date.parse(iso!) + days * DAY).toISOString();

describe("the code (lib/referrals/code.ts)", () => {
  it("7 characters, no look-alikes (0/O, 1/I/L), upper-case; normalized on the way in", () => {
    expect(REFERRAL_CODE_LENGTH).toBe(7);
    for (const ch of "0O1IL") expect(REFERRAL_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) expect(generateReferralCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/);
    expect(generateReferralCode(() => 0)).toBe("AAAAAAA");
    expect(normalizeReferralCode("  bkprzwk ")).toBe("BKPRZWK");
    expect(normalizeReferralCode("BKPRZW0")).toBeNull(); // a zero is never ours
    expect(normalizeReferralCode("AB")).toBeNull();
    expect(normalizeReferralCode("<script>")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(referralLinkFor("https://app.example.co.il", "BKPRZWK")).toBe("https://app.example.co.il/r/BKPRZWK");
  });

  it("the cookie of /r/<code> is read from the Cookie header (and only a valid code)", () => {
    expect(referralCodeFromCookieHeader("a=1; alze_ref=BKPRZWK; b=2")).toBe("BKPRZWK");
    expect(referralCodeFromCookieHeader("alze_ref=bkprzwk")).toBe("BKPRZWK");
    expect(referralCodeFromCookieHeader("alze_ref=%3Cx%3E")).toBeNull();
    expect(referralCodeFromCookieHeader("alze_ref=%E0%A4%A")).toBeNull(); // a broken escape
    expect(referralCodeFromCookieHeader("xalze_ref=BKPRZWK")).toBeNull();
    expect(referralCodeFromCookieHeader(null)).toBeNull();
  });

  it("one code per user, made once; unique — a collision is retried with another", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const b = await db.createUser("b@example.com");
    const first = await db.ensureReferralCode(a.id, () => "AAAAAAA");
    expect(first.code).toBe("AAAAAAA");
    expect((await db.ensureReferralCode(a.id, () => "BBBBBBB")).code).toBe("AAAAAAA"); // the same code forever
    const seq = ["AAAAAAA", "AAAAAAA", "CCCCCCC"];
    expect((await db.ensureReferralCode(b.id, () => seq.shift()!)).code).toBe("CCCCCCC");
    expect((await db.findReferralCode("cccccccc".slice(0, 7)))!.user_id).toBe(b.id);
    await expect(db.ensureReferralCode((await db.createUser("c@example.com")).id, () => "AAAAAAA")).rejects.toThrow("unique");
    await expect(db.ensureReferralCode((await db.createUser("d@example.com")).id, () => "AB0")).rejects.toThrow("format");
    // a deleted user's code leads nowhere
    await db.deleteUser(a.id);
    expect(await db.findReferralCode("AAAAAAA")).toBeNull();
  });

  it("the link of a user: their code in a /r/ URL, the same every time", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const one = await referralLinkOf(db, a.id, "https://app.example.co.il");
    expect(one.link).toBe(`https://app.example.co.il/r/${one.code}`);
    expect(await referralLinkOf(db, a.id, "https://app.example.co.il")).toEqual(one);
  });
});

describe("the WhatsApp command (lib/referrals/commands.ts)", () => {
  it("the whole message is the command; a sentence that only mentions a friend goes to the assistant", () => {
    for (const t of ["חבר מביא חבר", "חבר מביא חבר בבקשה", "הזמנת חבר", "הזמנת חברה", "קישור הזמנה", "הקישור של חבר מביא חבר", "חבר מביא חבר?"]) expect(isReferralCommand(t), t).toBe(true);
    for (const t of ["החבר שלי מביא חבר לפגישה מחר", "מה זה חבר מביא חבר ואיך זה עובד אצלכם?", "", null]) expect(isReferralCommand(t), String(t)).toBe(false);
  });

  it("answers with the personal link and audits it", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@example.com");
    const said: string[] = [];
    expect(await handleReferralKeyword(db, a.id, "https://app.example.co.il", "חבר מביא חבר", async (t) => void said.push(t))).toBe(true);
    const { link } = await referralLinkOf(db, a.id, "https://app.example.co.il");
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(link);
    expect(db.audit.find((e) => e.action === "referral.link")).toMatchObject({ user_id: a.id, result: "whatsapp" });
    expect(await handleReferralKeyword(db, a.id, "https://app.example.co.il", "מה נשמע", async () => undefined)).toBe(false);
  });
});

describe("the sign-up through the link", () => {
  it("signIn attaches the cookie's code to a NEW user only; a login never does", async () => {
    const db = new MemoryDb();
    const mailer = new ConsoleMailer();
    const a = await db.createUser("dana@example.com");
    const { code } = await referralLinkOf(db, a.id, "https://x");
    const deps: OtpDeps = { db, mailer, limiter: new MemoryRateLimiter(), otpKey: randomBytes(32), referralCode: code };
    const login = async (email: string) => {
      expect((await sendOtp(deps, email, "1.1.1.1")).ok).toBe(true);
      return verifyOtp(deps, email, mailer.sent.at(-1)!.code, "1.1.1.1");
    };
    const r = await login("noa@example.com");
    expect(r).toMatchObject({ ok: true, isNewUser: true });
    const noa = (await db.findUserByEmail("noa@example.com"))!;
    expect(await db.getReferralOf(noa.id)).toMatchObject({ referrer_id: a.id, status: "pending", code });
    expect(db.audit.find((e) => e.action === "referral.attach")).toMatchObject({ user_id: noa.id, target: a.id, result: "pending" });
    // an existing user signing in with the cookie: nothing
    const old = await db.createUser("old@example.com");
    expect(await login("old@example.com")).toMatchObject({ ok: true, isNewUser: false });
    expect(await db.getReferralOf(old.id)).toBeNull();
    // the referrer signing in with their own cookie: nothing
    expect(await login("dana@example.com")).toMatchObject({ ok: true, isNewUser: false });
    expect(await db.listReferralsBy(a.id)).toHaveLength(1);
  });

  it("an unknown, malformed or own code attaches nothing; a user is referred only once", async () => {
    const s = setup();
    const { a, b, code, row } = await pair(s);
    expect(row).toMatchObject({ status: "pending" });
    expect(await attachReferralOnSignup(s.db, a, code)).toBeNull(); // own code
    const c = await s.db.createUser("c@example.com");
    expect(await attachReferralOnSignup(s.db, c, "ZZZZZZZ")).toBeNull();
    expect(await attachReferralOnSignup(s.db, c, "bad code")).toBeNull();
    expect(await attachReferralOnSignup(s.db, c, undefined)).toBeNull();
    // b again, through another referrer's link: still the first referral
    const other = await s.db.createUser("other@example.com");
    const { code: otherCode } = await referralLinkOf(s.db, other.id, s.ctx.appUrl);
    expect(await attachReferralOnSignup(s.db, b, otherCode)).toBeNull();
    expect((await s.db.getReferralOf(b.id))!.referrer_id).toBe(a.id);
  });

  it("the same mailbox under another address is rejected at once (Gmail dots, +tags, googlemail)", async () => {
    expect(emailIdentity("Dana.Levi+alze@Gmail.com")).toBe("danalevi@gmail.com");
    expect(emailIdentity("danalevi@googlemail.com")).toBe("danalevi@gmail.com");
    expect(emailIdentity("dana.levi+x@levi-law.co.il")).toBe("dana.levi@levi-law.co.il"); // dots matter outside Gmail
    const s = setup();
    const { row, b } = await pair(s, ["dana.levi@gmail.com", "DanaLevi+2@googlemail.com"]);
    expect(row).toMatchObject({ status: "rejected", reason: "same_email" });
    expect(s.db.audit.find((e) => e.action === "referral.reject")).toMatchObject({ user_id: b.id, result: "same_email" });
    await s.pay(b, "7001");
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ status: "rejected", rewarded_at: null });
  });
});

describe("the reward", () => {
  it("nothing at sign-up or on the trial; both get 30 days after the friend's first real payment", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await s.pay(a, "1001");
    const aNext = await s.next(a);
    expect(aNext).toBe("2026-11-25T08:00:00.000Z");
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ status: "pending" }); // a sign-up alone is nothing
    const seen = captureOwnerAlerts();
    try {
      s.advance(DAY);
      const r = await s.pay(b, "2002");
      expect(r).toMatchObject({ ok: true, firstTime: true });
      expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS)); // 25.12
      expect(await s.next(b)).toBe(plus("2026-11-26T08:00:00.000Z", REFERRAL_FREE_DAYS)); // a month after paying, + 30 days
      const ref = (await s.db.getReferralOf(b.id))!;
      expect(ref).toMatchObject({ status: "rewarded", referrer_reward: "applied", referred_reward: "applied" });
      expect(ref.payment_id).toBe(s.db.payments.find((p) => p.hyp_trans_id === "2002")!.id);
      // the charge jobs follow the new dates
      const queued = (id: string) => s.db.jobs.filter((j) => j.kind === "charge" && j.status === "queued" && j.user_id === id).map((j) => j.run_at);
      expect(queued(a.id)).toContain(plus(aNext, REFERRAL_FREE_DAYS));
      expect(queued(b.id)).toContain(plus("2026-11-26T08:00:00.000Z", REFERRAL_FREE_DAYS));
      // audit on both accounts, with labels for the admin timeline
      expect(s.db.audit.filter((e) => e.action === "referral.reward").map((e) => [e.user_id, e.result])).toEqual([
        [a.id, "referrer:applied"],
        [b.id, "referred:applied"],
      ]);
      expect(AUDIT_LABELS.has("referral.reward")).toBe(true);
      // the owner: one information alert
      expect(seen.filter((x) => x.event.type === "referral")).toHaveLength(1);
    } finally {
      stopCapturingOwnerAlerts();
    }
    // the referrer's next renewal charges the plan price once, on the pushed date
    const due = new Date(plus(aNext, REFERRAL_FREE_DAYS));
    expect(await chargeSubscription(s.db, s.hyp, (await s.db.getUser(a.id))!, new Date(due.getTime() - DAY))).toMatchObject({ kind: "skipped" });
    expect(await chargeSubscription(s.db, s.hyp, (await s.db.getUser(a.id))!, due)).toMatchObject({ kind: "charged", amountIls: 99 });
  });

  it("WhatsApp: both are told (inside the window the text, outside it the referral_reward template)", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    s.db.seedWaIdentity(a.id, "+972501111111");
    s.db.seedWaIdentity(b.id, "+972502222222");
    await s.pay(a, "1001");
    await s.db.insertMessage({ user_id: b.id, wa_message_id: "wb", direction: "in", text: "היי" }); // b's window is open
    s.wa.sent.length = 0;
    await s.pay(b, "2002");
    const toA = s.wa.sent.filter((m) => m.to === "+972501111111");
    const toB = s.wa.sent.filter((m) => m.to === "+972502222222");
    expect(toA.map((m) => m.template?.name)).toEqual(["referral_reward"]);
    expect(toB.some((m) => m.kind === "text" && (m.body ?? "").includes("חודש חינם"))).toBe(true);
  });

  it("exactly once: the same redirect again, a parallel redirect, and a direct second call", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await s.pay(a, "1001");
    const aNext = await s.next(a);
    await Promise.all([s.pay(b, "2002"), s.pay(b, "2002"), s.pay(b, "2002")]);
    await s.pay(b, "2002");
    expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS));
    const bNext = await s.next(b);
    expect(bNext).toBe(plus("2026-11-25T08:00:00.000Z", REFERRAL_FREE_DAYS));
    expect(await rewardReferralAfterFirstPayment(s.ctx, b, null)).toEqual({ kind: "none" });
    expect(await s.db.rewardReferral(b.id, { paymentId: null, days: 30, cap: 12 })).toMatchObject({ result: "none" });
    // the friend's later payments (a renewal, a second pay page) never reward again
    s.advance(40 * DAY);
    await s.pay(b, "2003");
    expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS));
    expect(s.db.audit.filter((e) => e.action === "referral.reward")).toHaveLength(2);
  });

  it("two concurrent rewards of the same friend: one wins, the other is a no-op", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await s.pay(a, "1001");
    await activateSubscription(s.db, b, { plan: "basic", transId: "B1", amountIls: 99, acode: null, token: "1111111111111114580", tokef: "3112", invoiceUrl: null, raw: {} }, s.now());
    const aNext = await s.next(a);
    const outs = await Promise.all([rewardReferralAfterFirstPayment(s.ctx, b, null), rewardReferralAfterFirstPayment(s.ctx, b, null), rewardReferralAfterFirstPayment(s.ctx, b, null)]);
    expect(outs.filter((o) => o.kind === "rewarded")).toHaveLength(1);
    expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS));
  });

  it("rejected: the same WhatsApp number (ever linked) on both accounts", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    s.db.seedWaIdentity(a.id, "+972501111111");
    const old = s.db.seedWaIdentity(b.id, "+972501111111");
    old.status = "unlinked"; // even a number unlinked since
    await s.pay(a, "1001");
    const aNext = await s.next(a);
    await s.pay(b, "2002");
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ status: "rejected", reason: "same_phone" });
    expect(await s.next(a)).toBe(aNext);
    expect(await s.next(b)).toBe("2026-11-25T08:00:00.000Z");
    expect(s.db.audit.find((e) => e.action === "referral.reject")).toMatchObject({ user_id: b.id, result: "same_phone" });
  });

  it("rejected: the same card (HYP token) on both accounts", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await s.pay(a, "1001");
    const aNext = await s.next(a);
    await s.pay(b, "x1001"); // the mock gives the same card for the same digits
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ status: "rejected", reason: "same_card" });
    expect(await s.next(a)).toBe(aNext);
  });

  it("rejected: the referrer themself (the check behind every path)", async () => {
    const s = setup();
    const a = await s.db.createUser("a@example.com");
    expect(await abuseReason(s.db, a, a)).toBe("self");
    const b = await s.db.createUser("b@example.com");
    expect(await abuseReason(s.db, a, b)).toBeNull();
    await expect(s.db.createReferral({ referrer_id: a.id, referred_user_id: a.id, code: "AAAAAAA", status: "pending" })).rejects.toThrow("not_self");
  });

  it("the cap: 12 rewarded months a referrer in any 365 days; past it the friend still gets theirs", async () => {
    const s = setup();
    const a = await s.db.createUser("dana@example.com");
    const { code } = await referralLinkOf(s.db, a.id, s.ctx.appUrl);
    await s.pay(a, "1001");
    // twelve friends rewarded before: one 400 days ago (out of the window), eleven in the last year
    for (let i = 0; i < REFERRAL_CAP_PER_YEAR; i++) {
      const f = await s.db.createUser(`f${i}@example.com`);
      const row = (await attachReferralOnSignup(s.db, f, code))!;
      const at = new Date(T0.getTime() - (i === 0 ? 400 : i * 20) * DAY).toISOString();
      Object.assign(s.db.referrals.find((r) => r.id === row.id)!, { status: "rewarded", rewarded_at: at, referrer_reward: "applied", referred_reward: "applied" });
    }
    const aNext = await s.next(a);
    // eleven inside the window → the 12th month is still given
    const twelfth = await s.db.createUser("twelve@example.com");
    await attachReferralOnSignup(s.db, twelfth, code);
    await s.pay(twelfth, "3012");
    expect(await s.db.getReferralOf(twelfth.id)).toMatchObject({ referrer_reward: "applied", referred_reward: "applied" });
    expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS));
    // the 13th: capped for the referrer, the friend still gets a month
    const thirteenth = await s.db.createUser("thirteen@example.com");
    await attachReferralOnSignup(s.db, thirteenth, code);
    s.advance(DAY);
    await s.pay(thirteenth, "3013");
    expect(await s.db.getReferralOf(thirteenth.id)).toMatchObject({ status: "rewarded", referrer_reward: "capped", referred_reward: "applied" });
    expect(await s.next(a)).toBe(plus(aNext, REFERRAL_FREE_DAYS)); // unchanged
    expect(await s.next(thirteenth)).toBe(plus("2026-11-26T08:00:00.000Z", REFERRAL_FREE_DAYS));
  });

  it("a referrer still on the trial: the month waits, and goes onto the subscription at their first payment", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    s.db.seedWaIdentity(a.id, "+972501111111");
    await s.pay(b, "2002");
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ status: "rewarded", referrer_reward: "pending", referred_reward: "applied" });
    expect(s.wa.sent.filter((m) => m.to === "+972501111111").map((m) => m.kind)).toEqual([]); // no window, no template for a pending month
    s.advance(10 * DAY);
    await s.pay(a, "1001");
    // a month after paying, + the 30 days waiting
    expect(await s.next(a)).toBe(plus("2026-12-04T08:00:00.000Z", REFERRAL_FREE_DAYS));
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ referrer_reward: "applied" });
    expect(s.db.audit.find((e) => e.action === "referral.credit_applied")).toMatchObject({ user_id: a.id });
    expect(s.wa.sent.filter((m) => m.to === "+972501111111").some((m) => m.template?.name === "referral_reward")).toBe(true);
    // applied once: the next payment adds nothing more
    expect(await s.db.applyReferralCredit(a.id, REFERRAL_FREE_DAYS)).toMatchObject({ applied: 0 });
  });

  it("a referrer with a charge in flight: the month waits and goes on with the next successful charge", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await s.pay(a, "1001");
    // a renewal of a is open (the lock is held) at the moment b pays
    const lock = await s.db.openRenewalCharge({ user_id: a.id, plan: "basic", amount_ils: 99, details: {}, billing_cycle: "monthly" });
    expect(lock).toBeTruthy();
    await s.pay(b, "2002");
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ referrer_reward: "pending", referred_reward: "applied" });
    await s.db.updateBillingApproval(lock!.id, { status: "failed", error: "test" });
    // the renewal on 25.11: charged, then the month pushes the next one to 25.12 + 30
    const out = await chargeSubscription(s.db, s.hyp, (await s.db.getUser(a.id))!, new Date("2026-11-25T08:00:00Z"));
    expect(out).toMatchObject({ kind: "charged", amountIls: 99 });
    expect(await s.next(a)).toBe(plus("2026-12-25T08:00:00.000Z", REFERRAL_FREE_DAYS));
    expect(await s.db.getReferralOf(b.id)).toMatchObject({ referrer_reward: "applied" });
  });

  it("an annual referrer gets the 30 days too", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    await completePayment(s.ctx, `Id=1001&CCode=0&Amount=990&Order=${a.id}%3Abasic%3Aannual&Sign=x`);
    expect(await s.next(a)).toBe("2027-10-25T08:00:00.000Z");
    await s.pay(b, "2002");
    expect(await s.next(a)).toBe(plus("2027-10-25T08:00:00.000Z", REFERRAL_FREE_DAYS));
  });

  it("the counters of the personal area", async () => {
    const s = setup();
    const { a, b } = await pair(s);
    const c = await s.db.createUser("c@example.com");
    await attachReferralOnSignup(s.db, c, (await referralLinkOf(s.db, a.id, s.ctx.appUrl)).code);
    await s.pay(a, "1001");
    await s.pay(b, "2002");
    const statsA = referralStats(a.id, await s.db.listReferralsBy(a.id), await s.db.getReferralOf(a.id));
    expect(statsA).toEqual({ joined: 2, paid: 1, monthsEarned: 1, monthsPending: 0 });
    const statsB = referralStats(b.id, await s.db.listReferralsBy(b.id), await s.db.getReferralOf(b.id));
    expect(statsB).toEqual({ joined: 0, paid: 0, monthsEarned: 1, monthsPending: 0 }); // their own month as the friend
  });
});
