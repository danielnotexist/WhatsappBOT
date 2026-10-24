/**
 * The owner's alerts (lib/admin/alerts.ts): what each event is, its Hebrew subject and body, the deep link into /admin,
 * and the morning digest. Pure (no env, no I/O): the caller passes APP_URL. Neutral, short, professional phrasing — this
 * is mail to the owner, not to a customer. The product name comes from lib/brand.ts only.
 */
import { sourceLabel } from "@/lib/admin/source";
import { PRODUCT_NAME } from "@/lib/brand";
import type { OwnerAlertType, SignupSource } from "@/lib/db/types";

// ---------------------------------------------------------------------------------------------
// the events
// ---------------------------------------------------------------------------------------------

export type OwnerEvent =
  | { type: "signup"; userId: string; email: string; name?: string | null; business?: string | null; source?: SignupSource | null }
  | { type: "ticket" | "system_request"; ticketId: string; subject: string | null; fromName: string; fromEmail: string; userId?: string | null; excerpt?: string | null }
  | { type: "payment_failed" | "charge_unknown"; userId: string; email?: string | null; name?: string | null; amountIls: number; reason: string; ref: string }
  | { type: "error_spike"; count: number; threshold: number; top: { source: string; count: number }[]; slot: string }
  | { type: "ai_budget"; threshold: 80 | 100; spentUsd: number; budgetUsd: number; day: string }
  | { type: "connection_expired_paid"; userId: string; email?: string | null; name?: string | null; provider: "google" | "microsoft"; plan: string; connectionId: string; day?: string }
  | { type: "test"; by: string; at: string };

/** The types the owner switches on and off (the test mail is not one of them). */
export type SwitchableAlertType = Exclude<OwnerAlertType, "test">;

/** When a type goes out during quiet hours: always (urgent), never (kept for the morning digest), or only at 100%. */
export type AlertUrgency = "urgent" | "digest" | "urgent_at_100";

export interface AlertKind {
  type: SwitchableAlertType;
  label: string;
  description: string;
  urgency: AlertUrgency;
}

/** The order and the words of the alerts tab. */
export const OWNER_ALERT_KINDS: readonly AlertKind[] = [
  { type: "signup", label: "נרשם חדש", description: "כל הרשמה חדשה לאתר, עם מקור ההרשמה (utm, האתר המפנה).", urgency: "digest" },
  { type: "ticket", label: "פנייה חדשה", description: "פנייה מצ'אט התמיכה באתר. אם כתובת התמיכה היא גם כתובת הבעלים, נשלח מייל אחד בלבד.", urgency: "digest" },
  { type: "system_request", label: "בקשת מערכת", description: "לקוח ביקש לחבר מערכת שעוד אין לה חיבור.", urgency: "digest" },
  { type: "payment_failed", label: "תשלום שנכשל", description: "חיוב חודשי, חיוב בלחיצה או תשלום ראשון שלא עבר.", urgency: "urgent" },
  { type: "charge_unknown", label: "חיוב בבדיקה", description: "לא התקבלה תשובה ברורה מ-HYP. כל חיוב נוסף של הלקוח חסום עד בדיקה בפורטל.", urgency: "urgent" },
  { type: "error_spike", label: "קפיצה בתקלות", description: "יותר תקלות בשעה מהסף שנקבע כאן. לכל היותר מייל אחד בשעה.", urgency: "urgent" },
  { type: "ai_budget", label: "תקציב AI", description: "ההוצאה היומית על AI הגיעה ל-80% או ל-100% מהתקציב (AI_DAILY_BUDGET_USD). פעם אחת ביום לכל סף.", urgency: "urgent_at_100" },
  { type: "connection_expired_paid", label: "חיבור שפג אצל לקוח משלם", description: "חיבור Google או Microsoft 365 של לקוח בתשלום פג תוקף.", urgency: "digest" },
];

export const ALERT_TYPE_LABEL: Record<OwnerAlertType, string> = {
  ...(Object.fromEntries(OWNER_ALERT_KINDS.map((k) => [k.type, k.label])) as Record<SwitchableAlertType, string>),
  test: "מייל בדיקה",
};

/** Why a charge did not go through, in the owner's words (lib/hyp/codes.ts classifyHypFailure). */
export const HYP_FAILURE_HE: Record<"card" | "declined" | "temporary" | "config", string> = {
  card: "הכרטיס לא אושר לחיוב (חסום, פג תוקף או לא תקף)",
  declined: "סירוב של חברת האשראי",
  temporary: "תקלה זמנית בחברת האשראי",
  config: "שגיאת הגדרות במסוף שלנו, לא של הלקוח",
};

