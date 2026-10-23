import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { billingCtxOf } from "@/lib/bot/billing";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import type { BillingApprovalRow } from "@/lib/db/types";
import { MockHypGateway } from "@/lib/hyp/client";
import { executeClaimedCharge, quoteFor, savedCard, stateOf } from "./one-tap";
import { PLANS } from "./plans";
import { activateSubscription } from "./subscription";
import { upgradeFromWeb, webUpgradeView } from "./web-upgrade";

/**
 * The one charge code (executeClaimedCharge) behind both callers: a [שדרוג עכשיו] press in WhatsApp and the pay
 * page's [לשדרג עכשיו]. Same quote, same HYP request, same subscription change, same audit, same confirmation text.
 */

const PHONE = "+972501234567";
const TOKEN = "1234567890123454580";

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
});

/** A basic plan from 10.10 (next charge 10.11), the harness clock on 20.10 08:00Z, a linked number, the window open. */
async function basicUser() {
  const h = makeHarness();
  const hyp = new MockHypGateway("https://app.example.co.il");
  h.ctx.hyp = () => hyp;
  const created = await h.db.createUser(`dana-${randomUUID().slice(0, 8)}@example.com`);
  await h.db.mergeUserProfile(created.id, { onboarding: { step: "done", startedAt: "x" } });
  await h.db.updateUserProfile(created.id, { name: "דנה לוי" });
  h.db.seedWaIdentity(created.id, PHONE);
  await activateSubscription(h.db, created, { plan: "basic", transId: "T0", amountIls: 99, acode: null, token: TOKEN, tokef: "3012", invoiceUrl: null, raw: {} }, new Date("2026-10-10T08:00:00Z"));
  await h.db.insertMessage({ user_id: created.id, wa_message_id: "w0", direction: "in", text: "היי" });
  const user = (await h.db.getUser(created.id))!;
  const billing = billingCtxOf(h.ctx);
  return { h, hyp, user, billing };
}

/** The parts of a charge that must not depend on the channel (ids and the approving press aside). */
async function footprint(x: Awaited<ReturnType<typeof basicUser>>) {
  const charge = x.hyp.calls.filter((c) => c.method === "chargeToken").map((c) => c.args as Record<string, unknown>);
  const sub = (await x.h.db.getSubscription(x.user.id))!;
  const approval = x.h.db.billingApprovals.find((a) => a.kind === "upgrade" && a.status === "succeeded")!;
  return {
    charges: charge.map(({ order, info, email, ...rest }) => ({ ...rest, orderIsApproval: order === approval.id, info: String(info).replace(approval.id, "<id>"), email: Boolean(email) })),
    sub: { plan: sub.plan, status: sub.status, next_charge_at: sub.next_charge_at, scheduled_plan: sub.scheduled_plan, charge_failures: sub.charge_failures },
    approval: { kind: approval.kind, plan: approval.plan, amount_ils: approval.amount_ils, status: approval.status, ccode: approval.ccode, item: approval.details.item, period_end: approval.details.period_end },
    payments: x.h.db.payments.filter((p) => p.approval_id).map((p) => ({ amount_ils: p.amount_ils, ccode: p.ccode, approval: p.approval_id === approval.id })),
    audit: x.h.db.audit.filter((a) => a.action === "subscription.upgrade").map((a) => ({ action: a.action, result: a.result, target: a.target === approval.id })),
    confirmation: x.h.wa.sent.filter((s) => s.kind === "text" && s.body?.startsWith("שודרג.")).map((s) => s.body),
    receipt: x.h.wa.sent.filter((s) => s.kind === "document").map((s) => s.body),
  };
}

