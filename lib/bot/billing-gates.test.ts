import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

async function readyUser(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  return user;
}

describe("billing gates in the pipeline", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));

  it("sends a personal /pay link when the trial ends, stores the pending input and repeats once a day", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    for (let i = 1; i <= 10; i++) await processInbound(h.ctx, h.inbound(`שאלה ${i}`));
    await processInbound(h.ctx, h.inbound("תסכם לי את המייל של רונית"));
    expect(h.wa.texts.at(-1)).toMatch(/https:\/\/app\.example\.co\.il\/pay\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect((await h.db.getUser(user.id))!.profile.pending_input).toBe("תסכם לי את המייל של רונית");
    const n = h.wa.texts.length;
    await processInbound(h.ctx, h.inbound("הלו?"));
    expect(h.wa.texts.length).toBe(n); // silent until 24h pass
    h.advance(25 * 3_600_000);
    await processInbound(h.ctx, h.inbound("הלו??"));
    expect(h.wa.texts.at(-1)).toContain("הניסיון הסתיים");
  });

  it("blocks a past_due account with one notice per day and tells basic users about the 750 cap", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    h.db.seedSubscription(user.id, "basic", "past_due");
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(h.wa.texts.at(-1)).toContain("החשבון מושהה עד להסדרת התשלום");
    const n = h.wa.texts.length;
    await processInbound(h.ctx, h.inbound("?"));
    expect(h.wa.texts.length).toBe(n);

    const user2 = await h.db.createUser("yossi@example.com");
    await h.db.mergeUserProfile(user2.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user2.id, "+972509999999");
    h.db.seedSubscription(user2.id, "basic", "active");
    h.db.usage.push({ user_id: user2.id, period_start: h.ctx.now().toISOString().slice(0, 7) + "-01", counted_messages: 750, free_remaining: 0, plan_limit: 750 });
    await processInbound(h.ctx, h.inbound("היי", { from: "972509999999", fromE164: "+972509999999" }));
    expect(h.wa.texts.at(-1)).toContain("750 ההודעות של המסלול הבסיסי");
    expect(h.wa.texts.at(-1)).toContain("/pay/");
  });
});
