import { describe, expect, it } from "vitest";
import { setProactiveAlertsFor } from "@/lib/account/service";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { processInbound } from "@/lib/bot/process-inbound";
import { runMorningSummaryJob } from "@/lib/jobs/morning-summary";
import { SUSPICIOUS_CATEGORY } from "@/lib/ms/graph";
import { il, morningJob, proactiveSetup } from "./__fixtures__/proactive-harness";
import { alertCommandOf } from "./actions";

const AT = il(21, 7, 30);

/** A pro user after this morning's summary (inside the window): the section's rows are in the database. */
async function afterSummary(plan: "pro" | "basic" = "pro") {
  const s = await proactiveSetup({ at: AT, plan: "pro" });
  await processInbound(s.h.ctx, s.h.inbound("תודה"));
  await runMorningSummaryJob(s.deps, morningJob(s.user.id, "2026-10-21"));
  if (plan === "basic") await s.h.db.upsertSubscription(s.user.id, { plan: "basic" });
  const row = (kind: string) => s.h.db.proactiveAlerts.find((a) => a.kind === kind)!;
  return { ...s, row };
}

describe("the section's buttons", () => {
  it("[לנסח תשובה] goes to the assistant as a request with the mail's id → the usual draft card, nothing sent", async () => {
    const { h, row } = await afterSummary();
    const waiting = row("awaiting_reply");
    await processInbound(h.ctx, h.listReply(`al:reply:${waiting.id}`, "לנסח תשובה"));
    const strong = h.ai.calls.filter((c) => c.tier === "strong").at(-1)!;
    const last = strong.messages.filter((m) => m.role === "user").at(-1)!;
    expect(last.role === "user" && last.content).toBe('לנסח תשובה למייל מ-רונית לוי בנושא "הצעת מחיר לפרויקט" (מזהה המייל: AAMkW1). קודם לקרוא את המייל, ואז להכין טיוטת תשובה לאישור.');
    expect(h.db.pendingActions.at(-1)).toMatchObject({ kind: "send_mail", status: "pending" });
    expect(h.wa.sent.at(-1)!.buttons!.map((b) => b.title)).toContain("שלח");
  });

  it("[להזכיר מחר] sets a reminder tomorrow at 9 (no model); [תזכורת למועד] the day before the deadline at 9", async () => {
    const { h, row } = await afterSummary();
    const calls = h.ai.calls.length;
    await processInbound(h.ctx, h.listReply(`al:remind:${row("awaiting_reply").id}`, "להזכיר מחר"));
    expect(h.db.reminders.at(-1)).toMatchObject({ text: "לחזור לרונית לוי: הצעת מחיר לפרויקט", due_at: il(22, 9).toISOString() });
    expect(h.wa.texts.at(-1)).toContain("אזכיר: לחזור לרונית לוי: הצעת מחיר לפרויקט");
    await processInbound(h.ctx, h.listReply(`al:dl:${row("deadline").id}`, "תזכורת למועד"));
    expect(h.db.reminders.at(-1)).toMatchObject({ text: "מועד מחר: דוח מע״מ", due_at: il(21, 9).toISOString() });
    expect(h.ai.calls.length).toBe(calls);
  });

  it("[לסמן כחשוד] adds an Outlook category to the mail (Mail.ReadWrite) — not moved, not answered", async () => {
    const { h, row, mailbox } = await afterSummary();
    await processInbound(h.ctx, h.listReply(`al:susp:${row("phishing").id}`, "לסמן כחשוד"));
    expect(mailbox.fx.state.messages.find((m) => m.id === "AAMkPH")!.categories).toEqual([SUSPICIOUS_CATEGORY]);
    expect(mailbox.fx.state.sent).toEqual([]);
    expect(h.wa.texts.at(-1)).toBe(`סימנתי את המייל ב-Outlook בקטגוריה ״${SUSPICIOUS_CATEGORY}״. לא מחקתי ולא העברתי אותו. כדאי לא ללחוץ על קישורים בו ולא להעביר תשלום לפני אימות בטלפון.`);
    expect(h.db.audit.at(-1)).toMatchObject({ action: "mail.mark_suspicious", result: "ok" });
    // without a mailbox that may be modified: only the warning
    h.ctx.mailMarker = async () => null;
    await processInbound(h.ctx, h.listReply(`al:susp:${row("phishing").id}`, "לסמן כחשוד"));
    expect(h.wa.texts.at(-1)).toBe("בחשבון הזה אין לי הרשאה לסמן מיילים, אז רק הזהרתי. אפשר לסמן אותו כפישינג בתיבת המייל עצמה.");
  });

  it("[תדריך לפגישה] and [לטפל בהתנגשות] are requests to the assistant", async () => {
    const { h, row } = await afterSummary();
    await processInbound(h.ctx, h.listReply(`al:brief:${row("external_meeting").id}`, "תדריך לפגישה"));
    const lastUser = () => h.ai.calls.filter((c) => c.tier === "strong").at(-1)!.messages.filter((m) => m.role === "user").at(-1)!;
    expect(lastUser()).toMatchObject({ content: "תדריך קצר לפגישה 12:00 פגישה עם רו״ח ברק עם ברק: מה היה בינינו במייל לאחרונה, ומה כדאי לזכור לפני הפגישה." });
  });

  it("another user's item, an unknown id, and the plan: gone / pro only", async () => {
    const { h, row } = await afterSummary();
    const id = row("awaiting_reply").id;
    h.db.proactiveAlerts.find((a) => a.id === id)!.user_id = "someone-else";
    await processInbound(h.ctx, h.listReply(`al:reply:${id}`, "לנסח תשובה"));
    expect(h.wa.texts.at(-1)).toBe("הפריט הזה כבר לא זמין. אפשר פשוט לכתוב לי מה צריך.");
    await processInbound(h.ctx, h.button("al:reply:not-an-id", "לנסח תשובה"));
    expect(h.wa.texts.at(-1)).toBe("הפריט הזה כבר לא זמין. אפשר פשוט לכתוב לי מה צריך.");

    const basic = await afterSummary("basic");
    await processInbound(basic.h.ctx, basic.h.listReply(`al:remind:${basic.row("awaiting_reply").id}`, "להזכיר מחר"));
    expect(basic.h.wa.texts.at(-1)).toBe("התראות יזומות מהמייל ומהיומן ואזהרות פישינג כלולות במסלול פרו. לשדרוג אפשר לכתוב ״שדרוג״.");
    expect(basic.h.db.reminders).toHaveLength(0);
  });

  it("the template's [לנסח תשובה] quick reply (outside the window) works the same", async () => {
    const s = await proactiveSetup({ at: AT });
    await runMorningSummaryJob(s.deps, morningJob(s.user.id, "2026-10-21"));
    const payload = s.h.wa.sent.at(-1)!.template!.buttons[0]!.text;
    await processInbound(s.h.ctx, s.h.inbound("לנסח תשובה", { type: "template_button", reply: { id: payload, title: "לנסח תשובה" } }));
    expect(s.h.db.pendingActions.at(-1)).toMatchObject({ kind: "send_mail", status: "pending" });
  });
});

