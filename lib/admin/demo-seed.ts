import { createHash, randomUUID } from "node:crypto";
import type { MemoryDb } from "@/lib/db/memory";
import type { ConnectionRow, PlanKind, SignupSource, SubscriptionRow } from "@/lib/db/types";
import { dateKey, localDateOf } from "@/lib/time/zoned";

/**
 * Made-up but believable activity for the admin panel in DATA_MODE=memory (POST /api/dev/admin-seed): a month of
 * sign-ups from a few sources, plans, connections (some expired), WhatsApp conversations with tools and costs, payments,
 * tickets, website chats, errors and a failed job. Development and screenshots only — never in production (the route
 * refuses outside memory mode). Every person here is fictional; the addresses are on example domains.
 */

const PEOPLE: { name: string; business: string; type: string }[] = [
  { name: "דנה לוי", business: "משרד עו״ד לוי", type: "law" },
  { name: "יוסי כהן", business: "כהן רואי חשבון", type: "accounting" },
  { name: "מיכל אברהם", business: "סטודיו מיכל לעיצוב", type: "design" },
  { name: "אורי שפירא", business: "שפירא נדל״ן", type: "real_estate" },
  { name: "נועה בן דוד", business: "קליניקה לפיזיותרפיה", type: "clinic" },
  { name: "רון מזרחי", business: "מזרחי שיפוצים", type: "construction" },
  { name: "תמר גולן", business: "גולן ייעוץ ארגוני", type: "consulting" },
  { name: "איתי פרץ", business: "פרץ ביטוחים", type: "insurance" },
  { name: "שירה נחום", business: "שירה צילום", type: "photo" },
  { name: "עמית רוזן", business: "רוזן הנדסה", type: "engineering" },
  { name: "ליאת חדד", business: "חדד קוסמטיקה", type: "beauty" },
  { name: "גיל אוחיון", business: "אוחיון הובלות", type: "logistics" },
  { name: "הילה שגיא", business: "שגיא תרגומים", type: "translation" },
  { name: "בועז קליין", business: "קליין יועצי מס", type: "accounting" },
  { name: "מורן דיין", business: "דיין אדריכלות", type: "architecture" },
  { name: "אלון ברק", business: "ברק מחשבים", type: "it" },
  { name: "ענבל ויס", business: "ויס הדרכות", type: "training" },
  { name: "דוד אלמוג", business: "אלמוג חשמל", type: "electric" },
  { name: "רותם יעקב", business: "יעקב משפחה וגישור", type: "law" },
  { name: "קרן סעדה", business: "סעדה תזונה", type: "clinic" },
  { name: "ניר טל", business: "טל שיווק דיגיטלי", type: "marketing" },
  { name: "אסף לנדאו", business: "לנדאו השקעות", type: "finance" },
];

