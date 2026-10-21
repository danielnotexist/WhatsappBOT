/**
 * WhatsApp UTILITY templates (docs/copy/wa-templates.md): the payloads we send outside the 24-hour window,
 * and the definitions to register with Meta (`POST /{WABA_ID}/message_templates`).
 *
 * Meta rejects a body parameter containing a new line, a tab or more than 4 consecutive spaces
 * (error 132018), so multi-line sections are flattened with `templateParam()`.
 */
import { PRODUCT_NAME } from "@/lib/brand";
import { WA_GRAPH_BASE, type TemplateButtonParam } from "./types";

export const TEMPLATE_LANGUAGE = "he";
const PARAM_MAX = 400;

/** One template body parameter: single line, ≤ 4 spaces in a row, never empty (Meta) — "—" for an empty section. */
export function templateParam(value: string, max = PARAM_MAX): string {
  const flat = value
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, " ").trim())
    .filter(Boolean)
    .join("  ")
    .replace(/ {5,}/g, "    ");
  if (!flat) return "—";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface TemplateSend {
  name: string;
  params: string[];
  buttons: TemplateButtonParam[];
}

/** `reminder`: {{1}} the reminder, {{2}} when it was asked for; quick replies carry the reminder id. */
export function reminderTemplate(reminderId: string, text: string, requestedAt: string): TemplateSend {
  return {
    name: "reminder",
    params: [templateParam(text, 300), templateParam(requestedAt, 60)],
    buttons: [
      { index: 0, subType: "quick_reply", text: `rem:done:${reminderId}` },
      { index: 1, subType: "quick_reply", text: `rem:hour:${reminderId}` },
      { index: 2, subType: "quick_reply", text: `rem:tmrw:${reminderId}` },
    ],
  };
}

/** `morning_summary`: {{1}} day, {{2}} meetings, {{3}} emails, {{4}} reminders (body ≤ 1,024 chars in total). */
export function morningSummaryTemplate(p: { dayLabel: string; meetings: string[]; emails: string[]; reminders: string[] }): TemplateSend {
  return {
    name: "morning_summary",
    params: [templateParam(p.dayLabel, 40), templateParam(p.meetings.join("\n"), 300), templateParam(p.emails.join("\n"), 300), templateParam(p.reminders.join("\n"), 200)],
    buttons: [],
  };
}

// ---------------------------------------------------------------------------------------------
// definitions (registration) — the JSON of docs/copy/wa-templates.md; a test keeps them in sync
// ---------------------------------------------------------------------------------------------

export interface TemplateDefinition {
  name: string;
  language: string;
  category: "UTILITY";
  components: Record<string, unknown>[];
}

const body = (text: string, example: string[]) => ({ type: "BODY", text, example: { body_text: [example] } });
const quick = (...titles: string[]) => ({ type: "BUTTONS", buttons: titles.map((text) => ({ type: "QUICK_REPLY", text })) });
const urlButton = (text: string, url: string, example: string) => ({ type: "BUTTONS", buttons: [{ type: "URL", text, url, example: [example] }] });

