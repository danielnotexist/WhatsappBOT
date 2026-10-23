import { oneLineUntrusted } from "@/lib/ai/untrusted";
import { alertButtons, pcopy, phishingReasons } from "@/lib/copy/bot-proactive";
import type { Db, NewProactiveItem, ProactiveAlertRow, ProactiveKind } from "@/lib/db/types";
import { emailsAwaitingReply, type MailLike, type SentRef } from "@/lib/jobs/awaiting-reply";
import { compareDates, addDays, dateKey, dayLabelHe, localDateOf, type LocalDate } from "@/lib/time/zoned";
import type { ListRow } from "@/lib/wa/types";
import { clockOf, externalAttendees, findBackToBack, findConflicts, pairKey, type CalEvent, type EventPair } from "./calendar";
import type { MailClassifier } from "./classify";
import { extractDeadline, hasDeadlineCue } from "./deadlines";
import { isAutomatedMail, waitingBusinessDays, type ProactiveMail } from "./mail";
import { checkPhishing, type Contact, type PhishingCheck } from "./phishing";

/**
 * "דברים שכדאי לא לפספס" — the pro section of the morning summary (Daniel's decision, 23.10.2026;
 * docs/research/instinct.md §8 #1, #2, #4 and #3):
 *   - phishing / BEC warnings on mails of the last 3 days (read-only: a warning and, when the account allows it, "לסמן כחשוד");
 *   - urgent alerts that could not be sent (the 24-hour window was closed, or the day's 2 were used) — folded in here;
 *   - today's calendar: overlapping meetings, back-to-back meetings in two places;
 *   - deadlines written in mails of the last 14 days that fall today … in 7 days ("עד יום ה׳", "עד ה-30.10");
 *   - mails from people waiting for a reply 2 business days or more (no newsletters / no-reply / automated);
 *   - a meeting later today with someone from outside → a one-line offer of a brief.
 * Each line is stored (proactive_alerts, channel summary) so its buttons can find it: al:<verb>:<id>. Nothing is sent
 * or changed by a button without the usual approval — a reply is a draft, a meeting change is a draft.
 */

export type AlertVerb = "reply" | "remind" | "dl" | "conf" | "brief" | "susp";

const VERB_TITLE: Record<AlertVerb, string> = { reply: alertButtons.reply, remind: alertButtons.remind, dl: alertButtons.deadline, conf: alertButtons.conflict, brief: alertButtons.brief, susp: alertButtons.suspicious };

export const DIGEST_LIMITS = { phishing: 2, folded: 3, conflicts: 2, backToBack: 1, deadlines: 3, awaiting: 3, external: 2, lines: 9, rows: 10, deadlineDays: 7, lookbackDays: 14, phishingDays: 3 } as const;

export interface DigestSources {
  /** inbox mails of the last DIGEST_LIMITS.lookbackDays days, both mailboxes */
  mails: ProactiveMail[];
  /** the user's sent mail (conversation + time), both mailboxes */
  sent: SentRef[];
  /** people the user wrote to (the phishing checks' known contacts) */
  known: Contact[];
  /** today's meetings, both calendars */
  events: CalEvent[];
  selfAddresses: string[];
  /** may "לסמן כחשוד" act on this mailbox (Microsoft 365 with Mail.ReadWrite) */
  canMark(provider: ProactiveMail["provider"]): boolean;
}

export interface Digest {
  /** the section's lines, in order */
  lines: string[];
  /** the lines about mail / about the calendar — the template (outside the window) folds them into its two sections */
  mailLines: string[];
  calendarLines: string[];
  /** one list row per action (inside the window) */
  rows: ListRow[];
  /** the first "לנסח תשובה" item: the template's [לנסח תשובה] quick reply carries it */
  replyId: string | null;
  /** the mails the section shows (the summary's "מיילים שמחכים לתשובה" leaves them out) */
  mailIds: string[];
}

interface Item {
  kind: ProactiveKind;
  key: string;
  line: string;
  mail: boolean;
  payload: Record<string, unknown>;
  verbs: AlertVerb[];
  /** the list row's description */
  about: string;
}

