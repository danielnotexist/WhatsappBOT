import { describe, expect, it } from "vitest";
import { issueLinkToken, trialPhoneHash } from "@/lib/auth/link-token";
import { LINK } from "./context";
import { handleUnlinkedPhone as handleUnlinked } from "./linking";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";
import type { InboundMessage } from "@/lib/wa/types";

/** "כן, לקשר" on the confirm card: the button's id carries the code. */
const yes = (h: { inbound: (text: string, o?: Partial<InboundMessage>) => InboundMessage }, token: string, o: Partial<InboundMessage> = {}) =>
  h.inbound("כן, לקשר", { type: "button", reply: { id: `lk:yes:${token}`, title: "כן, לקשר" }, ...o });

describe("account linking", () => {
  it("points an unknown number to the site, then blocks after 3 bad tokens", async () => {
    const { ctx, wa, inbound, db } = makeHarness();
    await processInbound(ctx, inbound("היי"));
    expect(wa.texts[0]).toContain("ההרשמה לוקחת כדקה");
    expect(wa.texts[0]).toContain("https://app.example.co.il/start");
    await processInbound(ctx, inbound("היי! לקשר את החשבון שלי: ZZZZ-9999"));
    expect(wa.texts[1]).toContain("לא מצאתי קוד כזה");
    await processInbound(ctx, inbound("QQQQ-2222"));
    expect(wa.texts[2]).toContain("לא מצאתי קוד כזה");
    await processInbound(ctx, inbound("RRRR-3333"));
    expect(wa.texts).toHaveLength(3); // third bad token → blocked silently
    expect(await db.isPhoneBlocked("+972501234567")).toBe(true);
    await processInbound(ctx, inbound("עוד"));
    expect(wa.texts).toHaveLength(3);
    expect(LINK.maxTokenAttempts).toBe(3);
  });

  it("plain messages are never strikes: the pointer at most once an hour, and a redelivery counts once", async () => {
    const { ctx, wa, inbound, db, advance } = makeHarness();
    for (let i = 0; i < 5; i++) await processInbound(ctx, inbound("שלום"));
    expect(wa.texts).toHaveLength(1);
    expect(await db.isPhoneBlocked("+972501234567")).toBe(false);
    advance(LINK.pointerEveryMs + 1000);
    await processInbound(ctx, inbound("שלום שוב"));
    expect(wa.texts).toHaveLength(2);
    // the same bad-token delivery three times is one strike, not a block
    const bad = inbound("ZZZZ-9999");
    for (let i = 0; i < 3; i++) await handleUnlinked(ctx, bad);
    expect(await db.isPhoneBlocked("+972501234567")).toBe(false);
  });

  it("after a 24-hour block runs out the strikes start over", async () => {
    const { ctx, wa, inbound, db, advance } = makeHarness();
    for (const t of ["AAAA-2222", "BBBB-3333", "CCCC-4444"]) await processInbound(ctx, inbound(t));
    expect(await db.isPhoneBlocked("+972501234567")).toBe(true);
    advance(LINK.blockMs + 1000);
    await processInbound(ctx, inbound("DDDD-5555"));
    expect(await db.isPhoneBlocked("+972501234567")).toBe(false);
    expect(wa.texts.at(-1)).toContain("לא מצאתי קוד כזה");
  });

  it("a code from a phone first names the account and asks; it links only on 'כן, לקשר', then welcomes and starts onboarding", async () => {
    const h = makeHarness();
    const { ctx, wa, inbound, db } = h;
    const user = await db.createUser("dana@example.com");
    await db.updateUserProfile(user.id, { name: "דנה" });
    const { token } = await issueLinkToken(db, user.id, ctx.now());
    expect(db.linkTokens.some((t) => JSON.stringify(t).includes(token))).toBe(false); // only its HMAC is stored
    const ask = await processInbound(ctx, inbound(`היי! לקשר את החשבון שלי: ${token}`));
    expect(ask.note).toBe("link confirm");
    expect(wa.sent[0]!.body).toContain("הקוד הזה שייך לחשבון d***@example.com");
    expect(wa.sent[0]!.buttons!.map((b) => b.id)).toEqual([`lk:yes:${token}`, "lk:no"]);
    expect(await db.findWaIdentityByPhone("+972501234567")).toBeNull(); // nothing linked, nothing consumed yet
    expect(db.linkTokens[0]!.used_at).toBeNull();
    wa.sent.length = 0;
    const r = await processInbound(ctx, yes(h, token));
    expect(r.note).toBe("linked");
    expect(wa.texts[0]).toBe("החשבון מקושר. מעכשיו אפשר לכתוב לי כאן.");
    expect(wa.texts[1]).toContain("שלום דנה");
    expect(wa.texts[1]).toContain("רואה רק מה ששולחים לי כאן");
    expect(wa.sent[1]!.buttons!.map((b) => b.id)).toEqual(["onb:tour", "onb:start"]);
    expect((await db.findWaIdentityByPhone("+972501234567"))?.user_id).toBe(user.id);
    expect(db.linkTokens[0]!.used_at).toBeTruthy();
    expect(((await db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("welcome");
    // the same token again (already linked number) is now a normal message for the linked user
    await processInbound(ctx, inbound(`היי! לקשר את החשבון שלי: ${token}`));
    expect(wa.texts.filter((t) => t.includes("החשבון מקושר"))).toHaveLength(1);
  });

  it("'לא לקשר' links nothing and keeps the code unused (someone else's wa.me link)", async () => {
    const h = makeHarness();
    const attacker = await h.db.createUser("attacker@example.com");
    const { token } = await issueLinkToken(h.db, attacker.id, h.ctx.now());
    await processInbound(h.ctx, h.inbound(`היי עלזה! אפשר לקשר את החשבון שלי (${token})`));
    expect(h.wa.sent[0]!.body).toContain("a***@example.com");
    const r = await processInbound(h.ctx, h.inbound("לא לקשר", { type: "button", reply: { id: "lk:no", title: "לא לקשר" } }));
    expect(r.note).toBe("link declined");
    expect(h.wa.texts.at(-1)).toContain("המספר לא קושר");
    expect(await h.db.findWaIdentityByPhone("+972501234567")).toBeNull();
    expect(await h.db.listWaIdentities(attacker.id)).toEqual([]);
    // a forged confirm id with a wrong code is a strike like any bad code
    await processInbound(h.ctx, yes(h, "ZZZZ-9999"));
    expect(h.wa.texts.at(-1)).toContain("לא מצאתי קוד כזה");
  });

  it("rejects expired tokens and a second phone for the same account", async () => {
    const h = makeHarness();
    const { ctx, wa, inbound, db, advance } = h;
    const user = await db.createUser("dana@example.com");
    const first = await issueLinkToken(db, user.id, ctx.now());
    advance(16 * 60_000);
    await processInbound(ctx, inbound(first.token));
    expect(wa.texts[0]).toContain("כבר לא בתוקף");

    db.seedWaIdentity(user.id, "+972509999999");
    const second = await issueLinkToken(db, user.id, ctx.now());
    await processInbound(ctx, inbound(second.token));
    await processInbound(ctx, yes(h, second.token));
    expect(wa.texts.at(-1)).toContain("כבר מקושר למספר אחר (972-***-9999)");
    // a code that expires between the card and the press
    const third = await issueLinkToken(db, (await db.createUser("x@example.com")).id, ctx.now());
    await processInbound(ctx, inbound(third.token, { from: "972503333333", fromE164: "+972503333333" }));
    advance(16 * 60_000);
    await processInbound(ctx, yes(h, third.token, { from: "972503333333", fromE164: "+972503333333" }));
    expect(wa.texts.at(-1)).toContain("כבר לא בתוקף");
  });

  it("one token sent from two phones at once links one phone only", async () => {
    const h = makeHarness();
    const { ctx, db } = h;
    const user = await db.createUser("dana@example.com");
    const { token } = await issueLinkToken(db, user.id, ctx.now());
    const a = yes(h, token, { from: "972501111111", fromE164: "+972501111111" });
    const b = yes(h, token, { from: "972502222222", fromE164: "+972502222222" });
    const [ra, rb] = await Promise.all([handleUnlinked(ctx, a), handleUnlinked(ctx, b)]);
    expect([ra.note, rb.note].filter((n) => n.startsWith("linked"))).toHaveLength(1);
    expect((await db.listWaIdentities(user.id)).filter((w) => w.status !== "unlinked")).toHaveLength(1);
  });

  it("a phone that already had a trial on another account gives a new account no second trial", async () => {
    const h = makeHarness();
    const { ctx, db } = h;
    const first = await db.createUser("me+1@example.com");
    await processInbound(ctx, yes(h, (await issueLinkToken(db, first.id, ctx.now())).token));
    expect(db.trialPhones.get(trialPhoneHash("+972501234567"))).toBe(first.id);
    const mine = (await db.listWaIdentities(first.id))[0]!;
    await db.unlinkWaIdentity(first.id, mine.id);

    const second = await db.createUser("me+2@example.com");
    const r = await processInbound(ctx, yes(h, (await issueLinkToken(db, second.id, ctx.now())).token));
    expect(r.note).toBe("linked (trial already used on this phone)");
    expect(await db.countTrialMessage(second.id)).toBe(-1);
    expect(await db.countTrialMessage(first.id)).toBeGreaterThanOrEqual(0);
  });
});