/** All 7 templates; `appUrl` replaces APP_DOMAIN and the product name (lib/brand.ts) is fixed text, not a variable. */
export function templateDefinitions(appUrl: string, productName: string = PRODUCT_NAME): TemplateDefinition[] {
  const base = appUrl.replace(/\/+$/, "");
  const def = (name: string, ...components: Record<string, unknown>[]): TemplateDefinition => ({ name, language: TEMPLATE_LANGUAGE, category: "UTILITY", components });
  return [
    def(
      "morning_summary",
      body("בוקר טוב. {{1}}\n\nפגישות היום:\n{{2}}\n\nמיילים שמחכים לתשובה:\n{{3}}\n\nתזכורות:\n{{4}}\n\nכדי להמשיך — אפשר פשוט לענות כאן.", ["יום ג׳ 22.10", "• 10:00 פגישה עם כהן (משרד)  • 14:30 שיחה עם רו״ח ברק", "• רונית לוי — הצעת מחיר לפרויקט  • עו״ד שפירא — הסכם פשרה", "• 16:00 להתקשר לבנק"]),
      quick("לנסח תשובה", "מה יש מחר?"),
    ),
    def("reminder", body("תזכורת: {{1}}\n(ביקשת ב-{{2}})", ["להתקשר לבנק לגבי ההלוואה", "יום ב׳ 20.10, 18:40"]), quick("בוצע", "עוד שעה", "מחר בבוקר")),
    def(
      "trial_ended_payment",
      body(`שלום {{1}}, 10 ההודעות של תקופת הניסיון נוצלו — תודה שניסית את ${productName}.\nכדי להמשיך מאותו מקום: מסלול בסיסי 99 ₪ לחודש (עד 750 הודעות) או פרו 299 ₪ (עד 3,000, סוכנים ואוטומציות). המחירים כוללים מע״מ, ביטול בכל רגע.\nההודעה האחרונה שלך שמורה ותטופל מיד אחרי התשלום.`, ["דנה"]),
      urlButton("לתשלום", `${base}/pay/{{1}}`, `${base}/pay/u_7f3a9c`),
    ),
    def("payment_success", body("התשלום התקבל והחשבון פעיל. מסלול {{1}}, {{2}} ₪ לחודש. החיוב הבא: {{3}}.\nחשבונית מס-קבלה נשלחה למייל. ממשיכים מאותו מקום — אפשר לכתוב כאן.", ["בסיסי", "99", "20.11.2026"])),
    def("payment_failed", body("החיוב החודשי ({{1}} ₪) לא עבר. ננסה שוב ב-{{2}}.\nכדי לא להפסיק את השירות, אפשר לעדכן את אמצעי התשלום כבר עכשיו.", ["99", "יום ה׳ 23.10"]), urlButton("לעדכון אמצעי תשלום", `${base}/pay/{{1}}`, `${base}/pay/u_7f3a9c`)),
    def(
      "reconnect_needed",
      body("החיבור ל-{{1}} פג תוקף (זה קורה בדרך כלל אחרי החלפת סיסמה), ולכן סיכומי הבוקר והמייל מושהים.\nחידוש לוקח חצי דקה. הקישור עובד פעם אחת, ל-30 הדקות הקרובות.", ["Microsoft 365"]),
      urlButton("לחבר מחדש", `${base}/connect/{{1}}`, `${base}/connect/c_91ab22`),
    ),
    def(
      "plan_limit_reached",
      body("הגעת ל-750 ההודעות של המסלול הבסיסי החודש. המכסה מתחדשת ב-{{1}}.\nתזכורות וסיכום הבוקר ממשיכים כרגיל. כדי להמשיך כבר עכשיו — מסלול פרו (299 ₪, עד 3,000 הודעות).", ["1.11.2026"]),
      urlButton("לשדרג לפרו", `${base}/upgrade/{{1}}`, `${base}/upgrade/u_7f3a9c`),
    ),
  ];
}

export interface RegisterOptions {
  wabaId: string;
  accessToken: string;
  appUrl: string;
  /** default true: return the requests without calling Meta */
  dryRun?: boolean;
  names?: string[];
  fetchImpl?: typeof fetch;
}

/**
 * Registers the templates with Meta (status PENDING → APPROVED/REJECTED arrives by webhook). Dry run by default —
 * registering is a one-time manual step for Daniel (docs/copy/wa-templates.md "מה דניאל צריך לעשות ידנית").
 */
export async function registerTemplates(opts: RegisterOptions): Promise<{ name: string; status: string; id?: string; request: TemplateDefinition }[]> {
  const defs = templateDefinitions(opts.appUrl).filter((d) => !opts.names || opts.names.includes(d.name));
  const out: { name: string; status: string; id?: string; request: TemplateDefinition }[] = [];
  for (const d of defs) {
    if (opts.dryRun !== false) {
      out.push({ name: d.name, status: "dry-run", request: d });
      continue;
    }
    const res = await (opts.fetchImpl ?? fetch)(`${WA_GRAPH_BASE}/${opts.wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string } };
    out.push({ name: d.name, status: res.ok ? (json.status ?? "PENDING") : `error: ${json.error?.message ?? res.status}`, id: json.id, request: d });
  }
  return out;
}
