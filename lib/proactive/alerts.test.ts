import { describe, expect, it } from "vitest";
import { processInbound } from "@/lib/bot/process-inbound";
import { runMorningSummaryJob } from "@/lib/jobs/morning-summary";
import { runScheduledJob } from "@/lib/jobs/run";
import { fixtureGraphMessage } from "@/lib/ms/__fixtures__/graph-fixtures";
import { il, graphEvent, morningJob, proactiveSetup } from "./__fixtures__/proactive-harness";
import { ALERT_DAILY_CAP, alertHoursOpen, nextScanAt, queueScanSoon, runProactiveScanJob, scanDedupeKey } from "./alerts";

const scanJob = (userId: string) => ({ id: "job-s", user_id: userId, payload: {} });

/**
 * Wednesday 21.10.2026 10:00. Three urgent candidates: a clash tomorrow (11:00 / 11:30), and two urgent mails from known
 * people (Barak, Shapira's office) that came in this morning.
 */
async function urgentSetup(opts: { at?: Date; window?: boolean; plan?: "pro" | "basic"; profile?: Record<string, unknown> } = {}) {
  const at = opts.at ?? il(21, 10);
  const s = await proactiveSetup({ at, plan: opts.plan, profile: opts.profile });
  s.mailbox.fx.state.events.push(graphEvent("AAMkT1", "חתימה אצל הנוטריון", "2026-10-22T11:00", "2026-10-22T12:00"), graphEvent("AAMkT2", "שיחה עם הבנק", "2026-10-22T11:30", "2026-10-22T12:00"));
  s.mailbox.fx.state.messages.push(
    fixtureGraphMessage({ id: "AAMkU1", from: { name: "רו״ח ברק", address: "barak@cpa-barak.co.il" }, subject: "דחוף: חתימה על הדוח", receivedDateTime: new Date(at.getTime() - 20 * 60_000).toISOString(), bodyPreview: "צריך את החתימה עוד היום." }),
    fixtureGraphMessage({ id: "AAMkU2", from: { name: "עו״ד שפירא", address: "office@shapira-law.co.il" }, subject: "תשובה לבית המשפט", receivedDateTime: new Date(at.getTime() - 10 * 60_000).toISOString(), bodyPreview: "בהול — הדיון הוקדם.", importance: "high" }),
  );
  if (opts.window !== false) {
    s.h.advance(-5 * 60_000);
    await processInbound(s.h.ctx, s.h.inbound("תודה"));
    s.h.advance(5 * 60_000);
  }
  return s;
}

const alertsSent = (sent: { kind: string; body?: string }[]) => sent.filter((x) => x.kind === "buttons" && /^\*(מייל דחוף|התנגשות ביומן)/.test(x.body ?? ""));

