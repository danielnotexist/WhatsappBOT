import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpgradeOfferToken, verifyUpgradeOfferToken } from "@/lib/billing/links";
import { createPayLinkToken } from "@/lib/billing/pay-link";
import { activateSubscription } from "@/lib/billing/subscription";
import { webUpgradeView } from "@/lib/billing/web-upgrade";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { setHypForTests } from "@/lib/hyp";
import { MockHypGateway } from "@/lib/hyp/client";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { upgradeAction } from "./actions";

/**
 * [לשדרג עכשיו] on /pay/<token> (a server action — a POST): the pay token names the account, the signed offer must be
 * that account's, and the form's nonce is single-use. Runs against MemoryDb + the mock HYP gateway (no real charge).
 */
const h = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return { Redirect };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new h.Redirect(url);
  },
}));
vi.mock("@/lib/auth/current-user", () => ({ ensureDemoSessionUser: async () => undefined }));

let db: MemoryDb;
let hyp: MockHypGateway;
let wa: RecordingWaSender;

beforeEach(() => {
  process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
  db = new MemoryDb();
  hyp = new MockHypGateway("https://app.example.co.il");
  wa = new RecordingWaSender();
  setDbForTests(db);
  setHypForTests(hyp);
  setWaSenderForTests(wa);
});
afterEach(() => {
  setDbForTests(undefined);
  setHypForTests(undefined);
  setWaSenderForTests(undefined);
});

/** A basic plan paid 10 days ago with a saved card. */
async function basicUser(plan: "basic" | "pro" = "basic") {
  const user = await db.createUser(`web-${randomUUID().slice(0, 8)}@example.com`);
  db.seedWaIdentity(user.id, "+972501234567");
  await activateSubscription(db, user, { plan, transId: `T-${randomUUID().slice(0, 6)}`, amountIls: 99, acode: null, token: "1234567890123454580", tokef: "3012", invoiceUrl: null, raw: {} }, new Date(Date.now() - 10 * 86_400_000));
  const offer = async () => {
    const v = await webUpgradeView({ db, now: () => new Date() }, user, await db.getSubscription(user.id));
    if (v.kind !== "offer") throw new Error("no offer");
    return v.offer.offerToken;
  };
  return { user, token: createPayLinkToken(user.id), offer };
}

/** Submits the form and returns where the action redirected (path + query). */
async function submit(fields: Record<string, string>): Promise<{ path: string; upgrade: string | null; r: string | null; error: string | null }> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const thrown = await upgradeAction(fd).then(
    () => null,
    (e: unknown) => e,
  );
  if (!(thrown instanceof h.Redirect)) throw new Error(`expected a redirect, got ${String(thrown)}`);
  const url = new URL(thrown.url, "https://app.example");
  return { path: decodeURIComponent(url.pathname), upgrade: url.searchParams.get("upgrade"), r: url.searchParams.get("r"), error: url.searchParams.get("error") };
}

const charges = () => hyp.calls.filter((c) => c.method === "chargeToken");

describe("upgradeAction", () => {
  it("upgrades the token's own account: one charge, then the result page (?upgrade=<approval>)", async () => {
    const { user, token, offer } = await basicUser();
    const form = { token, offer: await offer() };
    const out = await submit(form);
    expect(out.path).toBe(`/pay/${token}`);
    expect(out.upgrade).toBe(verifyUpgradeOfferToken(form.offer, { now: new Date() })!.nonce);
    expect(charges()).toHaveLength(1);
    expect((await db.getSubscription(user.id))!.plan).toBe("pro");
    expect(wa.sent.some((s) => s.kind === "template" || s.kind === "text")).toBe(true);
  });

  it("is idempotent: the same form again (double click, refresh, back + resubmit) shows the first result, no second charge", async () => {
    const { token, offer } = await basicUser();
    const form = { token, offer: await offer() };
    const [a, b] = await Promise.all([submit(form), submit(form)]);
    const c = await submit(form);
    expect(new Set([a.upgrade, b.upgrade, c.upgrade]).size).toBe(1);
    expect(charges()).toHaveLength(1);
  });

  it("an invalid or expired pay link → back to the page (which explains), nothing charged", async () => {
    const { offer } = await basicUser();
    const out = await submit({ token: "not-a-token", offer: await offer() });
    expect(out).toMatchObject({ path: "/pay/not-a-token", upgrade: null, r: null });
    const { user } = await basicUser();
    const old = createPayLinkToken(user.id, { now: new Date(Date.now() - 8 * 86_400_000) });
    expect((await submit({ token: old, offer: await offer() })).upgrade).toBeNull();
    expect(charges()).toHaveLength(0);
  });

  it("an offer of another account, a missing or forged offer → ?r=expired, nothing charged on either account", async () => {
    const victim = await basicUser();
    const attacker = await basicUser();
    // the attacker's own pay link with the victim's offer, and the victim's link with the attacker's offer
    expect((await submit({ token: attacker.token, offer: await victim.offer() })).r).toBe("expired");
    expect((await submit({ token: victim.token, offer: await attacker.offer() })).r).toBe("expired");
    expect((await submit({ token: victim.token, offer: "" })).r).toBe("expired");
    expect((await submit({ token: victim.token, offer: "x.y" })).r).toBe("expired");
    expect(charges()).toHaveLength(0);
    for (const u of [victim, attacker]) expect((await db.getSubscription(u.user.id))!.plan).toBe("basic");
  });

  it("wrong state: already pro, or a cycle the offer was not priced for → ?r=changed, nothing charged", async () => {
    const pro = await basicUser("pro");
    const sub = (await db.getSubscription(pro.user.id))!;
    const offer = createUpgradeOfferToken(pro.user.id, { nonce: randomUUID(), amountIls: 120, periodEnd: new Date(sub.next_charge_at!), daysLeft: 20 });
    expect((await submit({ token: pro.token, offer })).r).toBe("changed");

    const basic = await basicUser();
    const form = { token: basic.token, offer: await basic.offer() };
    await db.upsertSubscription(basic.user.id, { next_charge_at: new Date(Date.now() + 40 * 86_400_000).toISOString() });
    expect((await submit(form)).r).toBe("changed");
    expect(charges()).toHaveLength(0);
  });

  it("another charge is open → ?r=busy; a decline → the result page with the failure; an unexpected error → ?r=error", async () => {
    const busy = await basicUser();
    await db.openRenewalCharge({ user_id: busy.user.id, plan: "basic", amount_ils: 99 });
    expect((await submit({ token: busy.token, offer: await busy.offer() })).r).toBe("busy");
    expect(charges()).toHaveLength(0);

    const declined = await basicUser();
    hyp.chargeScript.push("4");
    const out = await submit({ token: declined.token, offer: await declined.offer() });
    expect(out.upgrade).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.getBillingApproval(out.upgrade!)).toMatchObject({ status: "failed", ccode: "4" });
    expect((await db.getSubscription(declined.user.id))!.plan).toBe("basic");

    const broken = await basicUser();
    const form = { token: broken.token, offer: await broken.offer() };
    db.getSubscription = async () => {
      throw new Error("db down");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await submit(form)).r).toBe("error");
  });
});
