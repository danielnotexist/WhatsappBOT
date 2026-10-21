import { describe, expect, it } from "vitest";
import { consumeLoginToken } from "@/lib/auth/login-token";
import { LOGIN_RE } from "./login-link";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

async function readyUser(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  return user;
}

describe("processInbound", () => {
  it("dedupes redeliveries, reacts ✅, marks read with typing and stores both directions", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    const m = h.inbound("תודה");
    expect((await processInbound(h.ctx, m)).note).toBe("replied");
    expect((await processInbound(h.ctx, m)).note).toBe("duplicate");
    expect(h.wa.sent.map((s) => s.kind)).toEqual(["read", "reaction", "text"]);
    expect(h.wa.sent[1]!.emoji).toBe("✅");
    const rows = await h.db.recentMessages(user.id, 10);
    expect(rows.map((r) => r.direction)).toEqual(["in", "out"]);
    expect(rows[1]!.model_used).toBe("mock-router");
  });

  it("counts only user messages against the trial, nudges at 3 and 1, and stops politely at 0", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    for (let i = 1; i <= 7; i++) await processInbound(h.ctx, h.inbound(`שאלה ${i}`));
    expect(h.wa.texts.filter((t) => t.includes("נשארו 3 הודעות"))).toHaveLength(1);
    for (let i = 8; i <= 9; i++) await processInbound(h.ctx, h.inbound(`שאלה ${i}`));
    expect(h.wa.texts.filter((t) => t.includes("הלפני-אחרונה"))).toHaveLength(1);
    await processInbound(h.ctx, h.inbound("שאלה 10"));
    const r = await processInbound(h.ctx, h.inbound("שאלה 11"));
    expect(r.note).toBe("quota exhausted");
    expect(h.wa.texts.at(-1)).toContain("10 ההודעות של הניסיון נגמרו");
    expect(h.wa.texts.at(-1)).toMatch(/https:\/\/app\.example\.co\.il\/pay\/\S+/);
    // button presses do not count
    const usage = await h.db.getCurrentUsage(user.id);
    expect(usage?.counted_messages).toBe(10);
  });

  it("declines unsupported media in Hebrew and survives provider errors", async () => {
    const h = makeHarness();
    await readyUser(h);
    await processInbound(h.ctx, h.inbound(null as unknown as string, { type: "other", text: null }));
    expect(h.wa.texts.at(-1)).toContain("אני עדיין לא עובדת");
    h.ai.enqueue(() => {
      throw new Error("boom");
    });
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(h.wa.texts.at(-1)).toContain("לא הצלחתי להשלים");
  });

  it("answers \"כניסה\" with a one-time site login link — also after the trial ended, without counting it", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    for (let i = 1; i <= 11; i++) await processInbound(h.ctx, h.inbound(`שאלה ${i}`));
    const before = (await h.db.getCurrentUsage(user.id))?.counted_messages;
    const r = await processInbound(h.ctx, h.inbound("כניסה"));
    expect(r.note).toBe("login link");
    const text = h.wa.texts.at(-1)!;
    expect(text).toContain("קישור כניסה לאזור האישי");
    const url = new URL(text.match(/https:\/\/\S+/)![0]);
    expect(url.origin).toBe("https://app.example.co.il");
    expect(url.pathname.startsWith("/login/w/")).toBe(true);
    expect((await h.db.getCurrentUsage(user.id))?.counted_messages).toBe(before);
    const token = decodeURIComponent(url.pathname.slice("/login/w/".length));
    expect(await consumeLoginToken(h.db, token, { now: h.ctx.now() })).toEqual({ ok: true, userId: user.id });
  });

  it("recognises only the whole-message login keyword", () => {
    for (const t of ["כניסה", "כניסה.", "קישור כניסה", "כניסה לאתר", "לאזור האישי", "LOGIN"]) expect(LOGIN_RE.test(t), t).toBe(true);
    for (const t of ["כניסה לפגישה מחר ב-10", "מה הכניסה?", "תזכיר לי כניסה"]) expect(LOGIN_RE.test(t), t).toBe(false);
  });
});
