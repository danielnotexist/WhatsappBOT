import { describe, expect, it } from "vitest";
import { issueLinkToken } from "@/lib/auth/link-token";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

async function linked(h: ReturnType<typeof makeHarness>) {
  const user = await h.db.createUser("dana@example.com");
  const { token } = await issueLinkToken(h.db, user.id, h.ctx.now());
  await processInbound(h.ctx, h.inbound(token));
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
    // one choice per WhatsApp list: the question comes again with what is left, plus "זהו"
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.sections![0]!.rows.map((r) => r.id)).toEqual(["pain_calendar", "pain_followup", "pain_files", "pain_done"]);
    await processInbound(h.ctx, h.listReply("pain_followup", "מעקבים ותזכורות"));
    expect(h.wa.texts.at(-2)).toContain("תזכורות בשפה חופשית");
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.sections![0]!.rows.map((r) => r.id)).toEqual(["pain_calendar", "pain_files", "pain_done"]);
    await processInbound(h.ctx, h.listReply("pain_done", "זהו, מספיק"));
    expect((await h.db.getUser(user.id))!.profile.pain_points).toEqual(["pain_email", "pain_followup"]);
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

  it("never swallows a request: Daniel's live test (excerpt 1) is answered first, then the open question comes again", async () => {
    const h = makeHarness();
    const user = await linked(h);
    const tool = { text: JSON.stringify({ intent: "email", complexity: "tool", needs_tools: true, reply: null }) };
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    await processInbound(h.ctx, h.inbound("Daniel Cohen"));
    expect(h.wa.texts.at(-1)).toBe("נעים להכיר, Daniel Cohen. מה שם העסק או המשרד?");

    // at "מה שם העסק?" — the request is answered, never stored as the business name
    h.ai.enqueue(tool, { text: "המייל האחרון: רונית כהן, ״הסכם שכירות — טיוטה שנייה״, היום ב-08:12." });
    expect((await processInbound(h.ctx, h.inbound("תביא לי את המייל האחרון שקיבלתי"))).note).toBe("replied");
    expect(h.ai.calls.at(-1)!.messages.at(-1)).toEqual({ role: "user", content: "תביא לי את המייל האחרון שקיבלתי" });
    expect(h.wa.texts.at(-2)).toContain("המייל האחרון: רונית כהן");
    expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
    expect((await h.db.getUser(user.id))!.business_name).toBeNull();

    await processInbound(h.ctx, h.inbound("משרד כהן"));
    expect((await h.db.getUser(user.id))!.business_name).toBe("משרד כהן");
    expect(h.wa.sent.filter((s) => s.kind === "list").at(-1)!.body).toContain("מה הכי מעמיס");

    // at the pain list — answered, then the list again (nothing picked)
    h.ai.enqueue(tool, { text: "המייל האחרון שלך: רונית כהן, היום ב-08:12." });
    expect((await processInbound(h.ctx, h.inbound("תביא לי את המייל האחרון שלי"))).note).toBe("replied");
    const visible = h.wa.sent.filter((s) => s.kind === "text" || s.kind === "list");
    expect(visible.at(-2)!.body).toBe("המייל האחרון שלך: רונית כהן, היום ב-08:12.");
    expect(visible.at(-1)!.kind).toBe("list");
    expect(visible.at(-1)!.sections![0]!.rows.map((r) => r.id)).toEqual(["pain_email", "pain_calendar", "pain_followup", "pain_files"]);
    expect((await h.db.getUser(user.id))!.profile.pain_points).toBeUndefined();

    // and at the morning-time list too
    await processInbound(h.ctx, h.listReply("pain_done", "זהו, מספיק"));
    h.ai.enqueue(tool, { text: "מחר פנוי עד 11:00." });
    await processInbound(h.ctx, h.inbound("תבדקי מה יש לי ביומן מחר"));
    const last = h.wa.sent.filter((s) => s.kind === "text" || s.kind === "list");
    expect(last.at(-2)!.body).toBe("מחר פנוי עד 11:00.");
    expect(last.at(-1)!.body).toContain("באיזו שעה נוח");
    expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("ask_morning_time");
  });

  it("a greeting or a thank-you is not a business name; 'אין לי עסק' passes the question without storing it", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await h.db.updateUserProfile(user.id, { name: "דנה" });
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    await processInbound(h.ctx, h.inbound("תודה"));
    expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
    await processInbound(h.ctx, h.inbound("אין לי עסק"));
    expect((await h.db.getUser(user.id))!.business_name).toBeNull();
    expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("ask_pain");
  });

  it("a connect request or the agent flow while a question is open is theirs, not an answer", async () => {
    const h = makeHarness();
    const user = await linked(h);
    h.db.seedSubscription(user.id, "pro", "active");
    await h.db.updateUserProfile(user.id, { name: "דנה" });
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    expect(h.wa.texts.at(-1)).toBe("נעים להכיר, דנה. מה שם העסק או המשרד?");

    // "הג׳ימייל" alone → the Google link, then the open question again
    expect((await processInbound(h.ctx, h.inbound("הג׳ימייל"))).note).toBe("connect link");
    expect(h.wa.texts.at(-2)).toContain("/api/auth/google/start?t=");
    expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");

    // the agent flow: the template list reply and the typed name belong to it
    await processInbound(h.ctx, h.inbound("אתה יכול ליצור לי סוכן?"));
    expect(h.wa.sent.filter((s) => s.kind === "list").at(-1)!.sections![0]!.rows.map((r) => r.id)).toContain("ag:tpl:secretary");
    expect((await processInbound(h.ctx, h.listReply("ag:tpl:secretary", "מזכירה"))).note).toBe("agent button");
    expect((await processInbound(h.ctx, h.inbound("יומנאית"))).note).toBe("agent draft");
    const after = (await h.db.getUser(user.id))!;
    expect(after.business_name).toBeNull();
    expect((after.profile.agent_draft as { name?: string }).name).toBe("יומנאית");
    expect((after.profile.onboarding as { step: string }).step).toBe("ask_business");
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
    await processInbound(h.ctx, h.listReply("pain_done"));
    await processInbound(h.ctx, h.listReply("mt_none", "לא עכשיו"));
    expect(h.wa.texts.at(-2)).toContain("בסדר גמור");
    expect(h.wa.texts.at(-1)).toContain("זהו, אנחנו מסודרים");
  });
  it("a connect link at an open question asks it again; 'חיברתי' / 'עשיתי' afterwards is never stored (review 23.10.2026)", async () => {
    for (const ack of ["חיברתי", "עשיתי", "אוקיי, התחברתי", "בוצע"]) {
      const h = makeHarness();
      const user = await linked(h);
      await h.db.updateUserProfile(user.id, { name: "דנה" });
      await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
      await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
      expect((await processInbound(h.ctx, h.inbound("לחבר את הג׳ימייל"))).note).toBe("connect link");
      expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
      const calls = h.ai.calls.length;
      expect((await processInbound(h.ctx, h.inbound(ack))).note, ack).toBe("onboarding");
      expect(h.ai.calls.length).toBe(calls);
      expect((await h.db.getUser(user.id))!.business_name, ack).toBeNull();
      expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
      expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("ask_business");
    }
    // at the name question too: never "נעים להכיר, חיברתי"
    const h = makeHarness();
    const user = await linked(h);
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("מה יש לי מחר?"));
    await processInbound(h.ctx, h.inbound("לחבר את המייל"));
    expect(h.wa.texts.at(-2)).toContain("/api/auth/microsoft/start?t=");
    expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן, כדי שנדבר בנוח: איך לקרוא לך?");
    await processInbound(h.ctx, h.inbound("חיברתי"));
    expect((await h.db.getUser(user.id))!.name).toBeNull();
    expect(h.wa.texts.at(-1)).toBe("ועוד דבר קטן, כדי שנדבר בנוח: איך לקרוא לך?");
    // a request after the link is answered, then the question again
    expect((await processInbound(h.ctx, h.inbound("מעולה, עכשיו מה המייל האחרון"))).note).toBe("replied");
    expect((await h.db.getUser(user.id))!.name).toBeNull();
  });

  it("requests in other wordings are answered, never stored as the name or the business name (review 23.10.2026)", async () => {
    const business = ["המייל האחרון שלי", "תזכורת מחר ב-9 להתקשר לרוני", "פגישה עם רוני מחר ב-10", "קראי את המייל האחרון", "רק תגידי לי מה יש לי מחר", "רגע, תבדקי אם כהן ענה", "אוקיי תביאי לי את המייל", "סבבה, מה המייל האחרון", "@מזכירה מה יש לי מחר", "מזכירה, מה יש לי מחר", "הצג את המיילים", "Check my email", "עזרה"];
    for (const t of business) {
      const h = makeHarness();
      const user = await linked(h);
      h.db.seedSubscription(user.id, "pro", "active");
      await h.db.updateUserProfile(user.id, { name: "דנה" });
      await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
      await processInbound(h.ctx, h.inbound("שלום"));
      const calls = h.ai.calls.length;
      expect((await processInbound(h.ctx, h.inbound(t))).note, t).toBe("replied");
      expect(h.ai.calls.length, t).toBeGreaterThan(calls);
      const after = (await h.db.getUser(user.id))!;
      expect(after.business_name, t).toBeNull();
      expect((after.profile.onboarding as { step: string }).step, t).toBe("ask_business");
      expect(h.wa.texts.at(-1), t).toBe("ועוד דבר קטן: מה שם העסק או המשרד?");
    }
    for (const t of ["המייל האחרון שלי", "קראי את המייל האחרון", "יומן", "עזרה", "@מזכירה מה יש מחר", "Check my email"]) {
      const h = makeHarness();
      const user = await linked(h);
      h.db.seedSubscription(user.id, "pro", "active");
      await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
      await processInbound(h.ctx, h.inbound("שלום"));
      expect((await processInbound(h.ctx, h.inbound(t))).note, t).toBe("replied");
      expect((await h.db.getUser(user.id))!.name, t).toBeNull();
      expect(h.wa.texts.at(-1), t).toBe("ועוד דבר קטן, כדי שנדבר בנוח: איך לקרוא לך?");
    }
  });

  it("a business name that looks like a request is stored when sent twice in a row; skips are skips", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await h.db.updateUserProfile(user.id, { name: "דנה" });
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("שלום"));
    expect((await processInbound(h.ctx, h.inbound("מי עדן"))).note).toBe("replied");
    expect((await h.db.getUser(user.id))!.business_name).toBeNull();
    expect((await processInbound(h.ctx, h.inbound("מי עדן"))).note).toBe("onboarding");
    expect((await h.db.getUser(user.id))!.business_name).toBe("מי עדן");
    // never a loop: names that start like a verb or a request word pass the first time
    for (const name of ["תעשיות כהן", "תמצית הנהלת חשבונות", "אין סוף עיצובים"]) {
      const g = makeHarness();
      const u = await linked(g);
      await g.db.updateUserProfile(u.id, { name: "דנה" });
      await processInbound(g.ctx, g.button("onb:start", "נתחיל לעבוד"));
      await processInbound(g.ctx, g.inbound("שלום"));
      expect((await processInbound(g.ctx, g.inbound(name))).note, name).toBe("onboarding");
      expect((await g.db.getUser(u.id))!.business_name).toBe(name);
    }
    for (const skip of ["תדלגי", "תדלג", "לא משנה", "אחר כך", "עוד אין", "עדיין אין", "לא רוצה לענות", "אפשר לדלג"]) {
      const g = makeHarness();
      const u = await linked(g);
      await g.db.updateUserProfile(u.id, { name: "דנה" });
      await processInbound(g.ctx, g.button("onb:start", "נתחיל לעבוד"));
      await processInbound(g.ctx, g.inbound("שלום"));
      expect((await processInbound(g.ctx, g.inbound(skip))).note, skip).toBe("onboarding");
      const after = (await g.db.getUser(u.id))!;
      expect(after.business_name, skip).toBeNull();
      expect((after.profile.onboarding as { step: string }).step, skip).toBe("ask_pain");
    }
  });

  it("typed answers to the lists are answers, not paid model messages", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await h.db.updateUserProfile(user.id, { name: "דנה" });
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("שלום"));
    await processInbound(h.ctx, h.inbound("משרד כהן"));
    const used = (await h.db.getCurrentUsage(user.id))?.counted_messages;
    expect((await processInbound(h.ctx, h.inbound("המייל והיומן שלי"))).note).toBe("onboarding");
    expect((await h.db.getUser(user.id))!.profile.pain_points).toEqual(["pain_email", "pain_calendar"]);
    expect(h.wa.sent.filter((s) => s.kind === "list").at(-1)!.sections![0]!.rows.map((r) => r.id)).toEqual(["pain_followup", "pain_files", "pain_done"]);
    expect((await processInbound(h.ctx, h.inbound("זהו"))).note).toBe("onboarding");
    expect(h.wa.sent.filter((s) => s.kind === "list").at(-1)!.body).toContain("באיזו שעה נוח");
    expect((await processInbound(h.ctx, h.inbound("שבע וחצי בבוקר"))).note).toBe("onboarding");
    expect((await h.db.getUser(user.id))!.morning_time).toBe("07:30");
    expect((await h.db.getCurrentUsage(user.id))?.counted_messages).toBe(used);
    expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("connect");

    // "אין צורך" at the morning question: no summary, no model
    const g = makeHarness();
    const u = await linked(g);
    await g.db.updateUserProfile(u.id, { name: "דנה" });
    await processInbound(g.ctx, g.button("onb:start", "נתחיל לעבוד"));
    await processInbound(g.ctx, g.inbound("שלום"));
    await processInbound(g.ctx, g.inbound("משרד כהן"));
    await processInbound(g.ctx, g.inbound("בעיקר מיילים ויומן"));
    await processInbound(g.ctx, g.inbound("הכל"));
    expect(g.wa.sent.filter((s) => s.kind === "list").at(-1)!.body).toContain("באיזו שעה נוח");
    const calls = g.ai.calls.length;
    expect((await processInbound(g.ctx, g.inbound("אין צורך"))).note).toBe("onboarding");
    expect(g.ai.calls.length).toBe(calls);
    expect((await g.db.getUser(u.id))!.profile.morning_summary_enabled).toBe(false);
  });
  it("when the assistant itself sets the morning time at that question, onboarding moves on instead of asking again", async () => {
    const h = makeHarness();
    const user = await linked(h);
    await h.db.updateUserProfile(user.id, { name: "דנה" });
    await processInbound(h.ctx, h.button("onb:start", "נתחיל לעבוד"));
    await processInbound(h.ctx, h.inbound("שלום"));
    await processInbound(h.ctx, h.inbound("משרד כהן"));
    await processInbound(h.ctx, h.inbound("זהו"));
    expect(((await h.db.getUser(user.id))!.profile.onboarding as { step: string }).step).toBe("ask_morning_time");
    h.ai.enqueue(
      { text: '{"intent":"summary","complexity":"tool","needs_tools":true,"reply":null,"agent":null}' },
      { toolCalls: [{ id: "m1", name: "set_morning_time", input: { time: "06:45" } }], stopReason: "tool_use" },
      { text: "סיכום הבוקר יגיע ב-06:45." },
    );
    const lists = h.wa.sent.filter((s) => s.kind === "list").length;
    expect((await processInbound(h.ctx, h.inbound("תקבעי לי את הסיכום לרבע לשבע בבקשה"))).note).toBe("replied");
    expect((await h.db.getUser(user.id))!.morning_time).toBe("06:45");
    expect(h.wa.sent.filter((s) => s.kind === "list")).toHaveLength(lists); // not asked again
    expect(h.wa.sent.filter((s) => s.kind !== "reaction").at(-1)!.buttons!.map((b) => b.id)).toEqual(["onb:connect:microsoft", "onb:connect:google", "onb:connect:later"]);
  });
});
