import { effectivePlan, entitlements } from "@/lib/billing/plans";
import { copyM5 } from "@/lib/copy/bot-m5";
import { pcopy } from "@/lib/copy/bot-proactive";
import type { Db, UserRow } from "@/lib/db/types";
import { scheduleReminderJob, createReminder } from "@/lib/reminders/service";
import { DEFAULT_TZ, addDays, formatWhenAbs, parseDateKey, zonedToUtc } from "@/lib/time/zoned";
import type { WaSender } from "@/lib/wa/sender";
import { SUSPICIOUS_CATEGORY } from "@/lib/ms/graph";
import { scheduleProactiveScan } from "./alerts";

/**
 * What the user does with a proactive item (lib/proactive/digest.ts, alerts.ts) and the on / off switch:
 *   al:reply:<id>   "לנסח תשובה"     → a request to the assistant: read the mail, draft a reply → the usual approval card
 *   al:brief:<id>   "תדריך לפגישה"   → a request to the assistant: what happened with these people lately (read-only)
 *   al:conf:<id>    "לטפל בהתנגשות"  → a request to the assistant: help move one of the meetings → an update draft to approve
 *   al:remind:<id>  "להזכיר מחר"     → a reminder tomorrow at 9 (the reminders service; no model)
 *   al:dl:<id>      "תזכורת למועד"   → a reminder the day before the deadline at 9 (no model)
 *   al:susp:<id>    "לסמן כחשוד"     → an Outlook category on the mail (Mail.ReadWrite only; never moved, deleted or answered)
 *   al:off / al:on, "בלי התראות" / "להחזיר התראות" → profile.alerts_disabled (also the toggle in /account)
 * Ids are looked up with the user's id (another user's id is "gone"). Pro only, checked here on the server.
 */

export interface AlertActionDeps {
  db: Db;
  wa: Pick<WaSender, "sendText">;
  now: () => Date;
  /** "לסמן כחשוד": the user's Microsoft 365 mailbox when the grant includes Mail.ReadWrite, else null */
  mailMarker?: (user: UserRow) => Promise<{ markSuspicious(messageId: string): Promise<void> } | null>;
}

export type AlertPress = { handled: true; note: string } | { handled: false; request: string };

type Verb = "reply" | "remind" | "dl" | "conf" | "brief" | "susp";

export function parseAlertButton(id: string): { verb: Verb; alertId: string } | { verb: "off" | "on" } | null {
  if (id === "al:off" || id === "al:on") return { verb: id === "al:off" ? "off" : "on" };
  const m = id.match(/^al:(reply|remind|dl|conf|brief|susp):([0-9a-f-]{36})$/);
  return m ? { verb: m[1] as Verb, alertId: m[2]! } : null;
}

const OFF_RE = /^(?:בלי|ללא|לכבות(?:\s+את)?|תכבי(?:\s+את)?|כיבוי|להפסיק(?:\s+את)?|תפסיקי(?:\s+את)?|עצירת)\s+(?:ה)?התראות(?:\s+(?:ה)?יזומות)?\s*[.!]*$/;
const ON_RE = /^(?:להחזיר|תחזירי|החזרת|להפעיל|תפעילי|הפעלת)(?:\s+את)?\s+(?:ה)?התראות(?:\s+(?:ה)?יזומות)?\s*[.!]*$/;

/** "בלי התראות" → "off", "להחזיר התראות" → "on", anything else → null. */
export function alertCommandOf(text: string): "off" | "on" | null {
  const t = text.trim().replace(/\s+/g, " ");
  return OFF_RE.test(t) ? "off" : ON_RE.test(t) ? "on" : null;
}

export async function proIncluded(db: Db, user: UserRow, now: Date): Promise<boolean> {
  return entitlements(effectivePlan(await db.getSubscription(user.id), now)).proactive;
}

/** Turns proactive alerts on or off (WhatsApp command, button, /account toggle). The reply, or the pro line on other plans. */
export async function setAlertsEnabled(db: Db, user: UserRow, enabled: boolean, now: Date, source: "whatsapp" | "account"): Promise<{ ok: boolean; changed: boolean; message: string }> {
  if (!(await proIncluded(db, user, now))) return { ok: false, changed: false, message: pcopy["alert.pro_only"]() };
  const wasOn = user.profile.alerts_disabled !== true;
  if (wasOn === enabled) return { ok: true, changed: false, message: enabled ? pcopy["alert.already_on"]() : pcopy["alert.already_off"]() };
  await db.mergeUserProfile(user.id, { alerts_disabled: !enabled });
  await db.addAudit({ user_id: user.id, action: enabled ? "proactive.on" : "proactive.off", target: source, result: "ok" });
  if (!enabled) await db.cancelJobs(user.id, "proactive_scan");
  else {
    const fresh = await db.getUser(user.id);
    if (fresh) await scheduleProactiveScan(db, fresh, now).catch(() => null);
  }
  return { ok: true, changed: true, message: enabled ? pcopy["alert.on"]() : pcopy["alert.off"]() };
}