describe("the switch: 'בלי התראות' / 'להחזיר התראות', the button and /account", () => {
  it("recognises the commands (and nothing else)", () => {
    for (const t of ["בלי התראות", "ללא התראות", "לכבות את ההתראות", "בלי התראות יזומות."]) expect(alertCommandOf(t), t).toBe("off");
    for (const t of ["להחזיר התראות", "להפעיל את ההתראות", "תחזירי התראות"]) expect(alertCommandOf(t), t).toBe("on");
    for (const t of ["בלי התראות על הבנק בבקשה ותזכירי לי מחר", "מה עם ההתראות?", "התראות"]) expect(alertCommandOf(t), t).toBeNull();
  });

  it("pro: off, already off, on — stored as a boolean, reaching the prompt only as one line; no model, not counted", async () => {
    const { h, user } = await proactiveSetup({ at: il(21, 10) });
    await processInbound(h.ctx, h.inbound("בלי התראות"));
    expect(h.wa.texts.at(-1)).toBe("בסדר, בלי התראות יזומות: לא אשלח התראות דחופות, וסיכום הבוקר יגיע בלי ״דברים שכדאי לא לפספס״. להחזיר אותן — ״להחזיר התראות״.");
    const off = (await h.db.getUser(user.id))!;
    expect(off.profile.alerts_disabled).toBe(true);
    const prompt = buildSystemPrompt({ name: null, businessName: null, businessType: null, timezone: "Asia/Jerusalem", morningTime: "07:30", connections: [], profile: off.profile, summary: null, facts: [], now: il(21, 10) });
    expect(prompt).toContain("- התראות יזומות ואזהרות בסיכום הבוקר: כבויות לבקשת המשתמש (להחזיר: ״להחזיר התראות״)");
    await processInbound(h.ctx, h.inbound("בלי התראות"));
    expect(h.wa.texts.at(-1)).toBe("ההתראות היזומות כבר כבויות. להחזיר אותן — ״להחזיר התראות״.");
    await processInbound(h.ctx, h.button("al:on", "להחזיר התראות"));
    expect((await h.db.getUser(user.id))!.profile.alerts_disabled).toBe(false);
    expect(h.ai.calls).toHaveLength(0);
  });

  it("basic: the pro line, nothing stored", async () => {
    const { h, user } = await proactiveSetup({ at: il(21, 10), plan: "basic" });
    await processInbound(h.ctx, h.inbound("בלי התראות"));
    expect(h.wa.texts.at(-1)).toBe("התראות יזומות מהמייל ומהיומן ואזהרות פישינג כלולות במסלול פרו. לשדרוג אפשר לכתוב ״שדרוג״.");
    expect((await h.db.getUser(user.id))!.profile.alerts_disabled).toBeUndefined();
  });

  it("/account: the toggle turns them off (and cancels queued scans) and on (and queues the next scan)", async () => {
    const { h, user } = await proactiveSetup({ at: il(21, 10) });
    await h.db.createJob({ kind: "proactive_scan", user_id: user.id, run_at: il(21, 11) });
    expect(await setProactiveAlertsFor(h.db, user.id, false, il(21, 10))).toEqual({ ok: true, message: "ההתראות היזומות כבויות." });
    expect(h.db.jobs.filter((j) => j.kind === "proactive_scan").map((j) => j.status)).toEqual(["cancelled"]);
    expect(await setProactiveAlertsFor(h.db, user.id, true, il(21, 10))).toEqual({ ok: true, message: "ההתראות היזומות פעילות." });
    expect(h.db.jobs.filter((j) => j.kind === "proactive_scan" && j.status === "queued")).toHaveLength(1);
    const basic = await proactiveSetup({ at: il(21, 10), plan: "basic" });
    expect((await setProactiveAlertsFor(basic.h.db, basic.user.id, false, il(21, 10))).ok).toBe(false);
  });
});