const SOURCES: (SignupSource | null)[] = [
  { utm_source: "google", utm_medium: "cpc", utm_campaign: "brand-he" },
  { utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "lawyers-oct" },
  { ref: "www.linkedin.com" },
  { utm_source: "google", utm_medium: "cpc", utm_campaign: "accountants" },
  { utm_source: "instagram", utm_medium: "story" },
  null,
  { ref: "www.google.com" },
  { utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch" },
  { utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "lawyers-oct" },
  { ref: "chat.whatsapp.com" },
];

const CONVERSATION: { in: string; out: string; tools: string[]; model: string; cost: number }[] = [
  { in: "מה יש לי מחר ביומן?", out: "מחר שלוש פגישות: 09:30 עם משפחת לוי (Teams), 12:00 ארוחת צהריים עם רו״ח כהן, ו-16:00 שיחה עם הבנק.", tools: ["list_events"], model: "claude-sonnet-5-5", cost: 0.0142 },
  { in: "תזכירי לי מחר בשמונה להתקשר לעו״ד שמעוני", out: "קבעתי תזכורת למחר ב-08:00: להתקשר לעו״ד שמעוני.", tools: ["create_reminder"], model: "claude-haiku-5-5", cost: 0.0021 },
  { in: "יש מיילים חשובים מהבוקר?", out: "שניים שכדאי לראות: הצעת מחיר מספק ההדפסה (ממתינה לתשובה עד חמישי), ותזכורת מהבנק על חתימה על מסמכים.", tools: ["search_emails", "get_email"], model: "claude-sonnet-5-5", cost: 0.0213 },
  { in: "תכיני תשובה לספק שאנחנו מאשרים", out: "הכנתי טיוטה לספק ההדפסה. אפשר לשלוח, לערוך או לבטל.", tools: ["draft_email"], model: "claude-sonnet-5-5", cost: 0.0187 },
  { in: "תודה!", out: "בשמחה.", tools: [], model: "claude-haiku-5-5", cost: 0.0006 },
];

const iso = (ms: number) => new Date(ms).toISOString();

/** A long link as the bot really sends it (the sign-in link to connect Google) — it must wrap inside the bubble. */
const LONG_LINK = "http://localhost:3000/api/auth/google/start?t=OTI0YjkyZjEtM2E0Yy00ZDFhLWI2ZGQtN2UxYjQ1ZTkwYzAyLjE3NjEzMDQ4MDAuYTlmM2U4ZDJjNzFiNGE2ZTkwZjNkMmM3YjFhNGU2ZjBkOGMzYjJhMWU5ZjBhN2Q2YzViNGUz";

/** More of a working month, for the first person's conversation reader and timeline. */
const MORE: { in: string; out: string; tools: string[]; model: string; cost: number; voice?: boolean; buttons?: boolean; hidden?: boolean }[] = [
  { in: "מה הזמנים הפנויים שלי ביום חמישי?", out: "ביום חמישי פנוי בין 10:00 ל-12:00 ואחרי 15:30.", tools: ["list_events"], model: "claude-sonnet-5-5", cost: 0.0118 },
  { in: "תקבעי פגישה עם משפחת כהן ביום חמישי בעשר", out: "הכנתי פגישה ביום חמישי ב-10:00 עם משפחת כהן, שעה אחת. לקבוע?", tools: ["create_event"], model: "claude-sonnet-5-5", cost: 0.0164, buttons: true },
  { in: "תחפשי את החוזה של שמעוני בקבצים", out: "מצאתי שני קבצים: ״חוזה שכירות - שמעוני.docx״ מ-12.10 ו״נספח א׳.pdf״. לקרוא לך את עיקרי החוזה?", tools: ["search_files"], model: "claude-sonnet-5-5", cost: 0.0156, voice: true },
  { in: "כן, מה תקופת ההתחייבות?", out: "החוזה ל-24 חודשים מ-1.11.2026, עם אופציה להארכה ב-12 חודשים בהודעה של 60 יום מראש.", tools: ["get_file_text"], model: "claude-sonnet-5-5", cost: 0.0342 },
  { in: "תזכירי לי כל יום ראשון בתשע לשלוח דוח שבועי", out: "קבעתי תזכורת קבועה: כל יום ראשון ב-09:00, לשלוח דוח שבועי.", tools: ["create_reminder"], model: "claude-haiku-5-5", cost: 0.0024 },
  { in: "איך מחברים גם את Google?", out: `כדי לחבר את Google, אפשר להיכנס לקישור הזה (בתוקף ל-30 דקות): ${LONG_LINK}`, tools: [], model: "claude-haiku-5-5", cost: 0.0019 },
  { in: "תעבירי את המייל מהבנק לרואה החשבון", out: "הכנתי העברה של ״מסמכים לחתימה - בנק הפועלים״ ליוסי כהן. לשלוח?", tools: ["search_emails", "forward_email"], model: "claude-sonnet-5-5", cost: 0.0201, buttons: true },
  { in: "סוכנים", out: "הסוכנים שלך: מנהלת חשבונות (פעילה), עוזרת משפטית (כבויה). אפשר להפעיל, לכבות או ליצור חדש.", tools: [], model: "claude-haiku-5-5", cost: 0, buttons: true, hidden: true },
  { in: "תוסיפי משימה להכין הצעת מחיר ללנדאו", out: "הוספתי משימה ב-To Do: להכין הצעת מחיר ללנדאו.", tools: ["todo_create_task"], model: "claude-haiku-5-5", cost: 0.0031 },
  { in: "מה עם המייל של הספק? ענו?", out: "עוד לא. שלחת להם ביום שני, ושני מיילים נוספים מחכים לתשובה מהם מאז שבוע שעבר.", tools: ["search_emails"], model: "claude-sonnet-5-5", cost: 0.0133, voice: true },
];

type Exchange = (typeof MORE)[number];

/**
 * The first person: a varied month — about two hundred messages, the long link (the last message, so the reader opens
 * on it), voice notes, buttons, agent management, and a timeline across every category with errors, a failed job and
 * billing approvals.
 */
function richActivity(db: MemoryDb, id: string, created: number, t: number): void {
  const day = 86_400_000;
  const days = Math.max(1, Math.floor((t - created) / day));
  const script: Exchange[] = [...CONVERSATION, ...MORE];
  const msgs: MemoryDb["messages"] = [];
  const audit: MemoryDb["audit"] = [];
  const add = (action: string, at: number, result = "ok", target: string | null = null, extra: Partial<MemoryDb["audit"][number]> = {}) => {
    if (at <= t) audit.push({ user_id: id, action, target, result, created_at: iso(at), ...extra });
  };
  for (let d = 0; d <= days; d++) {
    const dayStart = created + d * day;
    const perDay = 2 + ((d * 7) % 4);
    if (d % 2 === 0) add("login", dayStart + 8 * 3_600_000);
    add("morning_summary.send", dayStart + 7.5 * 3_600_000, "text");
    for (let k = 0; k < perDay; k++) {
      const ex = d === days && k === perDay - 1 ? MORE[5]! : script[(d * 3 + k) % script.length]!;
      const at = Math.min(t - (perDay - k) * 120_000, dayStart + (9 + k * 2) * 3_600_000 + ((d * 13) % 50) * 60_000);
      const hidden = Boolean(ex.hidden);
      msgs.push({ id: randomUUID(), user_id: id, wa_message_id: `wamid.demo.rich.${d}.${k}`, direction: "in", type: ex.voice ? "audio" : "text", text: ex.voice ? null : ex.in, media_url: null, transcript: ex.voice ? ex.in : null, model_used: null, tokens_in: null, tokens_out: null, cost_usd: null, agent_key: null, hidden_from_model: hidden, tools: [], created_at: iso(at) });
      msgs.push({ id: randomUUID(), user_id: id, wa_message_id: null, direction: "out", type: ex.buttons ? "button" : "text", text: ex.out, media_url: null, transcript: null, model_used: ex.cost ? ex.model : null, tokens_in: ex.cost ? 2600 : null, tokens_out: ex.cost ? 140 : null, cost_usd: ex.cost || null, agent_key: null, hidden_from_model: hidden, tools: ex.tools, created_at: iso(at + 5000) });
      if (ex.tools.includes("create_reminder")) add("reminder.create", at + 6000, "ok", randomUUID());
      if (ex.tools.includes("create_event")) add(d % 3 ? "create_event.execute" : "create_event.cancel", at + 60_000, d % 3 ? "ok" : "cancelled", randomUUID());
      if (ex.tools.includes("forward_email")) add("forward_mail.execute", at + 90_000, d % 4 === 1 ? "failed" : "ok", randomUUID());
      if (ex.tools.includes("draft_email")) add("send_mail.execute", at + 120_000, "ok", randomUUID());
      if (ex.tools.includes("todo_create_task")) add("ms.todo.create", at + 6000, "ok", randomUUID());
    }
    if (d % 3 === 1) add("reminder.fire", dayStart + 8 * 3_600_000 + 60_000, "text", randomUUID());
    if (d % 5 === 2) add("reminder.done", dayStart + 8 * 3_600_000 + 20 * 60_000, "ok", randomUUID());
    if (d % 6 === 3) add("proactive.alert", dayStart + 13 * 3_600_000, "sent", "invoice_due");
    if (d % 9 === 4) add("reminder.snooze", dayStart + 15 * 3_600_000, "1h", randomUUID());
  }
  // account moments over the month
  const ago = (daysAgo: number, hour: number) => Math.max(created + 60_000, t - daysAgo * day + (hour - 12) * 3_600_000);
  add("wa.unlink", ago(25, 9), "ok", randomUUID());
  add("wa.link", ago(25, 9.3), "ok", "+97250•••4567");
  add("google.connect", ago(20, 11), "ok", "dana@example.co.il");
  add("agent.create", ago(18, 14), "ok", "accountant", { agent_key: "accountant", agent_name: "מנהלת חשבונות", reason: "account" });
  add("payment.return", ago(15, 11.9), "declined:6", "DEMO");
  add("billing.offer.upgrade", ago(15, 12), "amount:353 ₪", randomUUID());
  add("billing.approve.upgrade", ago(15, 12.1), "ok", randomUUID());
  add("subscription.upgrade", ago(15, 12.1), "ok", "pro");
  add("agent.create", ago(12, 16), "ok", "custom_1", { agent_key: "custom_1", agent_name: "עוזרת משפטית", reason: "whatsapp" });
  add("connection.expired", ago(9, 3), "google:invalid_grant");
  add("google.revoke", ago(9, 10), "ok");
  add("google.connect", ago(9, 10.2), "error:access_denied");
  add("mail.mark_suspicious", ago(6, 10), "ok", "fake-invoice");
  add("meeting.summary.ask", ago(5, 9.5), "queued", "teams");
  add("meeting.summary", ago(5, 11), "sent_text", "teams");
  add("meeting.tasks", ago(5, 11.2), "3/3", randomUUID());
  add("agent.disable", ago(4, 9), "ok", "custom_1", { agent_key: "custom_1", agent_name: "עוזרת משפטית", reason: "whatsapp" });
  add("auth.login_whatsapp", ago(3, 21), "ok");
  add("subscription.charge", ago(2, 6), "failed:33:card", randomUUID());
  add("billing.card_link", ago(2, 6.1), "sent");
  add("billing.card_update", ago(1, 18), "ok");
  add("subscription.charge", ago(1, 18.1), "ok", "DEMO-0-2");
  msgs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  audit.sort((a, b) => a.created_at.localeCompare(b.created_at));
  db.messages.push(...msgs);
  db.audit.push(...audit);
  db.billingApprovals.push(
    { id: randomUUID(), user_id: id, kind: "upgrade", plan: "pro", amount_ils: 352.82, details: {}, phone_e164: "+972501234567", status: "succeeded", expires_at: iso(ago(15, 12.2)), approved_msg_id: "wamid.demo.rich.approve", approved_at: iso(ago(15, 12.1)), hyp_trans_id: "DEMO-0-UP", ccode: "0", error: null, created_at: iso(ago(15, 12)) },
    { id: randomUUID(), user_id: id, kind: "retry", plan: "pro", amount_ils: 352.82, details: {}, phone_e164: "+972501234567", status: "expired", expires_at: iso(ago(2, 6.3)), approved_msg_id: null, approved_at: null, hyp_trans_id: null, ccode: null, error: null, created_at: iso(ago(2, 6.1)) },
  );
  db.jobs.push({ id: randomUUID(), user_id: id, kind: "proactive_scan", run_at: iso(ago(7, 4)), payload: {}, status: "failed", attempts: 3, max_attempts: 3, last_error: "Graph 429: too many requests (retry-after 120)", dedupe_key: null });
  db.appErrors.push(
    { id: randomUUID(), at: iso(ago(9, 3)), user_id: id, source: "oauth.google", message: "GoogleOAuthError: invalid_grant (token revoked by the user)", context: {} },
    { id: randomUUID(), at: iso(ago(2, 6)), user_id: id, source: "billing", message: "HYP CCode 33: card declined", context: { kind: "renewal" } },
  );
}

export function seedAdminDemo(db: MemoryDb, now: Date = new Date()): { users: number } {
  const t = now.getTime();
  const day = 86_400_000;
  PEOPLE.forEach((p, i) => {
    const id = randomUUID();
    // more sign-ups lately, a few a week before that (days back, oldest people first in PEOPLE)
    const daysBack = [29, 27, 26, 24, 22, 21, 19, 17, 16, 14, 13, 11, 10, 9, 7, 6, 5, 4, 3, 2, 1, 0][i] ?? 0;
    const created = t - daysBack * day - ((i * 5) % 9) * 3_600_000 - 40 * 60_000;
    const email = `${["dana", "yossi", "michal", "uri", "noa", "ron", "tamar", "itay", "shira", "amit", "liat", "gil", "hila", "boaz", "moran", "alon", "inbal", "david", "rotem", "keren", "nir", "asaf"][i]}@example.co.il`;
    if ([...db.users.values()].some((u) => u.email === email)) return;
    const source = SOURCES[i % SOURCES.length] ?? null;
    db.users.set(id, {
      id,
      email,
      name: i % 6 === 5 ? null : p.name,
      business_name: p.business,
      business_type: p.type,
      timezone: "Asia/Jerusalem",
      morning_time: i % 3 ? "07:30" : "08:00",
      locale: "he-IL",
      profile: {
        onboarding: { step: i % 5 === 4 ? "ask_business" : "done", startedAt: iso(created) },
        pain_points: i % 2 ? ["mail", "calendar"] : ["reminders"],
        marketing_opt_in: i % 3 ? { value: true, at: iso(created), source: "signup_form" } : undefined,
      },
      created_at: iso(created),
      deleted_at: null,
      signup_source: source ? { ...source, landing: i % 4 ? "/" : "/pricing", at: iso(created - 20 * 60_000) } : null,
      last_seen_at: i % 6 === 5 ? null : iso(t - ((i * 7) % 40) * 3_600_000),
    });
    db.audit.push({ user_id: id, action: "signup", target: email, result: "ok", created_at: iso(created) });

    const linked = i % 6 !== 5;
    if (linked) {
      db.waIdentities.push({ id: randomUUID(), user_id: id, phone_e164: `+9725${[0, 2, 3, 4, 8][i % 5]}${String(1000000 + ((i * 7919) % 8999999)).padStart(7, "0")}`, wa_name: p.name.split(" ")[0]!, linked_at: iso(created + 10 * 60_000), status: "active" });
      db.audit.push({ user_id: id, action: "wa.link", result: "ok", created_at: iso(created + 10 * 60_000) });
    }
    const plan: PlanKind = i % 4 === 0 ? "pro" : i % 4 === 1 || i % 4 === 2 ? "basic" : "trial";
    const connected = linked && i % 5 !== 3;
    if (connected) {
      const provider: ConnectionRow["provider"] = i % 2 ? "google" : "microsoft";
      const status: ConnectionRow["status"] = i === 7 ? "expired" : i === 13 ? "error" : "active";
      const scopes = provider === "google" ? ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/drive.file"] : ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All"];
      db.connections.push({ id: randomUUID(), user_id: id, provider, account_email: email, tenant_id: null, scopes, status, consent_type: "user", expires_at: iso(t + 3_600_000), created_at: iso(created + 25 * 60_000), revoked_at: null });
      db.audit.push({ user_id: id, action: provider === "google" ? "google.connect" : "ms.connect", target: email, result: "ok", created_at: iso(created + 25 * 60_000) });
      if (status !== "active") db.audit.push({ user_id: id, action: "connection.expired", target: provider, result: "invalid_grant", created_at: iso(t - 2 * 3_600_000) });
    }
    if (plan !== "trial" && connected) {
      const sub: SubscriptionRow = {
        id: randomUUID(),
        user_id: id,
        plan,
        status: i === 9 ? "past_due" : "active",
        next_charge_at: iso(t + ((i * 3) % 28) * day + day),
        cancelled_at: null,
        started_at: iso(created + day),
        charge_failures: i === 9 ? 2 : 0,
        hyp_tokef: "2812",
      };
      db.subscriptions.set(id, sub);
      const amount = plan === "pro" ? 352.82 : 116.82;
      db.payments.push({ id: randomUUID(), user_id: id, hyp_trans_id: `DEMO-${i}-1`, amount_ils: amount, ccode: "0", acode: "0012345", invoice_url: null, raw: {}, created_at: iso(created + day), approval_id: null });
      if (i === 9) db.payments.push({ id: randomUUID(), user_id: id, hyp_trans_id: `DEMO-${i}-2`, amount_ils: amount, ccode: "33", acode: null, invoice_url: null, raw: {}, created_at: iso(t - 2 * day), approval_id: null });
      db.audit.push({ user_id: id, action: "billing.charge", target: plan, result: "ok", created_at: iso(created + day) });
    }
    // usage of the current period
    const paidPlan = db.subscriptions.has(id) ? plan : "trial";
    const limit = paidPlan === "trial" ? 10 : paidPlan === "basic" ? 750 : 3000;
    const used = paidPlan === "trial" ? (i === 3 ? 10 : (i * 3) % 9) : (i * 37) % (limit / 3);
    if (linked) db.usage.push({ user_id: id, period_start: paidPlan === "trial" ? iso(created).slice(0, 10) : `${iso(t).slice(0, 7)}-01`, counted_messages: used, free_remaining: Math.max(0, limit - used), plan_limit: limit });

    // the conversation: a few exchanges a day since signing up (the first person: a long, varied month — richActivity)
    if (i === 0) richActivity(db, id, created, t);
    else if (linked) {
      const days = Math.max(1, Math.floor((t - created) / day));
      for (let d = Math.max(0, days - 12); d <= days; d++) {
        const perDay = (i + d) % 3;
        for (let k = 0; k < perDay; k++) {
          const ex = CONVERSATION[(i + d + k) % CONVERSATION.length]!;
          const at = Math.min(t - 60_000, created + d * day + (9 + k * 3) * 3_600_000);
          db.messages.push({ id: randomUUID(), user_id: id, wa_message_id: `wamid.demo.${i}.${d}.${k}`, direction: "in", type: i % 4 === 1 && k === 0 ? "audio" : "text", text: i % 4 === 1 && k === 0 ? null : ex.in, media_url: null, transcript: i % 4 === 1 && k === 0 ? ex.in : null, model_used: null, tokens_in: null, tokens_out: null, cost_usd: null, agent_key: null, hidden_from_model: false, tools: [], created_at: iso(at) });
          db.messages.push({ id: randomUUID(), user_id: id, wa_message_id: null, direction: "out", type: ex.tools.includes("draft_email") ? "button" : "text", text: ex.out, media_url: null, transcript: null, model_used: ex.model, tokens_in: 2400, tokens_out: 120, cost_usd: ex.cost, agent_key: null, hidden_from_model: false, tools: ex.tools, created_at: iso(at + 4000) });
        }
      }
    }
    if (i === 2) db.jobs.push({ id: randomUUID(), user_id: id, kind: "morning_summary", run_at: iso(t - 5 * 3_600_000), payload: {}, status: "failed", attempts: 3, max_attempts: 3, last_error: "Graph 503: service unavailable", dedupe_key: null });
    if (i % 3 === 0) db.reminders.push({ id: randomUUID(), user_id: id, text: "להתקשר לעו״ד שמעוני", due_at: iso(t + day), job_id: null, status: "scheduled", recurrence: null, last_fired_at: null, created_at: iso(t - day) });
  });

  // the global AI spend per day (ai_spend)
  for (let d = 0; d < 30; d++) {
    const key = dateKey(localDateOf(new Date(t - d * day)));
    const cost = db.messages.filter((m) => m.cost_usd && dateKey(localDateOf(new Date(m.created_at))) === key).reduce((s, m) => s + (m.cost_usd ?? 0), 0);
    if (cost) db.aiSpend.set(key, { cost_usd: Math.round(cost * 1e6) / 1e6, calls: 1 });
  }

  const ids = [...db.users.values()].filter((u) => u.email.endsWith("@example.co.il")).map((u) => u.id);
  const user = (k: number) => db.users.get(ids[k % ids.length]!)!;
  db.supportTickets.push(
    { id: randomUUID(), created_at: iso(t - 3 * 3_600_000), user_id: user(7).id, name: user(7).name ?? "איתי", email: user(7).email, subject: "החיבור ל-Google נפל", body: "מאתמול עלזה כותבת שאין לה גישה ליומן. ניסיתי לחבר שוב מהאזור האישי וזה לא עבר.", transcript: [{ role: "user", text: "החיבור נפל לי" }, { role: "assistant", text: "אפשר לחבר מחדש מהאזור האישי. אם זה לא עובד, כדאי לפתוח פנייה." }], status: "open" },
    { id: randomUUID(), created_at: iso(t - 26 * 3_600_000), user_id: user(9).id, name: user(9).name ?? "עמית", email: user(9).email, subject: "חיוב שנכשל", body: "קיבלתי הודעה שהחיוב נכשל, אבל הכרטיס תקין. אפשר לבדוק?", transcript: null, status: "in_progress", admin_note: "ביקשתי ממנו לעדכן כרטיס דרך הקישור", status_changed_at: iso(t - 20 * 3_600_000) },
    { id: randomUUID(), created_at: iso(t - 3 * day), user_id: null, name: "פונה מהאתר", email: "lead@example.com", subject: "בקשת מערכת: Priority", body: "מערכת: Priority\nמה עלזה תעשה איתה: לבדוק אילו חשבוניות פתוחות ולהזכיר ללקוחות", transcript: null, status: "open" },
    { id: randomUUID(), created_at: iso(t - 6 * day), user_id: user(0).id, name: user(0).name ?? "דנה", email: user(0).email, subject: null, body: "איך משנים את שעת סיכום הבוקר?", transcript: null, status: "closed", status_changed_at: iso(t - 5 * day) },
  );
  const chat = (userId: string | null, page: string, hoursAgo: number, turns: [string, string][]) =>
    db.supportChats.push({
      id: randomUUID(),
      user_id: userId,
      page,
      turns: turns.flatMap(([q, a]) => [
        { role: "user" as const, text: q, at: iso(t - hoursAgo * 3_600_000) },
        { role: "assistant" as const, text: a, at: iso(t - hoursAgo * 3_600_000 + 3000) },
      ]),
      created_at: iso(t - hoursAgo * 3_600_000),
      updated_at: iso(t - hoursAgo * 3_600_000 + 60_000),
    });
  chat(null, "/", 1, [["כמה זה עולה?", "שני מסלולים: בסיסי ב-99 ₪ לחודש ופרו ב-299 ₪ לחודש, לפני מע״מ."], ["יש תקופת ניסיון?", "כן, 10 הודעות ראשונות בלי תשלום ובלי כרטיס אשראי."]]);
  chat(user(7).id, "/account", 4, [["החיבור נפל לי", "אפשר לחבר מחדש מהאזור האישי. אם זה לא עובד, כדאי לפתוח פנייה."]]);
  chat(null, "/pricing", 9, [["האם המידע שלי מאובטח?", "הטוקנים מוצפנים, והמידע נשמר באיחוד האירופי. כל פעולה יוצאת מחכה לאישור בלחיצה."]]);
  chat(user(4).id, "/account", 30, [["איך מבטלים מנוי?", "אפשר לבטל מהאזור האישי, בלשונית מנוי, או לכתוב לעלזה בוואטסאפ ״לבטל מנוי״."]]);
  chat(null, "/", 50, [["עלזה עובדת עם Outlook?", "כן, עם Microsoft 365: מייל, יומן וקבצים, וגם עם Google."]]);

  const err = (userId: string | null, source: string, message: string, hoursAgo: number, context: Record<string, unknown> = {}) =>
    db.appErrors.push({ id: randomUUID(), at: iso(t - hoursAgo * 3_600_000), user_id: userId, source, message, context });
  err(user(7).id, "oauth.google", "GoogleOAuthError: invalid_grant", 2, { code: "invalid_grant" });
  err(user(7).id, "bot", "token refresh failed: invalid_grant", 2.5, { retryable: false });
  err(user(7).id, "bot", "token refresh failed: invalid_grant", 5, { retryable: false });
  err(user(2).id, "jobs", "Graph 503: service unavailable", 5, { kind: "morning_summary" });
  err(user(9).id, "billing", "HYP CCode 33: card declined", 48, { kind: "renewal", stage: "no_answer" });
  err(null, "request.render", "TypeError: Cannot read properties of undefined (reading 'scopes')", 30, { path: "/account", method: "GET" });
  err(null, "wa.worker", "fetch failed: ECONNRESET", 70, { kind: "inbound" });
  seedTraffic(db, now);
  return { users: ids.length };
}