async function say(deps: AlertActionDeps, user: UserRow, to: string, text: string): Promise<void> {
  await deps.wa.sendText(to, text);
  await deps.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A press on an `al:` button or list row. A request for the assistant comes back as `request` (the pipeline goes on). */
export async function handleAlertButton(deps: AlertActionDeps, user: UserRow, to: string, buttonId: string): Promise<AlertPress> {
  const parsed = parseAlertButton(buttonId);
  const now = deps.now();
  if (!parsed) {
    await say(deps, user, to, pcopy["alert.gone"]());
    return { handled: true, note: "alert button: unknown" };
  }
  if (!("alertId" in parsed)) {
    const r = await setAlertsEnabled(deps.db, user, parsed.verb === "on", now, "whatsapp");
    await say(deps, user, to, r.message);
    return { handled: true, note: `alerts ${parsed.verb}` };
  }
  if (!(await proIncluded(deps.db, user, now))) {
    await say(deps, user, to, pcopy["alert.pro_only"]());
    return { handled: true, note: "alert button: not pro" };
  }
  const alert = await deps.db.getProactiveAlert(user.id, parsed.alertId);
  if (!alert) {
    await say(deps, user, to, pcopy["alert.gone"]());
    return { handled: true, note: "alert button: gone" };
  }
  const p = alert.payload;
  const tz = user.timezone || DEFAULT_TZ;
  switch (parsed.verb) {
    case "reply": {
      if (!str(p.message_id)) break;
      return { handled: false, request: pcopy["alert.request.reply"](str(p.who), str(p.subject), str(p.message_id), p.provider === "google") };
    }
    case "brief":
      if (!str(p.meeting)) break;
      return { handled: false, request: pcopy["alert.request.brief"](str(p.meeting), str(p.attendees)) };
    case "conf":
      if (!str(p.a) || !str(p.b)) break;
      return { handled: false, request: pcopy["alert.request.conflict"](str(p.a), str(p.b)) };
    case "remind": {
      const r = await createReminder(deps.db, user, { text: pcopy["alert.reminder.reply"](str(p.who), str(p.subject)), when: "מחר ב-9" }, now);
      await say(deps, user, to, r.reply);
      return { handled: true, note: "alert: reminder tomorrow" };
    }
    case "dl": {
      const deadline = parseDateKey(str(p.deadline));
      if (!deadline) break;
      // the day before at 9:00; too late for that → the deadline's morning at 8:00; too late for that → in an hour
      const candidates = [zonedToUtc({ ...addDays(deadline, -1), hour: 9, minute: 0 }, tz), zonedToUtc({ ...deadline, hour: 8, minute: 0 }, tz)];
      const due = candidates.find((d) => d.getTime() > now.getTime() + 10 * 60_000) ?? new Date(now.getTime() + 3_600_000);
      const text = pcopy["alert.reminder.deadline"](str(p.day_label) || "היום", str(p.subject)).slice(0, 300);
      const reminder = await scheduleReminderJob(deps.db, await deps.db.createReminder({ user_id: user.id, text, due_at: due }));
      await deps.db.addAudit({ user_id: user.id, action: "reminder.create", target: reminder.id, result: "proactive" });
      await say(deps, user, to, copyM5["act.reminder.set"](formatWhenAbs(due, now, tz), text));
      return { handled: true, note: "alert: deadline reminder" };
    }
    case "susp": {
      const marker = p.provider === "microsoft" && deps.mailMarker ? await deps.mailMarker(user).catch(() => null) : null;
      if (!marker || !str(p.message_id)) {
        await say(deps, user, to, pcopy["alert.phishing.mark_unavailable"]());
        return { handled: true, note: "alert: mark unavailable" };
      }
      try {
        await marker.markSuspicious(str(p.message_id));
      } catch (e) {
        console.warn(`[proactive] mark suspicious failed for ${user.id}:`, (e as Error).message);
        await say(deps, user, to, pcopy["alert.phishing.mark_unavailable"]());
        return { handled: true, note: "alert: mark failed" };
      }
      await deps.db.addAudit({ user_id: user.id, action: "mail.mark_suspicious", target: alert.item_key, result: "ok" });
      await say(deps, user, to, pcopy["alert.phishing.marked"](SUSPICIOUS_CATEGORY));
      return { handled: true, note: "alert: marked suspicious" };
    }
  }
  await say(deps, user, to, pcopy["alert.gone"]());
  return { handled: true, note: "alert button: incomplete item" };
}

/** "בלי התראות" / "להחזיר התראות" typed in the chat — not counted, no model. False when the text is something else. */
export async function handleAlertCommand(deps: AlertActionDeps, user: UserRow, to: string, text: string): Promise<boolean> {
  const cmd = alertCommandOf(text);
  if (!cmd) return false;
  const r = await setAlertsEnabled(deps.db, user, cmd === "on", deps.now(), "whatsapp");
  await say(deps, user, to, r.message);
  return true;
}
