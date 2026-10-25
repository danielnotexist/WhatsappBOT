/**
 * "חבר מביא חבר" (round 3): the personal link, the sign-up through it, and the reward after the friend's first real
 * payment. The money part is one SQL function (referral_reward, migration 0018): exactly once per referral under a
 * row lock, the yearly cap counted under the referrer's lock, and the free month pushed onto next_charge_at only
 * when no charge of that user is open. Everything here is best effort around it: a failure never fails a payment.
 *
 *   /r/<code> ──cookie alze_ref (30 days)──▶ sign-up (lib/auth/otp.ts signIn, new users only) ──▶ referrals: pending
 *   the friend's first successful payment (lib/billing/service.ts completePayment)
 *       ──abuse check (same user / email / phone / card)──▶ rejected
 *       ──referral_reward()──▶ rewarded: a month each (pushed now, or a pending credit for the next payment)
 *
 * Anti-abuse: the referrer's own user, email (dots and +tags of Gmail folded), WhatsApp number or card never earns a
 * reward; a user is referred once (referred_user_id is unique); at most 12 rewarded months for a referrer in any 365
 * days (past it the friend still gets theirs); nothing on the trial or at sign-up — only after a real payment.
 */
import { ownerAlert } from "@/lib/admin/alerts";
import { billCopy } from "@/lib/copy/bot-billing";
import type { BillingContext } from "@/lib/billing/context";
import { deliver } from "@/lib/billing/notify";
import { loadCardToken, nextChargeRun, scheduleCharge } from "@/lib/billing/subscription";
import type { Db, ReferralRow, UserRow } from "@/lib/db/types";
import { dayLabelHe, localDateOf } from "@/lib/time/zoned";
import { referralRewardTemplate } from "@/lib/wa/templates";
import { generateReferralCode, normalizeReferralCode, referralLinkFor } from "./code";
import { REFERRAL_CAP_PER_YEAR, REFERRAL_FREE_DAYS } from "./constants";

const dayLabel = (d: Date | string) => dayLabelHe(localDateOf(new Date(d)));
const shortDate = (d: Date | string) => {
  const l = localDateOf(new Date(d));
  return `${l.day}.${l.month}.${l.year}`;
};

// ---------------------------------------------------------------------------------------------
// the code and the link
// ---------------------------------------------------------------------------------------------

/** The user's code (made on first use) and their link. */
export async function referralLinkOf(db: Db, userId: string, appUrl: string): Promise<{ code: string; link: string }> {
  const row = await db.ensureReferralCode(userId, () => generateReferralCode());
  return { code: row.code, link: referralLinkFor(appUrl, row.code) };
}

// ---------------------------------------------------------------------------------------------
// anti-abuse
// ---------------------------------------------------------------------------------------------

/**
 * One mailbox, one key: lower-case, the +tag dropped, and for Gmail the dots too (dana.levi+x@gmail.com and
 * danalevi@googlemail.com are the same person). Used only to compare two addresses.
 */
export function emailIdentity(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  const base = local.split("+")[0] ?? "";
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  return `${gmail ? base.replaceAll(".", "") : base}@${gmail ? "gmail.com" : domain}`;
}

export type AbuseReason = "self" | "same_email" | "same_phone" | "same_card";

/** Why the friend is the referrer under another account (null = a real friend). Checked again at reward time. */
export async function abuseReason(db: Db, referrer: UserRow, referred: UserRow): Promise<AbuseReason | null> {
  if (referrer.id === referred.id) return "self";
  if (emailIdentity(referrer.email) === emailIdentity(referred.email)) return "same_email";
  // every number either account ever linked (also unlinked / blocked ones)
  const [a, b] = await Promise.all([db.listWaIdentities(referrer.id), db.listWaIdentities(referred.id)]);
  const phones = new Set(a.map((w) => w.phone_e164));
  if (b.some((w) => phones.has(w.phone_e164))) return "same_phone";
  // the saved card (a HYP token is per card): the same card on both accounts
  const [ca, cb] = await Promise.all([loadCardToken(db, referrer.id).catch(() => null), loadCardToken(db, referred.id).catch(() => null)]);
  if (ca && cb && ca.token === cb.token) return "same_card";
  return null;
}