/** "חיוב חודשי: סירוב של חברת האשראי (קוד 6). ניסיון נוסף ב-…" */
export function chargeReason(stage: string, failure: keyof typeof HYP_FAILURE_HE | null, ccode: string | null, next?: string | null): string {
  const what = failure ? HYP_FAILURE_HE[failure] : "לא עבר";
  return `${stage}: ${what}${ccode ? ` (קוד ${ccode})` : ""}.${next ? ` ${next}` : ""}`;
}

const shortDate = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** What happens next after a declined monthly charge (lib/billing/subscription.ts ChargeOutcome). */
export function renewalNext(outcome: { kind: string; retryAt?: Date; pauseAt?: Date }): string | null {
  if (outcome.kind === "retry" && outcome.retryAt) return `ניסיון נוסף אוטומטי: ${shortDate.format(outcome.retryAt)}.`;
  if (outcome.kind === "card_invalid" && outcome.pauseAt) return `אין ניסיונות אוטומטיים. אם הכרטיס לא יעודכן, החשבון יושהה ב-${shortDate.format(outcome.pauseAt)}.`;
  if (outcome.kind === "paused") return "החשבון הושהה.";
  if (outcome.kind === "config_error" && outcome.retryAt) return `ניסיון נוסף: ${shortDate.format(outcome.retryAt)}. כדאי לבדוק את הגדרות המסוף (docs/hyp-setup.md).`;
  return null;
}

/** Urgent events go out at once, also in quiet hours and on Shabbat. */
export function isUrgent(event: OwnerEvent): boolean {
  if (event.type === "test") return true;
  if (event.type === "ai_budget") return event.threshold >= 100;
  return OWNER_ALERT_KINDS.find((k) => k.type === event.type)?.urgency === "urgent";
}

// ---------------------------------------------------------------------------------------------
// the words
// ---------------------------------------------------------------------------------------------

export interface OwnerAlertContent {
  subject: string;
  /** the first line of the body */
  lead: string;
  /** label → value rows ("מייל", "dana@…") */
  rows: [string, string][];
  /** a closing sentence, when there is something to know */
  note?: string;
  /** the deep link into the panel */
  link: { href: string; label: string };
}

