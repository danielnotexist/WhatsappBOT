import { describe, expect, it } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { runMorningSummaryJob } from "@/lib/jobs/morning-summary";
import { il, morningJob, proactiveSetup } from "./__fixtures__/proactive-harness";

// Wednesday 21.10.2026 07:30 — the fixture day
const AT = il(21, 7, 30);

describe("morning summary — pro: 'דברים שכדאי לא לפספס'", () => {
  it("inside the window: the section first (phishing, the clash, the deadline, the waiting mail, outside meetings), then a list of actions", async () => {
    const { h, user, deps } = await proactiveSetup({ at: AT, google: true });
    await processInbound(h.ctx, h.inbound("תודה"));
    expect(await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-21"))).toMatchObject({ status: "sent", mode: "text" });

    const list = h.wa.sent.at(-1)!;
    const summary = h.wa.sent.at(-2)!;
    expect(summary.kind).toBe("text");
    const section = summary.body!.split("\n\n")[1]!.split("\n");
    expect(section).toEqual([
      "*דברים שכדאי לא לפספס*",
      "• ⚠️ שימו לב: כתובת השולח דומה ל-shapira-law.co.il אבל אינה זהה; השם בשולח מוכר, אבל המייל הגיע מכתובת אחרת; תשובה למייל תגיע לכתובת אחרת מזו של השולח — עו״ד שפירא, עדכון פרטי בנק לתשלום",
      "• התנגשות ביומן: 09:00 פגישת צוות שבועית חופפת ל-09:00 דיון בבית משפט השלום ת״א",
      "• מועד מחר: דוח מע״מ (רו״ח ברק)",
      "• רונית לוי מחכה לתשובה 2 ימי עסקים — הצעת מחיר לפרויקט",
      "• 12:00 פגישה עם רו״ח ברק עם ברק. אפשר לבקש תדריך קצר לפני",
      "• 13:00 שיחה עם משפחת אברהם עם יוסי אברהם. אפשר לבקש תדריך קצר לפני",
    ]);
    // the newsletter never shows; a mail in the section is not repeated under "מיילים שמחכים לתשובה"
    expect(summary.body).not.toContain("חדשות המשרד");
    expect(summary.body!.match(/רונית לוי/g)).toHaveLength(1);

    expect(list.kind).toBe("list");
    expect(list.body).toBe("אפשר לטפל באחד מהם מכאן. שום דבר לא יוצא בלי אישור.");
    const rows = list.sections![0]!.rows;
    // titles stay unique in the list (a second row of the same action names its item)
    expect(rows.map((r) => [r.id.split(":")[1], r.title])).toEqual([
      ["susp", "לסמן כחשוד"],
      ["conf", "לטפל בהתנגשות"],
      ["reply", "לנסח תשובה"],
      ["dl", "תזכורת למועד"],
      ["reply", "לנסח תשובה · רונית"],
      ["remind", "להזכיר מחר"],
      ["brief", "תדריך לפגישה"],
      ["brief", "תדריך לפגישה · 13:00"],
    ]);
    for (const r of rows) {
      expect(r.title.length).toBeLessThanOrEqual(24);
      expect((r.description ?? "").length).toBeLessThanOrEqual(72);
      expect(r.id).toMatch(/^al:(susp|conf|reply|dl|remind|brief):[0-9a-f-]{36}$/);
    }
    // each line is stored for its buttons (channel summary, the user's day)
    expect(h.db.proactiveAlerts.filter((a) => a.channel === "summary" && a.local_day === "2026-10-21")).toHaveLength(6);
  });

  it("outside the window: the template carries the lines in its two sections and [לנסח תשובה] carries the first mail", async () => {
    const { h, user, deps } = await proactiveSetup({ at: AT });
    expect(await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-21"))).toMatchObject({ status: "sent", mode: "template" });
    const t = h.wa.sent.at(-1)!.template!;
    const [, meetings, emails] = t.params.map((p) => p.text);
    expect(emails!.startsWith("• ⚠️ שימו לב:")).toBe(true);
    expect(emails).toContain("• מועד מחר: דוח מע״מ (רו״ח ברק)");
    expect(meetings).toContain("• 12:00 פגישה עם רו״ח ברק עם ברק. אפשר לבקש תדריך קצר לפני");
    const deadline = h.db.proactiveAlerts.find((a) => a.kind === "deadline")!;
    expect(t.buttons).toEqual([{ index: 0, subType: "quick_reply", text: `al:reply:${deadline.id}` }]);
    expect(h.wa.sent.some((s) => s.kind === "list")).toBe(false); // no list outside the window
  });

  it("basic and the trial: the summary exactly as before (no section, no list, no reads for it)", async () => {
    for (const plan of ["basic", "trial"] as const) {
      const { h, user, deps, mailbox } = await proactiveSetup({ at: AT, plan });
      await processInbound(h.ctx, h.inbound("תודה"));
      await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-21"));
      const body = h.wa.sent.filter((s) => s.kind === "text").at(-1)!.body!;
      expect(body, plan).not.toContain("דברים שכדאי לא לפספס");
      expect(body, plan).not.toContain("שימו לב");
      expect(h.wa.sent.some((s) => s.kind === "list"), plan).toBe(false);
      expect(h.db.proactiveAlerts, plan).toHaveLength(0);
      // the pro reads (headers) were never made
      expect(mailbox.fx.state.calls.some((c) => c.url.includes("internetMessageHeaders")), plan).toBe(false);
    }
  });

  it("pro with alerts turned off: the summary without the section", async () => {
    const { h, user, deps } = await proactiveSetup({ at: AT, profile: { alerts_disabled: true } });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-21"));
    expect(h.wa.sent.filter((s) => s.kind === "text").at(-1)!.body).not.toContain("דברים שכדאי לא לפספס");
    expect(h.db.proactiveAlerts).toHaveLength(0);
  });

  it("without Mail.ReadWrite the phishing line has no 'לסמן כחשוד'", async () => {
    const { h, user, deps } = await proactiveSetup({ at: AT, scopes: ["Mail.Read", "Calendars.ReadWrite"] });
    await processInbound(h.ctx, h.inbound("תודה"));
    await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-21"));
    expect(h.wa.sent.at(-1)!.sections![0]!.rows.some((r) => r.id.startsWith("al:susp:"))).toBe(false);
  });

  it("a borderline mail goes to the cheap model (router tier, JSON) once; its answer decides", async () => {
    const { h, user, deps, mailbox } = await proactiveSetup({ at: AT });
    mailbox.fx.state.messages = mailbox.fx.state.messages.filter((m) => m.id !== "AAMkPH");
    mailbox.fx.state.messages.push({ ...mailbox.fx.state.messages.find((m) => m.id === "AAMkW1")!, id: "AAMkBL", conversationId: "conv-bl", from: { emailAddress: { name: "ספק", address: "billing@vendor.example" } }, subject: "תזכורת", bodyPreview: "נשמח אם תוכלו להעביר את התשלום בהקדם", receivedDateTime: il(20, 16).toISOString() });
    h.ai.enqueue({ text: '{"suspicious": true}' });
    await runMorningSummaryJob({ ...deps, ai: h.ai }, morningJob(user.id, "2026-10-21"));
    const calls = h.ai.calls.filter((c) => c.tier === "router" && c.json);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages[0]!.role === "user" && calls[0]!.messages[0]!.content).toContain('<data source="microsoft" id="AAMkBL">');
    expect(h.wa.sent.at(-1)!.template!.params[2]!.text).toContain("⚠️ שימו לב: יש לחץ להעביר תשלום בדחיפות — ספק, תזכורת");
  });
});
