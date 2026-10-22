import { describe, expect, it } from "vitest";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

async function linked(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  await h.db.createLinkToken(user.id, "ABCD-2345", new Date(h.ctx.now().getTime() + 15 * 60_000));
  await processInbound(h.ctx, h.inbound("ABCD-2345"));
  h.wa.sent.length = 0;
  return user;
}

describe("onboarding", () => {
  it("runs the full tour: card → first task → name → business → pain list → morning time → connect nudge → done", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await processInbound(h.ctx, h.button("onb:tour", "סיור קצר"));
    expect(h.wa.texts[0]).toContain("*4 דרכים לעבוד איתי*");
    expect(h.wa.texts[1]).toContain("ננסה משהו אמיתי");

    // first task is answered by the assistant, then the name question follows
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    const afterTask = h.wa.texts.slice(2);
    expect(afterTask[0]).toContain("לחבר את Microsoft 365");
    expect(afterTask[afterTask.length - 1]).toBe("כדי שנדבר בנוח — איך לקרוא לך?");

    await processInbound(h.ctx, h.inbound("דנה"));
    expect(h.wa.texts.at(-1)).toBe("נעים להכיר, דנה. מה שם העסק או המשרד?");
    expect((await h.db.getUser(user.id))!.name).toBe("דנה");

    await processInbound(h.ctx, h.inbound("משרד עו״ד לוי"));
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.kind).toBe("list");
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.sections![0]!.rows.map((r) => r.id)).toEqual(["pain_email", "pain_calendar", "pain_followup", "pain_files"]);

    await processInbound(h.ctx, h.listReply("pain_email", "מיילים שמחכים לתשובה"));
    expect(h.wa.texts.at(-2)).toContain("נתחיל מהתיבה");
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.kind).toBe("list");
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.sections![0]!.rows.map((r) => r.title)).toEqual(["07:00", "07:30", "08:00", "08:30", "לא עכשיו"]);

    await processInbound(h.ctx, h.listReply("mt_0800", "08:00"));
    expect(h.wa.texts.at(-2)).toContain("סיכום בוקר ב-08:00");
    expect((await h.db.getUser(user.id))!.morning_time).toBe("08:00");
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.buttons!.map((b) => b.id)).toEqual(["onb:connect:microsoft", "onb:connect:google", "onb:connect:later"]);

    await processInbound(h.ctx, h.button("onb:connect:later", "אחר כך"));
    expect(h.wa.texts.at(-2)).toContain("בלי חיבור אני יכולה לעזור");
    expect(h.wa.texts.at(-1)).toContain("זהו, אנחנו מסודרים");
    expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("done");

    // onboarding over: a normal message goes straight to the assistant
    await processInbound(h.ctx, h.inbound("תודה"));
    expect(h.wa.texts.at(-1)).toBe("בשמחה. אם צריך משהו — אני כאן.");
  });

  it("'נתחיל לעבוד' skips the card, keeps a known name and a connected account skips the nudge", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await h.db.updateUserProfile(user.id, { name: "יוסי" });
    h.db.seedConnection(user.id, "google", "yossi@gmail.com");
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    expect(h.wa.texts[0]).toContain("ננסה משהו אמיתי");
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(h.wa.texts.at(-1)).toBe("נעים להכיר, יוסי. מה שם העסק או המשרד?");
    await processInbound(h.ctx, h.inbound("כהן רואי חשבון"));
    await processInbound(h.ctx, h.listReply("pain_files"));
    await processInbound(h.ctx, h.listReply("mt_none", "לא עכשיו"));
    expect(h.wa.texts.at(-2)).toContain("בסדר גמור");
    expect(h.wa.texts.at(-1)).toContain("זהו, אנחנו מסודרים");
  });
});