const one = (s: string | null | undefined, max = 120): string => {
  const t = (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const he = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const ils = (n: number) => `${he.format(n)} ₪`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const PROVIDER = { google: "Google", microsoft: "Microsoft 365" } as const;
const base = (appUrl: string) => appUrl.replace(/\/+$/, "");
const who = (e: { name?: string | null; email?: string | null; userId: string }) => one(e.name) || one(e.email) || e.userId;

/** "google / cpc / spring" — the source in full for the body (the subject has the short label). */
function sourceLine(s: SignupSource | null | undefined): string {
  if (!s) return "לא ידוע";
  const utm = [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" / ");
  const parts = [utm || null, s.ref && s.ref !== s.utm_source ? `מפנה: ${s.ref}` : null, s.landing ? `דף ראשון: ${s.landing === "/" ? "דף הבית" : s.landing}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "ישיר";
}

/** The subject, the body rows and the deep link of one event. */
export function ownerAlertContent(event: OwnerEvent, appUrl: string): OwnerAlertContent {
  const url = base(appUrl);
  switch (event.type) {
    case "signup":
      return {
        subject: `נרשם חדש: ${one(event.email)} (מקור: ${sourceLabel(event.source)})`,
        lead: `נרשם משתמש חדש ל${PRODUCT_NAME}.`,
        rows: [
          ["מייל", one(event.email)],
          ["שם", one(event.name) || "עוד לא מולא"],
          ["עסק", one(event.business) || "עוד לא מולא"],
          ["מקור", sourceLine(event.source)],
        ],
        link: { href: `${url}/admin/users/${event.userId}`, label: "לדף המשתמש" },
      };
    case "ticket":
    case "system_request": {
      const request = event.type === "system_request";
      const subject = one(event.subject) || "בלי נושא";
      return {
        subject: request ? subject : `פנייה חדשה: ${subject}`,
        lead: request ? "בקשת מערכת חדשה מהאתר: מערכת שלקוח רוצה לחבר." : "פנייה חדשה מצ'אט התמיכה באתר.",
        rows: [
          ["מאת", `${one(event.fromName)}, ${one(event.fromEmail)}`],
          ["נושא", subject],
          ...(event.excerpt ? ([["תקציר", one(event.excerpt, 300)]] as [string, string][]) : []),
          ["משתמש רשום", event.userId ? "כן" : "לא, או לא מחובר"],
        ],
        note: "תשובה למייל הזה תגיע ישירות לפונה.",
        link: { href: `${url}/admin?tab=tickets#t-${event.ticketId}`, label: "לפנייה בפאנל" },
      };
    }
    case "payment_failed":
      return {
        subject: `תשלום נכשל: ${ils(event.amountIls)}, ${who(event)}`,
        lead: "חיוב של לקוח לא עבר.",
        rows: [
          ["לקוח", who(event)],
          ...(event.email && one(event.email) !== who(event) ? ([["מייל", one(event.email)]] as [string, string][]) : []),
          ["סכום", ils(event.amountIls)],
          ["סיבה", one(event.reason, 200)],
          ["מזהה לבדיקה", one(event.ref)],
        ],
        link: { href: `${url}/admin/users/${event.userId}`, label: "לדף הלקוח" },
      };
    case "charge_unknown":
      return {
        subject: `חיוב בבדיקה: ${ils(event.amountIls)}, ${who(event)}`,
        lead: "לא התקבלה תשובה ברורה מ-HYP על חיוב. ייתכן שהלקוח חויב, וייתכן שלא.",
        rows: [
          ["לקוח", who(event)],
          ...(event.email && one(event.email) !== who(event) ? ([["מייל", one(event.email)]] as [string, string][]) : []),
          ["סכום", ils(event.amountIls)],
          ["מה קרה", one(event.reason, 200)],
          ["מזהה לבדיקה (Order)", one(event.ref)],
        ],
        note: "כל חיוב נוסף של הלקוח חסום עד שבודקים את החיוב בפורטל של HYP לפי המזהה (docs/hyp-setup.md).",
        link: { href: `${url}/admin/users/${event.userId}`, label: "לדף הלקוח" },
      };
    case "error_spike":
      return {
        subject: `קפיצה בתקלות: ${he.format(event.count)} בשעה האחרונה`,
        lead: `נרשמו ${he.format(event.count)} תקלות בשעה האחרונה (הסף: ${he.format(event.threshold)}).`,
        rows: event.top.length ? event.top.slice(0, 5).map((t) => [one(t.source, 60), he.format(t.count)]) : [["מקורות", "לא ידוע"]],
        note: "המייל הבא על קפיצה בתקלות יישלח לכל המוקדם בעוד שעה.",
        link: { href: `${url}/admin?tab=errors`, label: "ליומן התקלות" },
      };
    case "ai_budget": {
      const full = event.threshold >= 100;
      return {
        subject: full ? "תקציב AI: התקציב היומי נגמר" : "תקציב AI: 80% מהתקציב היומי",
        lead: full ? "התקציב היומי של AI נוצל במלואו." : "נוצלו 80% מהתקציב היומי של AI.",
        rows: [
          ["יום", event.day],
          ["הוצאה", usd(event.spentUsd)],
          ["תקציב יומי", usd(event.budgetUsd)],
        ],
        note: full ? "קריאות AI חדשות נחסמות עד חצות (שעון ישראל). אפשר להעלות את AI_DAILY_BUDGET_USD." : "אם הקצב נמשך, התקציב ייגמר עוד היום. אפשר להעלות את AI_DAILY_BUDGET_USD.",
        link: { href: `${url}/admin`, label: "לסקירה בפאנל" },
      };
    }
    case "connection_expired_paid":
      return {
        subject: `חיבור פג אצל לקוח משלם: ${PROVIDER[event.provider]}, ${who(event)}`,
        lead: `החיבור ל-${PROVIDER[event.provider]} של לקוח בתשלום פג תוקף.`,
        rows: [
          ["לקוח", who(event)],
          ...(event.email && one(event.email) !== who(event) ? ([["מייל", one(event.email)]] as [string, string][]) : []),
          ["ספק", PROVIDER[event.provider]],
          ["מסלול", one(event.plan)],
        ],
        note: "בשיחה הבאה בוואטסאפ הלקוח יקבל קישור לחיבור מחדש.",
        link: { href: `${url}/admin/users/${event.userId}`, label: "לדף הלקוח" },
      };
    case "test":
      return {
        subject: "מייל בדיקה מפאנל הניהול",
        lead: `זה מייל בדיקה של ההתראות ב${PRODUCT_NAME}. אם הוא הגיע, ההתראות במייל עובדות.`,
        rows: [["נשלח על ידי", one(event.by)]],
        link: { href: `${url}/admin?tab=alerts`, label: "להגדרות ההתראות" },
      };
  }
}

// ---------------------------------------------------------------------------------------------
// the mail: text + HTML (RTL, "לילה ירוק")
// ---------------------------------------------------------------------------------------------

export interface OwnerMail {
  subject: string;
  text: string;
  html: string;
}

