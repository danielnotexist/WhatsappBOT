import { describe, expect, it } from "vitest";
import { issueLinkToken, trialPhoneHash } from "@/lib/auth/link-token";
import { LINK } from "./context";
import { handleUnlinkedPhone as handleUnlinked } from "./linking";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

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

  it("links a valid token once, welcomes with the trust line and starts onboarding", async () => {
    const { ctx, wa, inbound, db } = makeHarness();
    const user = await db.createUser("dana@example.com");
    await db.updateUserProfile(user.id, { name: "דנה" });
    const { token } = await issueLinkToken(db, user.id, ctx.now());
    expect(db.linkTokens.some((t) => JSON.stringify(t).includes(token))).toBe(false); // only its HMAC is stored
    const r = await processInbound(ctx, inbound(`היי! לקשר את החשבון שלי: ${token}`));
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

  it("rejects expired tokens and a second phone for the same account", async () => {
    const { ctx, wa, inbound, db, advance } = makeHarness();
    const user = await db.createUser("dana@example.com");
    const first = await issueLinkToken(db, user.id, ctx.now());
    advance(16 * 60_000);
    await processInbound(ctx, inbound(first.token));
    expect(wa.texts[0]).toContain("כבר לא בתוקף");

    db.seedWaIdentity(user.id, "+972509999999");
    const second = await issueLinkToken(db, user.id, ctx.now());
    await processInbound(ctx, inbound(second.token));
    expect(wa.texts[1]).toContain("כבר מקושר למספר אחר (972-***-9999)");
  });

  it("one token sent from two phones at once links one phone only", async () => {
    const { ctx, inbound, db } = makeHarness();
    const user = await db.createUser("dana@example.com");
    const { token } = await issueLinkToken(db, user.id, ctx.now());
    const a = inbound(token, { from: "972501111111", fromE164: "+972501111111" });
    const b = inbound(token, { from: "972502222222", fromE164: "+972502222222" });
    const [ra, rb] = await Promise.all([handleUnlinked(ctx, a), handleUnlinked(ctx, b)]);
    expect([ra.note, rb.note].filter((n) => n.startsWith("linked"))).toHaveLength(1);
    expect((await db.listWaIdentities(user.id)).filter((w) => w.status !== "unlinked")).toHaveLength(1);
  });

  it("a phone that already had a trial on another account gives a new account no second trial", async () => {
    const { ctx, inbound, db } = makeHarness();
    const first = await db.createUser("me+1@example.com");
    await processInbound(ctx, inbound((await issueLinkToken(db, first.id, ctx.now())).token));
    expect(db.trialPhones.get(trialPhoneHash("+972501234567"))).toBe(first.id);
    const mine = (await db.listWaIdentities(first.id))[0]!;
    await db.unlinkWaIdentity(first.id, mine.id);

    const second = await db.createUser("me+2@example.com");
    const r = await processInbound(ctx, inbound((await issueLinkToken(db, second.id, ctx.now())).token));
    expect(r.note).toBe("linked (trial already used on this phone)");
    expect(await db.countTrialMessage(second.id)).toBe(-1);
    expect(await db.countTrialMessage(first.id)).toBeGreaterThanOrEqual(0);
  });
});
