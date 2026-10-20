import { describe, expect, it } from "vitest";
import { LINK } from "./context";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

describe("account linking", () => {
  it("points an unknown number to the site once, then blocks after 3 bad tokens", async () => {
    const { ctx, wa, inbound, db } = makeHarness();
    await processInbound(ctx, inbound("היי"));
    expect(wa.texts[0]).toContain("ההרשמה לוקחת כדקה");
    expect(wa.texts[0]).toContain("https://app.example.co.il/start");
    await processInbound(ctx, inbound("היי! לקשר את החשבון שלי: ZZZZ-9999"));
    expect(wa.texts[1]).toContain("לא מצאתי קוד כזה");
    await processInbound(ctx, inbound("QQQQ-2222"));
    expect(wa.texts).toHaveLength(2); // third attempt → blocked silently
    expect(await db.isPhoneBlocked("+972501234567")).toBe(true);
    await processInbound(ctx, inbound("עוד"));
    expect(wa.texts).toHaveLength(2);
    expect(LINK.maxTokenAttempts).toBe(3);
  });

  it("links a valid token once, welcomes with the trust line and starts onboarding", async () => {
    const { ctx, wa, inbound, db } = makeHarness();
    const user = await db.createUser("dana@example.com");
    await db.updateUserProfile(user.id, { name: "דנה" });
    const token = await db.createLinkToken(user.id, "ABCD-2345", new Date(Date.now() + 15 * 60_000));
    const r = await processInbound(ctx, inbound("היי! לקשר את החשבון שלי: ABCD-2345"));
    expect(r.note).toBe("linked");
    expect(wa.texts[0]).toBe("החשבון מקושר. מעכשיו אפשר לכתוב לי כאן.");
    expect(wa.texts[1]).toContain("שלום דנה");
    expect(wa.texts[1]).toContain("רואה רק מה ששולחים לי כאן");
    expect(wa.sent[1]!.buttons!.map((b) => b.id)).toEqual(["onb:tour", "onb:start"]);
    expect((await db.findWaIdentityByPhone("+972501234567"))?.user_id).toBe(user.id);
    expect((await db.findLinkToken("ABCD-2345"))?.used_at).toBeTruthy();
    expect(((await db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("welcome");
    // the same token again (already linked number) is now a normal message for the linked user
    await processInbound(ctx, inbound("היי! לקשר את החשבון שלי: ABCD-2345"));
    expect(wa.texts.filter((t) => t.includes("החשבון מקושר"))).toHaveLength(1);
    void token;
  });

  it("rejects expired tokens and a second phone for the same account", async () => {
    const { ctx, wa, inbound, db, advance } = makeHarness();
    const user = await db.createUser("dana@example.com");
    await db.createLinkToken(user.id, "ABCD-2345", new Date(ctx.now().getTime() + 15 * 60_000));
    advance(16 * 60_000);
    await processInbound(ctx, inbound("ABCD-2345"));
    expect(wa.texts[0]).toContain("כבר לא בתוקף");

    db.seedWaIdentity(user.id, "+972509999999");
    await db.createLinkToken(user.id, "EFGH-2345", new Date(ctx.now().getTime() + 15 * 60_000));
    await processInbound(ctx, inbound("EFGH-2345"));
    expect(wa.texts[1]).toContain("כבר מקושר למספר אחר (972-***-9999)");
  });
});