const C = { night: "#0F1C17", night2: "#16261F", line: "#26382F", cream: "#EFE9DC", muted: "#A3AE9F", honey: "#E7B65C" } as const;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Latin runs (emails, ids, URLs) keep their order inside the Hebrew line. */
const bidi = (s: string) => (/[A-Za-z0-9@]/.test(s) && !/[֐-׿]/.test(s) ? `<span dir="ltr">${escapeHtml(s)}</span>` : escapeHtml(s));

function frame(title: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="background:${C.night};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:start;color:${C.cream};">
<div style="max-width:560px;margin:0 auto;">
<p style="margin:0 0 14px;font-size:13px;color:${C.honey};letter-spacing:.02em;">${escapeHtml(PRODUCT_NAME)} · התראה לבעלים</p>
<div style="background:${C.night2};border:1px solid ${C.line};border-radius:16px;padding:22px 20px;">
${inner}
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.6;color:${C.muted};">${footer}</p>
</div></div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.honey};color:${C.night};text-decoration:none;font-weight:700;font-size:15px;padding:11px 22px;border-radius:999px;">${escapeHtml(label)}</a></p>`;
}

const FOOTER = "ההגדרות (מתג לכל סוג, שעות שקט ושבת) בטאב \"התראות\" בפאנל הניהול.";

/** One alert as a mail. */
export function ownerAlertMail(event: OwnerEvent, appUrl: string): OwnerMail {
  const c = ownerAlertContent(event, appUrl);
  const text = [c.lead, "", ...c.rows.map(([k, v]) => `${k}: ${v}`), ...(c.note ? ["", c.note] : []), "", `${c.link.label}: ${c.link.href}`, "", FOOTER].join("\n");
  const rows = c.rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;vertical-align:top;color:${C.muted};font-size:14px;white-space:nowrap;">${escapeHtml(k)}</td><td style="width:16px;"></td><td style="padding:6px 0;vertical-align:top;font-size:15px;color:${C.cream};">${bidi(v)}</td></tr>`)
    .join("");
  const inner = [
    `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.35;color:${C.cream};">${escapeHtml(c.subject)}</h1>`,
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.cream};">${escapeHtml(c.lead)}</p>`,
    `<table role="presentation" dir="rtl" style="border-collapse:collapse;width:100%;">${rows}</table>`,
    c.note ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:${C.muted};">${escapeHtml(c.note)}</p>` : "",
    button(c.link.href, c.link.label),
  ].join("\n");
  return { subject: c.subject, text, html: frame(c.subject, inner, escapeHtml(FOOTER)) };
}

/** One digest line, from what was stored for the queued alert. */
export interface DigestItem {
  at: string;
  type: OwnerAlertType;
  subject: string;
  href: string;
}

const timeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric" });

/** "התראה אחת" / "3 התראות". */
export const alertsCount = (n: number) => (n === 1 ? "התראה אחת" : `${he.format(n)} התראות`);

/** The morning mail: everything that waited through the quiet hours, oldest first. */
export function ownerDigestMail(items: DigestItem[], appUrl: string): OwnerMail {
  const url = `${base(appUrl)}/admin?tab=alerts`;
  const subject = `סיכום שעות השקט: ${alertsCount(items.length)}`;
  const lead = `אלה ההתראות שנאספו בשעות השקט, מהישנה לחדשה.`;
  const when = (iso: string) => `${dayFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}`;
  const text = [lead, "", ...items.map((i) => `• ${when(i.at)} · ${ALERT_TYPE_LABEL[i.type]} · ${i.subject}\n  ${i.href}`), "", `להתראות בפאנל: ${url}`, "", FOOTER].join("\n");
  const list = items
    .map(
      (i) =>
        `<li style="padding:12px 0;border-top:1px solid ${C.line};"><span style="display:block;font-size:13px;color:${C.muted};">${escapeHtml(when(i.at))} · ${escapeHtml(ALERT_TYPE_LABEL[i.type])}</span><a href="${escapeHtml(i.href)}" style="display:block;margin-top:3px;font-size:15px;color:${C.cream};text-decoration:underline;text-decoration-color:${C.honey};">${escapeHtml(i.subject)}</a></li>`,
    )
    .join("");
  const inner = [
    `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.35;color:${C.cream};">${escapeHtml(subject)}</h1>`,
    `<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:${C.cream};">${escapeHtml(lead)}</p>`,
    `<ul style="list-style:none;margin:0;padding:0;">${list}</ul>`,
    button(url, "להתראות בפאנל"),
  ].join("\n");
  return { subject, text, html: frame(subject, inner, escapeHtml(FOOTER)) };
}

/** The WhatsApp line (template owner_alert {{1}}) of the morning digest. */
export const digestWhatsappLine = (n: number) => `סיכום שעות השקט: ${alertsCount(n)}. הפרטים במייל.`;