// ---------------------------------------------------------------------------------------------
// the "תנועה" tab: 90 days of page views and signup steps (page_events, migration 0017)
// ---------------------------------------------------------------------------------------------

/** Where the made-up visitors come from, with their weight (utm_source campaigns, referring sites, direct). */
const TRAFFIC_SOURCES: { w: number; ref?: string; utm?: [string, string, string] }[] = [
  { w: 34 },
  { w: 21, ref: "www.google.com" },
  { w: 13, utm: ["facebook", "paid_social", "lawyers-oct"] },
  { w: 7, utm: ["google", "cpc", "accountants"] },
  { w: 6, ref: "www.linkedin.com" },
  { w: 5, utm: ["instagram", "story", "launch"] },
  { w: 4, utm: ["newsletter", "email", "launch"] },
  { w: 3, ref: "www.bing.com" },
  { w: 3, ref: "chat.whatsapp.com" },
  { w: 2, ref: "unknown" },
  { w: 2, ref: "www.facebook.com" },
];

/** The first page of a visit, with its weight. */
const LANDINGS: { w: number; path: string }[] = [
  { w: 58, path: "/" },
  { w: 14, path: "/pricing" },
  { w: 7, path: "/for/lawyers" },
  { w: 6, path: "/for/accountants" },
  { w: 4, path: "/for/consultants" },
  { w: 4, path: "/for/clinics" },
  { w: 4, path: "/start" },
  { w: 2, path: "/privacy" },
  { w: 1, path: "/terms" },
];