describe("one charge code for both callers (executeClaimedCharge)", () => {
  it("a WhatsApp press and the pay page's button leave the same footprint", async () => {
    const chat = await basicUser();
    await processInbound(chat.h.ctx, chat.h.inbound("שדרוג"));
    const press = chat.h.wa.sent.findLast((s) => s.kind === "buttons")!.buttons!.find((b) => b.id.startsWith("bill:ok:"))!.id;
    await processInbound(chat.h.ctx, chat.h.button(press, "שדרוג עכשיו"));

    const web = await basicUser();
    const view = await webUpgradeView(web.billing, web.user, await web.h.db.getSubscription(web.user.id));
    if (view.kind !== "offer") throw new Error("no offer");
    await upgradeFromWeb(web.billing, web.user, view.offer.offerToken);

    const a = await footprint(chat);
    const b = await footprint(web);
    expect(a.charges).toHaveLength(1);
    expect(a.charges[0]).toMatchObject({ amount: 135.48, orderIsApproval: true, info: "upgrade:<id>" });
    expect(b).toEqual(a);
    expect(a.sub).toEqual({ plan: "pro", status: "active", next_charge_at: "2026-11-10T08:00:00.000Z", scheduled_plan: null, charge_failures: 0 });
    expect(a.confirmation).toHaveLength(1);
    expect(a.receipt).toEqual(["קבלה — 135.48 ₪, 20.10.2026"]);
    // the press differs: a wamid in the chat, the form's nonce on the web
    expect(chat.h.db.audit.find((e) => e.action === "subscription.upgrade")!.approved_by_msg_id).toMatch(/^wamid\./);
    expect(web.h.db.audit.find((e) => e.action === "subscription.upgrade")!.approved_by_msg_id).toMatch(/^web:[0-9a-f-]{36}$/);
  });

  it("a claimed approval that no longer fits the subscription is never charged (stale), and neither is one without a usable card", async () => {
    const x = await basicUser();
    const now = x.billing.now();
    const card = (await savedCard(x.billing, x.user.id))!;
    const q = quoteFor("upgrade", stateOf(await x.h.db.getSubscription(x.user.id), now), now, card.last4)!;
    const open = async (details: Record<string, unknown>): Promise<BillingApprovalRow> => (await x.h.db.openWebCharge({ id: randomUUID(), user_id: x.user.id, kind: "upgrade", plan: "pro", amount_ils: q.amountIls, details }))!;

    const otherCycle = await open({ ...q.details, period_end: "2026-12-10T08:00:00.000Z" });
    expect(await executeClaimedCharge(x.billing, x.user, otherCycle, `web:${otherCycle.id}`)).toEqual({ kind: "stale", reason: "another billing cycle" });
    expect(await x.h.db.getBillingApproval(otherCycle.id)).toMatchObject({ status: "failed", error: "stale: another billing cycle" });

    await x.h.db.upsertSubscription(x.user.id, { hyp_tokef: "2401" });
    const expired = await open(q.details);
    expect(await executeClaimedCharge(x.billing, x.user, expired, `web:${expired.id}`)).toEqual({ kind: "card_expired", last4: "4580" });
    await x.h.db.upsertSubscription(x.user.id, { hyp_token_enc: null, hyp_tokef: null });
    const noCard = await open(q.details);
    expect(await executeClaimedCharge(x.billing, x.user, noCard, `web:${noCard.id}`)).toEqual({ kind: "no_card" });

    expect(x.hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(0);
    expect((await x.h.db.getSubscription(x.user.id))!.plan).toBe("basic");
    // every one of them left the charge lock: the next charge is not blocked
    expect(x.h.db.billingApprovals.every((a) => a.status !== "processing")).toBe(true);
  });

  it("a declined charge reports the HYP failure kind and the card, and changes nothing", async () => {
    const x = await basicUser();
    x.hyp.chargeScript.push("4", "6");
    const now = x.billing.now();
    const q = quoteFor("upgrade", stateOf(await x.h.db.getSubscription(x.user.id), now), now, "4580")!;
    for (const [code, failure] of [
      ["4", "declined"],
      ["6", "card"],
    ] as const) {
      const a = (await x.h.db.openWebCharge({ id: randomUUID(), user_id: x.user.id, kind: "upgrade", plan: "pro", amount_ils: q.amountIls, details: q.details }))!;
      expect(await executeClaimedCharge(x.billing, x.user, a, `web:${a.id}`)).toMatchObject({ kind: "failed", ccode: code, failure, last4: "4580" });
    }
    expect(await x.h.db.getSubscription(x.user.id)).toMatchObject({ plan: "basic", charge_failures: 0 });
    expect(PLANS.basic.messages).toBe(750);
  });
});
