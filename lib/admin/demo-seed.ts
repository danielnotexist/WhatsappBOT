import { randomUUID } from "node:crypto";
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
  { in: "מה יש לי מחר ביומן?", out: "מחר שלוש פגישות: 09:30 עם משפחת לוי (Teams), 12:00 ארוחת צהריים עם רו״ח כהן, ו-16:00 שיחה עם הבנק.", tools: ["calendar_list_events"], model: "claude-sonnet-5-5", cost: 0.0142 },
  { in: "תזכירי לי מחר בשמונה להתקשר לעו״ד שמעוני", out: "קבעתי תזכורת למחר ב-08:00: להתקשר לעו״ד שמעוני.", tools: ["create_reminder"], model: "claude-haiku-5-5", cost: 0.0021 },
  { in: "יש מיילים חשובים מהבוקר?", out: "שניים שכדאי לראות: הצעת מחיר מספק ההדפסה (ממתינה לתשובה עד חמישי), ותזכורת מהבנק על חתימה על מסמכים.", tools: ["mail_search", "mail_read"], model: "claude-sonnet-5-5", cost: 0.0213 },
  { in: "תכיני תשובה לספק שאנחנו מאשרים", out: "הכנתי טיוטה לספק ההדפסה. אפשר לשלוח, לערוך או לבטל.", tools: ["mail_draft_reply"], model: "claude-sonnet-5-5", cost: 0.0187 },
  { in: "תודה!", out: "בשמחה.", tools: [], model: "claude-haiku-5-5", cost: 0.0006 },
];

const iso = (ms: number) => new Date(ms).toISOString();

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

    // the conversation: a few exchanges a day since signing up
    if (linked) {
      const days = Math.max(1, Math.floor((t - created) / day));
      for (let d = Math.max(0, days - 12); d <= days; d++) {
        const perDay = (i + d) % 3;
        for (let k = 0; k < perDay; k++) {
          const ex = CONVERSATION[(i + d + k) % CONVERSATION.length]!;
          const at = Math.min(t - 60_000, created + d * day + (9 + k * 3) * 3_600_000);
          db.messages.push({ id: randomUUID(), user_id: id, wa_message_id: `wamid.demo.${i}.${d}.${k}`, direction: "in", type: i % 4 === 1 && k === 0 ? "audio" : "text", text: i % 4 === 1 && k === 0 ? null : ex.in, media_url: null, transcript: i % 4 === 1 && k === 0 ? ex.in : null, model_used: null, tokens_in: null, tokens_out: null, cost_usd: null, agent_key: null, hidden_from_model: false, tools: [], created_at: iso(at) });
          db.messages.push({ id: randomUUID(), user_id: id, wa_message_id: null, direction: "out", type: ex.tools.includes("mail_draft_reply") ? "button" : "text", text: ex.out, media_url: null, transcript: null, model_used: ex.model, tokens_in: 2400, tokens_out: 120, cost_usd: ex.cost, agent_key: null, hidden_from_model: false, tools: ex.tools, created_at: iso(at + 4000) });
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
  return { users: ids.length };
}