/** A small deterministic generator, so the screenshots look the same on every seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T extends { w: number }>(list: readonly T[], r: number): T {
  const total = list.reduce((s, x) => s + x.w, 0);
  let x = r * total;
  for (const item of list) if ((x -= item.w) < 0) return item;
  return list.at(-1)!;
}

const demoVisitor = (n: string) => createHash("sha256").update(`alze-demo-visitor:${n}`).digest("hex");

function seedTraffic(db: MemoryDb, now: Date): void {
  if (db.pageEvents.some((e) => e.visitor === demoVisitor("89:0"))) return; // seeded already (the oldest day is always in the past)
  const rand = rng(20261024);
  const hour = 3_600_000;
  const rows: MemoryDb["pageEvents"] = [];
  const push = (at: number, visitor: string, fields: Partial<MemoryDb["pageEvents"][number]>) => {
    if (at > now.getTime()) return;
    rows.push({ id: randomUUID(), at: iso(at), day: dateKey(localDateOf(new Date(at))), visitor, user_id: null, path: null, referrer_host: null, utm_source: null, utm_medium: null, utm_campaign: null, device: null, event: null, ...fields });
  };
  for (let back = 89; back >= 0; back--) {
    const dayStart = Date.parse(`${dateKey(localDateOf(new Date(now.getTime() - back * 86_400_000)))}T00:00:00+03:00`);
    const weekday = new Date(dayStart + 12 * hour).getUTCDay(); // 5 = Friday, 6 = Saturday: a quiet weekend
    const growth = 1 + (89 - back) / 70; // the site grows over the quarter
    const visitors = Math.round((weekday === 6 ? 14 : weekday === 5 ? 22 : 38) * growth + rand() * 12);
    for (let n = 0; n < visitors; n++) {
      const visitor = demoVisitor(`${back}:${n}`);
      const source = pick(TRAFFIC_SOURCES, rand());
      const mobile = rand() < 0.61;
      const device = mobile ? ("mobile" as const) : ("desktop" as const);
      let at = dayStart + (7 + rand() * 15) * hour;
      const landing = pick(LANDINGS, rand()).path;
      push(at, visitor, { path: landing, device, referrer_host: source.ref ?? null, utm_source: source.utm?.[0] ?? null, utm_medium: source.utm?.[1] ?? null, utm_campaign: source.utm?.[2] ?? null });
      // a few more pages
      const more = rand() < 0.45 ? 1 + Math.floor(rand() * 3) : 0;
      for (let k = 0; k < more; k++) {
        at += (20 + rand() * 160) * 1000;
        push(at, visitor, { path: ["/pricing", "/", "/for/lawyers", "/privacy", "/start"][Math.floor(rand() * 5)]!, device });
      }
      // the signup: a campaign visitor starts more often; every step loses some
      if (rand() > (source.utm ? 0.24 : 0.13)) continue;
      at += 40_000;
      push(at, visitor, { path: "/start/email", device });
      push(at + 500, visitor, { path: "/start/email", device, event: "signup_start" });
      if (rand() > 0.72) continue;
      push((at += 35_000), visitor, { path: "/start/email", device, event: "code_sent" });
      push(at + 800, visitor, { path: "/start/code", device });
      if (rand() > 0.84) continue;
      push((at += 50_000), visitor, { path: "/start/code", device, event: "code_ok" });
      push(at + 900, visitor, { path: "/start/connect", device });
      // the server-side steps: the user's own daily id (lib/analytics/track.ts)
      const user = demoVisitor(`user:${back}:${n}`);
      const linked = rand() < 0.71;
      const mail = rand() < (linked ? 0.6 : 0.08);
      if (mail) push((at += 90_000), user, { event: "mail_connected" });
      push(at + 1000, visitor, { path: "/start/ready", device });
      if (!linked) continue;
      push((at += 120_000), user, { event: "wa_linked" });
      if (rand() < (mail ? 0.36 : 0.1)) push(at + (3 + rand() * 6) * hour, user, { event: "paid" });
    }
  }
  db.pageEvents.push(...rows.sort((a, b) => a.at.localeCompare(b.at)));
}