describe("urgent alerts — at most 2 a day, free text inside the window, the template outside it", () => {
  it("sends the clash and the newest urgent mail; the third is over the cap → deferred", async () => {
    const { h, user, deps } = await urgentSetup();
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toEqual({ status: "done", sent: 2, deferred: 1, candidates: 3 });
    const sent = alertsSent(h.wa.sent);
    expect(sent).toHaveLength(ALERT_DAILY_CAP);
    expect(sent[0]!.body).toBe("*התנגשות ביומן ביום ה׳ 22.10*\n• 11:00 חתימה אצל הנוטריון\n• 11:30 שיחה עם הבנק\n\nאפשר להזיז אחת מהן. כל שינוי מגיע קודם לאישור.");
    expect((sent[0] as { buttons?: { title: string }[] }).buttons!.map((b) => b.title)).toEqual(["לטפל בהתנגשות", "בלי התראות"]);
    expect(sent[1]!.body).toBe("*מייל דחוף*\nמ-עו״ד שפירא: תשובה לבית המשפט\n\nאפשר לנסח תשובה לאישור, או להזכיר מחר.");
    expect((sent[1] as { buttons?: { id: string; title: string }[] }).buttons!.map((b) => b.title)).toEqual(["לנסח תשובה", "להזכיר מחר", "בלי התראות"]);
    const rows = h.db.proactiveAlerts.filter((a) => a.channel === "urgent");
    expect(rows.map((r) => [r.kind, r.status])).toEqual([
      ["conflict", "sent"],
      ["urgent_mail", "sent"],
      ["urgent_mail", "deferred"],
    ]);
  });

  it("never twice: a second scan the same day sends nothing new", async () => {
    const { h, user, deps } = await urgentSetup();
    await runProactiveScanJob(deps, scanJob(user.id));
    h.advance(60 * 60_000);
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toMatchObject({ status: "done", sent: 0 });
    expect(alertsSent(h.wa.sent)).toHaveLength(2);
  });

  it("the cap is per local day: the next morning another may go out", async () => {
    const { h, user, deps, mailbox } = await urgentSetup();
    await runProactiveScanJob(deps, scanJob(user.id));
    h.advance(23 * 3_600_000); // Thursday 09:00
    await processInbound(h.ctx, h.inbound("בוקר טוב"));
    mailbox.fx.state.messages.push(fixtureGraphMessage({ id: "AAMkU3", from: { name: "רו״ח ברק", address: "barak@cpa-barak.co.il" }, subject: "דחוף - עוד שאלה", receivedDateTime: h.ctx.now().toISOString(), bodyPreview: "?" }));
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toMatchObject({ sent: 1 });
  });

  it("outside the 24-hour window: the `proactive_alert` template, under the same cap; [לטפל עכשיו] carries the alert's action", async () => {
    const { h, user, deps } = await urgentSetup({ window: false });
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toEqual({ status: "done", sent: 2, deferred: 1, candidates: 3 });
    const templates = h.wa.sent.filter((x) => x.kind === "template");
    expect(h.wa.sent.filter((x) => x.kind === "buttons")).toEqual([]);
    expect(templates.map((t) => t.template!.name)).toEqual(["proactive_alert", "proactive_alert"]);
    expect(templates[0]!.template!.params.map((p) => p.text)).toEqual(["התנגשות ביומן ביום ה׳ 22.10: 11:00 חתימה אצל הנוטריון חופפת ל-11:30 שיחה עם הבנק"]);
    expect(templates[1]!.template!.params.map((p) => p.text)).toEqual(["מייל דחוף מ-עו״ד שפירא: תשובה לבית המשפט"]);
    const rows = h.db.proactiveAlerts.filter((a) => a.channel === "urgent");
    expect(templates[0]!.template!.buttons.map((b) => b.text)).toEqual([`al:conf:${rows[0]!.id}`, "al:off"]);
    expect(templates[1]!.template!.buttons.map((b) => b.text)).toEqual([`al:reply:${rows[1]!.id}`, "al:off"]);
    expect(rows.map((r) => r.status)).toEqual(["sent", "sent", "deferred"]);
    const stored = (await h.db.recentMessages(user.id, 10)).filter((m) => m.direction === "out");
    expect(stored.map((m) => m.type)).toEqual(["template", "template"]);
    // a press on [לטפל עכשיו] (the template's quick reply) goes on as a request for a reply draft
    await processInbound(h.ctx, h.inbound("לטפל עכשיו", { type: "template_button", reply: { id: `al:reply:${rows[1]!.id}`, title: "לטפל עכשיו" } }));
    expect(h.ai.calls.some((c) => c.messages.some((m) => m.role === "user" && m.content.includes("לנסח תשובה למייל מ-עו״ד שפירא")))).toBe(true);
  });

  it("outside the window, when the template send fails (not approved yet): deferred — the items wait for the next morning summary", async () => {
    const { h, user, deps } = await urgentSetup({ window: false });
    const failing = { ...h.wa, sendTemplate: async () => Promise.reject(new Error("(#132001) Template name does not exist in the translation")) };
    expect(await runProactiveScanJob({ ...deps, wa: failing as unknown as typeof h.wa }, scanJob(user.id))).toEqual({ status: "done", sent: 0, deferred: 3, candidates: 3 });
    expect(h.wa.sent.filter((x) => x.kind !== "read" && x.kind !== "reaction")).toEqual([]);
    // Thursday 07:30: the summary (template, the window is still closed) folds them in, once
    h.advance(21.5 * 3_600_000);
    await runMorningSummaryJob(deps, morningJob(user.id, "2026-10-22"));
    const emails = h.wa.sent.at(-1)!.template!.params[2]!.text;
    expect(emails).toContain("• מייל דחוף מ-עו״ד שפירא — תשובה לבית המשפט");
    expect(emails).toContain("• מייל דחוף מ-רו״ח ברק — דחוף: חתימה על הדוח");
    expect(h.db.proactiveAlerts.filter((a) => a.channel === "urgent").every((a) => a.status === "folded")).toBe(true);
  });
});

