import { afterEach, describe, expect, it } from "vitest";
import { clearExecutorsForTests, formatDateHe, parseButtonId, registerExecutor } from "./pending";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

async function readyUser(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.updateUserProfile(user.id, { name: "דנה" });
  await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(user.id, "+972501234567");
  return user;
}

describe("pending actions", () => {
  afterEach(() => clearExecutorsForTests());

  it("renders a draft with שלח/ערוך/בטל, cancels, and approves through the registered executor", async () => {
    const h = makeHarness();
    const user = await readyUser(h);
    await processInbound(h.ctx, h.inbound("תנסח מייל לרונית שאני מאשרת את הפגישה"));
    const draft = h.wa.sent.find((s) => s.kind === "buttons")!;
    expect(draft.body).toContain("*טיוטה למייל*");
    expect(draft.body).toContain("אל: רונית (רונית@example.com)");
    expect(draft.buttons!.map((b) => b.title)).toEqual(["שלח", "ערוך", "בטל"]);
    const actionId = parseButtonId(draft.buttons![0]!.id)!.actionId;
    expect(h.wa.texts.at(-1)).toBe(draft.body); // the draft is the reply; no extra one-liner

    // no executor yet → approval is recorded but execution fails gracefully
    await processInbound(h.ctx, h.button(`pa:approve:${actionId}`, "שלח"));
    expect(h.wa.texts.at(-1)).toContain("לחבר את המייל");
    expect((await h.db.getPendingAction(actionId))!.status).toBe("failed");
    expect(h.db.audit.some((a) => a.action === "send_mail.execute" && a.result === "no_executor" && a.approved_by_msg_id)).toBe(true);

    // a new draft with an executor registered
    registerExecutor("send_mail", async (action) => ({ ok: true, message: `נשלח ל${(action.payload as { to_name: string }).to_name}.` }));
    await processInbound(h.ctx, h.inbound("תכתוב מייל ליוסי"));
    const draft2 = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    const id2 = parseButtonId(draft2.buttons![0]!.id)!.actionId;
    await processInbound(h.ctx, h.button(`pa:approve:${id2}`, "שלח"));
    expect(h.wa.texts.at(-1)).toBe("נשלח ליוסי.");
    expect((await h.db.getPendingAction(id2))!.status).toBe("executed");
    // second press on the same action → expired notice
    await processInbound(h.ctx, h.button(`pa:approve:${id2}`, "שלח"));
    expect(h.wa.texts.at(-1)).toContain("כבר לא בתוקף");

    await processInbound(h.ctx, h.inbound("תכתוב מייל לאבי"));
    const draft3 = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    const id3 = parseButtonId(draft3.buttons![0]!.id)!.actionId;
    await processInbound(h.ctx, h.button(`pa:cancel:${id3}`, "בטל"));
    expect(h.wa.texts.at(-1)).toBe("בוטל. הטיוטה נמחקה ולא נשלחה.");
    expect((await h.db.getPendingAction(id3))!.status).toBe("cancelled");
    void user;
  });

  it("expires after 10 minutes and ignores other users' actions", async () => {
    const h = makeHarness();
    await readyUser(h);
    const other = await h.db.createUser("other@example.com");
    const foreign = await h.db.createPendingAction(other.id, "send_mail", { to_name: "x" }, new Date(h.ctx.now().getTime() + 600_000));
    await processInbound(h.ctx, h.button(`pa:approve:${foreign.id}`, "שלח"));
    expect(h.wa.texts.at(-1)).toContain("כבר לא בתוקף");
    expect((await h.db.getPendingAction(foreign.id))!.status).toBe("pending");

    await processInbound(h.ctx, h.inbound("תקבע פגישה עם כהן מחר ב-10"));
    const confirm = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    expect(confirm.body).toContain("*פגישה חדשה*");
    expect(confirm.body).toContain("יום ה׳ 22.10");
    expect(confirm.buttons![0]!.title).toBe("קבע");
    const id = parseButtonId(confirm.buttons![0]!.id)!.actionId;
    h.advance(11 * 60_000);
    await processInbound(h.ctx, h.button(`pa:approve:${id}`, "קבע"));
    expect(h.wa.texts.at(-1)).toContain("כבר לא בתוקף");
    expect((await h.db.getPendingAction(id))!.status).toBe("expired");
  });

  it("parses button ids and Hebrew dates", () => {
    expect(parseButtonId("pa:edit:123e4567-e89b-42d3-a456-426614174000")).toEqual({ verb: "edit", actionId: "123e4567-e89b-42d3-a456-426614174000" });
    expect(parseButtonId("onb:tour")).toBeNull();
    expect(formatDateHe("2026-10-22")).toBe("יום ה׳ 22.10"); // 22.10.2026 is a Thursday
    expect(formatDateHe("מחר")).toBe("מחר");
  });
});