const who = (m: Pick<ProactiveMail, "from">) => oneLineUntrusted(m.from?.name || m.from?.address || "", 40) || "?";
const subj = (m: Pick<ProactiveMail, "subject">) => oneLineUntrusted(m.subject || "", 80) || "(ללא נושא)";
const meetingLabel = (e: CalEvent, tz: string) => `${clockOf(e.startMs, tz)} ${oneLineUntrusted(e.title || "(ללא כותרת)", 60)}`;
const mailKey = (m: ProactiveMail) => `mail:${m.provider}:${m.id}`;
const mailPayload = (m: ProactiveMail) => ({ provider: m.provider, message_id: m.id, who: who(m), subject: subj(m) });

export function attendeesLabel(list: { name: string; address: string }[]): string {
  const first = oneLineUntrusted(list[0]?.name || list[0]?.address || "", 40);
  return list.length > 1 ? `${first} ועוד ${list.length - 1}` : first;
}

/** "היום" / "מחר" / "ביום ה׳ 22.10" — the deadline's day as it reads after "מועד". */
export function deadlineWhen(date: LocalDate, today: LocalDate): string {
  if (compareDates(date, today) === 0) return "היום";
  if (compareDates(date, addDays(today, 1)) === 0) return "מחר";
  return `ב${dayLabelHe(date)}`;
}

/** Why a check flagged the mail, in words. */
export function phishingReasonText(check: Pick<PhishingCheck, "signals" | "imitates">): string {
  const imitates = check.imitates ? oneLineUntrusted(check.imitates, 60) : null;
  return check.signals
    .filter((s) => s !== "login_link" || check.signals.length === 1)
    .slice(0, 3)
    // one name per warning: with a lookalike domain, the display name is just "a known name"
    .map((s) => phishingReasons[s](s === "display_name_spoof" && check.signals.includes("lookalike_domain") ? null : imitates))
    .join("; ");
}

/** The line of a folded urgent alert (deferred: the window was closed, or the day's alerts were used). */
function foldedItem(row: ProactiveAlertRow): Item | null {
  const p = row.payload as Record<string, string | undefined>;
  if (row.kind === "urgent_mail" && p.who && p.subject) return { kind: "urgent_mail", key: row.item_key, line: pcopy["alert.item.urgent_mail"](p.who, p.subject), mail: true, payload: p, verbs: ["reply", "remind"], about: `${p.who} — ${p.subject}` };
  if (row.kind === "conflict" && p.a && p.b) return { kind: "conflict", key: row.item_key, line: pcopy["alert.item.conflict"](p.a, p.b), mail: false, payload: p, verbs: ["conf"], about: `${p.a} / ${p.b}` };
  return null;
}

/**
 * A row title not used yet in the list (≤ 24 characters): the action, then "· <first word of the item>" for a second
 * row of the same action ("לנסח תשובה · רונית"), then a number.
 */
export function uniqueTitle(title: string, about: string, rows: readonly ListRow[]): string {
  const taken = new Set(rows.map((r) => r.title));
  if (!taken.has(title)) return title;
  const first = about.split(/[\s—,]+/).find(Boolean) ?? "";
  const named = `${title} · ${first}`.slice(0, 24).trim();
  if (first && !taken.has(named)) return named;
  for (let n = 2; ; n++) if (!taken.has(`${title} ${n}`)) return `${title} ${n}`;
}

export interface DigestInput {
  db: Db;
  userId: string;
  now: Date;
  tz: string;
  day: LocalDate;
  sources: DigestSources;
  classifier: MailClassifier;
}