describe("urgent alerts — when not", () => {
  it("quiet hours: before 08:00, from 20:00, Friday from 14:00, Saturday, a holiday (Yom Kippur, a Monday)", async () => {
    for (const at of [il(21, 7, 59), il(21, 20), il(23, 14, 30), il(24, 11), il(21, 11, 0, 9)]) {
      const { h, user, deps } = await urgentSetup({ at });
      expect(await runProactiveScanJob(deps, scanJob(user.id)), at.toISOString()).toEqual({ status: "skipped", reason: "quiet hours" });
      expect(alertsSent(h.wa.sent)).toHaveLength(0);
    }
    expect(alertHoursOpen(il(23, 13))).toBe(true); // Friday morning is fine
  });

  it("opt-out ('בלי התראות'), paused, all proactive messages off", async () => {
    for (const profile of [{ alerts_disabled: true }, { proactive_disabled: true }]) {
      const { user, deps } = await urgentSetup({ profile });
      expect(await runProactiveScanJob(deps, scanJob(user.id))).toEqual({ status: "skipped", reason: "alerts off or not pro" });
    }
    const paused = await urgentSetup({ profile: { proactive_paused_until: il(30, 0).toISOString() } });
    expect(await runProactiveScanJob(paused.deps, scanJob(paused.user.id))).toEqual({ status: "skipped", reason: "paused" });
  });

  it("basic: never (the entitlement is checked on the server)", async () => {
    const { h, user, deps } = await urgentSetup({ plan: "basic" });
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toEqual({ status: "skipped", reason: "alerts off or not pro" });
    expect(alertsSent(h.wa.sent)).toHaveLength(0);
    expect(h.db.jobs.filter((j) => j.kind === "proactive_scan")).toHaveLength(0);
  });

  it("not urgent enough: an unknown sender, a mailing, a lookalike sender (phishing), no urgency words", async () => {
    const { h, user, deps, mailbox } = await urgentSetup();
    mailbox.fx.state.events = mailbox.fx.state.events.filter((e) => !e.id.startsWith("AAMkT"));
    mailbox.fx.state.messages = mailbox.fx.state.messages.filter((m) => !m.id.startsWith("AAMkU"));
    const recent = new Date(h.ctx.now().getTime() - 5 * 60_000).toISOString();
    mailbox.fx.state.messages.push(
      fixtureGraphMessage({ id: "x1", from: { name: "זר", address: "someone@stranger.example" }, subject: "דחוף!!", receivedDateTime: recent }),
      fixtureGraphMessage({ id: "x2", from: { name: "ברק", address: "news@cpa-barak.co.il" }, subject: "urgent: webinar", receivedDateTime: recent, internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<mailto:x>" }] }),
      fixtureGraphMessage({ id: "x3", from: { name: "עו״ד שפירא", address: "office@shapira-1aw.co.il" }, subject: "דחוף: תשלום", receivedDateTime: recent }),
      fixtureGraphMessage({ id: "x4", from: { name: "רו״ח ברק", address: "barak@cpa-barak.co.il" }, subject: "סיכום פגישה", receivedDateTime: recent }),
    );
    expect(await runProactiveScanJob(deps, scanJob(user.id))).toEqual({ status: "done", sent: 0, deferred: 0, candidates: 0 });
  });
});

describe("urgent alerts — scheduling", () => {
  it("after a scan the next round hour is queued (same key as SQL schedule_proactive_scans)", async () => {
    const { h, user, deps } = await urgentSetup();
    await runProactiveScanJob(deps, scanJob(user.id));
    const next = h.db.jobs.find((j) => j.kind === "proactive_scan" && j.status === "queued")!;
    expect(next).toMatchObject({ run_at: il(21, 11).toISOString(), dedupe_key: `proactive_scan:${user.id}:2026-10-21T11`, payload: { slot: "2026-10-21T11" } });
    expect(scanDedupeKey(user.id, il(21, 11), "Asia/Jerusalem")).toBe(next.dedupe_key);
  });

  it("the next allowed hour skips the evening, Friday afternoon and Shabbat", () => {
    expect(nextScanAt(il(21, 19, 30))).toEqual(il(22, 8));
    expect(nextScanAt(il(23, 13, 10))).toEqual(il(25, 8)); // Friday 13:10 → Sunday 08:00
  });

  it("a Microsoft new-mail notification queues one scan soon (once per 10 minutes, in alert hours)", async () => {
    const { h, user } = await urgentSetup();
    expect(await queueScanSoon(h.db, user, h.ctx.now())).not.toBeNull();
    expect(await queueScanSoon(h.db, user, new Date(h.ctx.now().getTime() + 60_000))).toBeNull();
    expect(await queueScanSoon(h.db, user, il(21, 22))).toBeNull();
  });

  it("the morning summary job queues the day's first scan (pro only)", async () => {
    const pro = await proactiveSetup({ at: il(21, 7, 30) });
    await runScheduledJob(pro.deps, { ...morningJob(pro.user.id, "2026-10-21"), kind: "morning_summary" });
    expect(pro.h.db.jobs.find((j) => j.kind === "proactive_scan")!.run_at).toBe(il(21, 8).toISOString());
    const basic = await proactiveSetup({ at: il(21, 7, 30), plan: "basic" });
    await runScheduledJob(basic.deps, { ...morningJob(basic.user.id, "2026-10-21"), kind: "morning_summary" });
    expect(basic.h.db.jobs.some((j) => j.kind === "proactive_scan")).toBe(false);
  });
});