// ---------------------------------------------------------------------------------------------
// sign-up
// ---------------------------------------------------------------------------------------------

/**
 * A new user signed up with the alze_ref cookie (lib/auth/otp.ts signIn): the referral, as pending. An unknown code,
 * the user's own code, or a user referred before → nothing. The same email → recorded as rejected. Never throws.
 */
export async function attachReferralOnSignup(db: Db, user: UserRow, rawCode: unknown): Promise<ReferralRow | null> {
  try {
    const code = normalizeReferralCode(rawCode);
    if (!code) return null;
    const owner = await db.findReferralCode(code);
    if (!owner || owner.user_id === user.id) return null;
    const referrer = await db.getUser(owner.user_id);
    if (!referrer) return null;
    const sameEmail = emailIdentity(referrer.email) === emailIdentity(user.email);
    const row = await db.createReferral({ referrer_id: referrer.id, referred_user_id: user.id, code, status: sameEmail ? "rejected" : "pending", reason: sameEmail ? "same_email" : null });
    if (row) await db.addAudit({ user_id: user.id, action: sameEmail ? "referral.reject" : "referral.attach", target: referrer.id, result: sameEmail ? "same_email" : "pending" });
    return row;
  } catch (e) {
    console.warn("[referrals] not attached:", (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// the reward
// ---------------------------------------------------------------------------------------------

export type RewardOutcome =
  | { kind: "none" }
  | { kind: "rejected"; reason: AbuseReason }
  | { kind: "rewarded"; referral: ReferralRow; referrer: UserRow; referrerNextChargeAt: Date | null; referredNextChargeAt: Date | null };

/** The charge job follows next_charge_at after a push (an active subscription only: a cancelled one has no job). */
async function reschedule(db: Db, userId: string, now: Date): Promise<void> {
  const sub = await db.getSubscription(userId);
  if (sub?.status !== "active" || sub.cancelled_at) return;
  const run = nextChargeRun(sub, now);
  if (run) await scheduleCharge(db, userId, run, `referral:${run.getTime()}`);
}

/**
 * After the referred user's FIRST successful real payment (completePayment, firstTime): the abuse check, then
 * referral_reward() — once, whatever the retries or parallel redirects — the audit (`referral.reward`) on both
 * accounts and an information alert to the owner. The WhatsApp messages are announceReward(), after the payment's own
 * confirmation. Never throws.
 */
export async function rewardReferralAfterFirstPayment(ctx: BillingContext, referred: UserRow, paymentId: string | null): Promise<RewardOutcome> {
  try {
    const ref = await ctx.db.getReferralOf(referred.id);
    if (!ref || ref.status !== "pending") return { kind: "none" };
    const referrer = await ctx.db.getUser(ref.referrer_id);
    if (!referrer) return { kind: "none" };
    const reason = await abuseReason(ctx.db, referrer, referred);
    if (reason) {
      if (await ctx.db.rejectReferral(referred.id, reason)) await ctx.db.addAudit({ user_id: referred.id, action: "referral.reject", target: referrer.id, result: reason });
      return { kind: "rejected", reason };
    }
    const r = await ctx.db.rewardReferral(referred.id, { paymentId, days: REFERRAL_FREE_DAYS, cap: REFERRAL_CAP_PER_YEAR });
    if (r.result !== "rewarded" || !r.referral) return { kind: "none" }; // a parallel call gave it already
    const now = ctx.now();
    const row = r.referral;
    if (row.referrer_reward === "applied") await reschedule(ctx.db, referrer.id, now);
    if (row.referred_reward === "applied") await reschedule(ctx.db, referred.id, now);
    await ctx.db.addAudit({ user_id: referrer.id, action: "referral.reward", target: referred.id, result: `referrer:${row.referrer_reward}` });
    await ctx.db.addAudit({ user_id: referred.id, action: "referral.reward", target: referrer.id, result: `referred:${row.referred_reward}` });
    ownerAlert(
      {
        type: "referral",
        referralId: row.id,
        referrerId: referrer.id,
        referrerEmail: referrer.email,
        referredId: referred.id,
        referredEmail: referred.email,
        referrerReward: row.referrer_reward ?? "pending",
        referredReward: row.referred_reward === "applied" ? "applied" : "pending",
      },
      { db: ctx.db },
    );
    return { kind: "rewarded", referral: row, referrer, referrerNextChargeAt: r.referrerNextChargeAt ? new Date(r.referrerNextChargeAt) : null, referredNextChargeAt: r.referredNextChargeAt ? new Date(r.referredNextChargeAt) : null };
  } catch (e) {
    console.error(`[referrals] the reward of ${referred.id} failed:`, (e as Error).message);
    return { kind: "none" };
  }
}

/**
 * The reward in WhatsApp, to both: inside the 24-hour window the text, outside it the `referral_reward` template
 * (a free month on the subscription). A referrer whose month waits for a paid subscription gets the text only
 * (nothing changed on the subscription yet; the credit is announced when it is applied). Never throws.
 */
export async function announceReward(ctx: BillingContext, referred: UserRow, out: RewardOutcome): Promise<void> {
  if (out.kind !== "rewarded") return;
  const row = out.referral;
  if (row.referred_reward === "applied" && out.referredNextChargeAt) {
    await deliver(ctx, referred, { text: billCopy["bill.referral_reward_referred"]({ nextDate: dayLabel(out.referredNextChargeAt) }), template: referralRewardTemplate({ nextCharge: shortDate(out.referredNextChargeAt) }) });
  }
  if (row.referrer_reward === "applied" && out.referrerNextChargeAt) {
    await deliver(ctx, out.referrer, { text: billCopy["bill.referral_reward_referrer"]({ nextDate: dayLabel(out.referrerNextChargeAt) }), template: referralRewardTemplate({ nextCharge: shortDate(out.referrerNextChargeAt) }) });
  } else if (row.referrer_reward === "pending") {
    await deliver(ctx, out.referrer, { text: billCopy["bill.referral_reward_pending"]() });
  }
}

/** A pending credit that a charge just applied (lib/billing/subscription.ts applyPendingCredit), told in WhatsApp. */
export async function announceCredit(ctx: BillingContext, user: UserRow, nextChargeAt: Date): Promise<void> {
  await deliver(ctx, user, { text: billCopy["bill.referral_credit_applied"]({ nextDate: dayLabel(nextChargeAt) }), template: referralRewardTemplate({ nextCharge: shortDate(nextChargeAt) }) });
}

// ---------------------------------------------------------------------------------------------
// the personal area: the counters
// ---------------------------------------------------------------------------------------------

export interface ReferralStats {
  /** signed up through the link (rejected self-referrals not counted) */
  joined: number;
  /** of them, paid (rewarded) */
  paid: number;
  /** free months this user earned as a referrer (on the subscription or waiting), plus their own as a friend */
  monthsEarned: number;
  /** of them, waiting for a paid subscription */
  monthsPending: number;
}

export function referralStats(userId: string, brought: readonly ReferralRow[], own: ReferralRow | null): ReferralStats {
  const real = brought.filter((r) => r.referrer_id === userId && r.status !== "rejected");
  const paid = real.filter((r) => r.status === "rewarded");
  const earned = paid.filter((r) => r.referrer_reward === "applied" || r.referrer_reward === "pending");
  const ownMonth = own && own.status === "rewarded" && own.referred_user_id === userId ? [own.referred_reward] : [];
  const states = [...earned.map((r) => r.referrer_reward), ...ownMonth];
  return { joined: real.length, paid: paid.length, monthsEarned: states.length, monthsPending: states.filter((s) => s === "pending").length };
}