export async function buildDigest(input: DigestInput): Promise<Digest> {
  const { db, userId, now, tz, day, sources, classifier } = input;
  const items: Item[] = [];
  const used = new Set<string>(); // mail ids already shown (one line per mail)
  const recent = (m: ProactiveMail, days: number) => {
    const t = Date.parse(m.receivedDateTime);
    return Number.isFinite(t) && t <= now.getTime() && t >= now.getTime() - days * 86_400_000;
  };
  const repliedAfter = new Map<string, number>();
  for (const s of sources.sent) if (s.conversationId) repliedAfter.set(s.conversationId, Math.max(repliedAfter.get(s.conversationId) ?? 0, Date.parse(s.sentDateTime) || 0));
  const answered = (m: ProactiveMail) => Boolean(m.conversationId) && (repliedAfter.get(m.conversationId!) ?? 0) > Date.parse(m.receivedDateTime);
  const ctx = { known: sources.known, selfAddresses: sources.selfAddresses };

  // 1. phishing / BEC — every recent mail (also automated-looking ones: attacks imitate notifications); not when answered
  const mails = [...sources.mails].sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime));
  let phishing = 0;
  for (const m of mails) {
    if (phishing >= DIGEST_LIMITS.phishing) break;
    if (!recent(m, DIGEST_LIMITS.phishingDays) || answered(m)) continue;
    const check = checkPhishing(m, ctx);
    let flagged = check.level === "suspicious";
    if (check.level === "borderline" && !m.isRead) flagged = (await classifier.phishing(m)) === true;
    if (!flagged) continue;
    used.add(m.id);
    const reasons = phishingReasonText(check);
    items.push({ kind: "phishing", key: `phishing:${m.provider}:${m.id}`, line: pcopy["alert.item.phishing"](who(m), subj(m), reasons), mail: true, payload: { ...mailPayload(m), signals: check.signals }, verbs: sources.canMark(m.provider) ? ["susp"] : [], about: `${who(m)} — ${subj(m)}` });
    phishing++;
  }
  // mails flagged by the rules alone stay out of every other line, even past the phishing lines' limit
  for (const m of mails) if (!used.has(m.id) && recent(m, DIGEST_LIMITS.lookbackDays) && checkPhishing(m, ctx).level === "suspicious") used.add(m.id);

  // 2. urgent alerts that were not sent (deferred) — shown here once
  const folded = await db.foldDeferredProactiveAlerts(userId, new Date(now.getTime() - 48 * 3_600_000));
  for (const row of folded.slice(0, DIGEST_LIMITS.folded)) {
    const it = foldedItem(row);
    if (it) items.push(it);
  }

  // 3. today's calendar
  const conflicts = findConflicts(sources.events).slice(0, DIGEST_LIMITS.conflicts);
  const pairItem = (kind: "conflict" | "back_to_back", p: EventPair): Item => {
    const a = meetingLabel(p.a, tz);
    const b = meetingLabel(p.b, tz);
    return { kind, key: pairKey(kind === "conflict" ? "conflict" : "b2b", p), line: kind === "conflict" ? pcopy["alert.item.conflict"](a, b) : pcopy["alert.item.back_to_back"](a, b), mail: false, payload: { a, b, a_id: `${p.a.provider}:${p.a.id}`, b_id: `${p.b.provider}:${p.b.id}` }, verbs: ["conf"], about: `${a} / ${b}`.slice(0, 72) };
  };
  for (const p of conflicts) if (!items.some((i) => i.key === pairKey("conflict", p))) items.push(pairItem("conflict", p));
  for (const p of findBackToBack(sources.events).slice(0, DIGEST_LIMITS.backToBack)) items.push(pairItem("back_to_back", p));

  // 4. deadlines from mails (people only), today … in 7 days; one per conversation
  const today = day;
  const lastDay = addDays(today, DIGEST_LIMITS.deadlineDays);
  const seenConv = new Set<string>();
  let deadlines = 0;
  for (const m of mails) {
    if (deadlines >= DIGEST_LIMITS.deadlines) break;
    if (used.has(m.id) || !recent(m, DIGEST_LIMITS.lookbackDays) || isAutomatedMail(m)) continue;
    if (m.conversationId && seenConv.has(m.conversationId)) continue;
    const sentAt = new Date(Date.parse(m.receivedDateTime));
    let date = extractDeadline(`${m.subject}\n${m.text}`, sentAt, input.tz)?.date ?? null;
    if (!date && hasDeadlineCue(`${m.subject}\n${m.text}`)) date = await classifier.deadline(m, dateKey(localDateOf(sentAt, tz)));
    if (!date || compareDates(date, today) < 0 || compareDates(date, lastDay) > 0) continue;
    if (m.conversationId) seenConv.add(m.conversationId);
    used.add(m.id);
    const label = deadlineWhen(date, today);
    items.push({ kind: "deadline", key: `deadline:${m.provider}:${m.id}`, line: pcopy["alert.item.deadline"](label, subj(m), who(m)), mail: true, payload: { ...mailPayload(m), deadline: dateKey(date), day_label: label }, verbs: answered(m) ? ["dl"] : ["reply", "dl"], about: `${who(m)} — ${subj(m)}` });
    deadlines++;
  }

  // 5. waiting for a reply ≥ 2 business days (the awaiting-reply heuristic, over 14 days)
  const likes: (MailLike & { pm: ProactiveMail })[] = mails.filter((m) => !used.has(m.id) && !isAutomatedMail(m)).map((m) => ({ subject: m.subject, from: m.from, receivedDateTime: m.receivedDateTime, isRead: m.isRead, bodyPreview: m.text, conversationId: m.conversationId, pm: m }));
  const self = sources.selfAddresses[0] ?? null;
  const waiting = emailsAwaitingReply(likes, sources.sent, { selfAddress: self, now, maxAgeDays: DIGEST_LIMITS.lookbackDays, limit: 20 })
    .filter((w) => !sources.selfAddresses.includes(w.pm.from?.address ?? "") && (!w.pm.conversationId || !seenConv.has(w.pm.conversationId)))
    .map((w) => ({ m: w.pm, days: waitingBusinessDays(w.pm, now, tz) }))
    .filter((w) => w.days >= 2)
    .sort((a, b) => b.days - a.days)
    .slice(0, DIGEST_LIMITS.awaiting);
  for (const { m, days } of waiting) {
    used.add(m.id);
    items.push({ kind: "awaiting_reply", key: mailKey(m), line: pcopy["alert.item.awaiting"](who(m), subj(m), days), mail: true, payload: { ...mailPayload(m), days }, verbs: ["reply", "remind"], about: `${who(m)} — ${subj(m)}` });
  }

  // 6. a meeting later today with someone from outside → a brief
  let external = 0;
  for (const e of [...sources.events].sort((a, b) => a.startMs - b.startMs)) {
    if (external >= DIGEST_LIMITS.external) break;
    if (e.allDay || !(e.startMs > now.getTime())) continue;
    const outside = externalAttendees(e, sources.selfAddresses);
    if (!outside.length) continue;
    const meeting = meetingLabel(e, tz);
    const names = attendeesLabel(outside);
    items.push({ kind: "external_meeting", key: `meeting:${e.provider}:${e.id}`, line: pcopy["alert.item.external"](meeting, names), mail: false, payload: { meeting, attendees: names }, verbs: ["brief"], about: `${meeting} — ${names}`.slice(0, 72) });
    external++;
  }

  // store every shown line (its buttons look it up) and build the rows
  const shown = items.slice(0, DIGEST_LIMITS.lines);
  const rows: ListRow[] = [];
  let replyId: string | null = null;
  const localDay = dateKey(day);
  for (const it of shown) {
    const row = await db.addProactiveSummaryItem({ user_id: userId, item_key: it.key, kind: it.kind, local_day: localDay, payload: it.payload } satisfies NewProactiveItem);
    for (const verb of it.verbs) {
      if (verb === "reply" && !replyId) replyId = row.id;
      if (rows.length < DIGEST_LIMITS.rows) rows.push({ id: `al:${verb}:${row.id}`, title: uniqueTitle(VERB_TITLE[verb], it.about, rows), description: it.about.slice(0, 72) });
    }
  }
  return {
    lines: shown.map((i) => i.line),
    mailLines: shown.filter((i) => i.mail).map((i) => i.line),
    calendarLines: shown.filter((i) => !i.mail).map((i) => i.line),
    rows,
    replyId,
    mailIds: shown.map((i) => i.payload.message_id).filter((id): id is string => typeof id === "string"),
  };
}
