/**
 * Agent strings (docs/design/agents.md §11), keyed by the ids in docs/copy/bot-copy-agents.md (the source of truth; a
 * test checks every id is documented). Neutral phrasing, no "שלח/י" forms; the assistant speaks about herself in the feminine;
 * an agent is always "הסוכן ״<שם>״" so the grammar holds whatever the name. The product name comes from lib/brand.ts.
 */
import { PRODUCT_NAME as P } from "@/lib/brand";
import type { ListRow, ReplyButton } from "@/lib/wa/types";

export interface AgentListLine {
  name: string;
  capsLine: string;
  state: "active" | "disabled" | "locked" | "not_in_plan";
}

export interface AgentSummary {
  name: string;
  /** the template's name ("מזכירה"), or null for a blank agent */
  templateName: string | null;
  capsLine: string;
  recipients: string[];
  /** the user's instructions (only what was added on top of a template) */
  instructions: string;
}

export interface ForwardConfirm {
  subject: string;
  from: string;
  attachments: string[];
  to: string;
  comment: string;
}

const STATE_NOTE: Record<AgentListLine["state"], string> = { active: "", disabled: " (מושבת)", locked: " (נעול)", not_in_plan: " (במסלול פרו)" };
const quote = (text: string) => `> ${text.replace(/\n/g, "\n> ")}`;
const preview = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

export const acopy = {
  // ---- plan and status ----
  "agent.limit.trial": (payLink: string) =>
    `סוכן משלך נפתח עם מנוי: במסלול הבסיסי סוכן אחד, ובמסלול פרו עד שלושה.\nבינתיים אפשר לנסות את הסוכנים המובנים — למשל ״@מזכירה מה יש לי מחר?״.\nלהפעלת מנוי:\n${payLink}`,
  "agent.limit.basic": (name: string, payLink: string) =>
    `במסלול הבסיסי אפשר סוכן אחד משלך, והוא כבר קיים: ״${name}״. אפשר לערוך אותו (״עריכת סוכן ${name}״), או למחוק וליצור חדש.\nבמסלול פרו — עד שלושה סוכנים משלך ושלושת הסוכנים המובנים:\n${payLink}`,
  "agent.limit.pro": () => "יש כבר שלושה סוכנים משלך — המקסימום במסלול פרו. כדי ליצור סוכן חדש אפשר למחוק אחד מהקיימים (״סוכנים״ מציג את הרשימה).",
  "agent.builtin_needs_pro": (name: string, payLink: string) =>
    `״${name}״ הוא סוכן מובנה של מסלול פרו. במסלול הבסיסי אפשר ליצור סוכן אחד משלך, גם על בסיס התבנית של ״${name}״ — לכתוב ״סוכן חדש״.\nלמעבר לפרו:\n${payLink}`,
  "agent.locked": (name: string, payLink: string) => `הסוכן ״${name}״ נעול: הוא מעבר למכסת הסוכנים של המסלול הנוכחי. אפשר למחוק סוכן אחר כדי לפנות מקום, או לעבור לפרו:\n${payLink}`,
  "agent.trial_builtin_edit": (payLink: string) => `בתקופת הניסיון אפשר לנסות את הסוכנים המובנים כמו שהם. התאמה אישית נפתחת במסלול פרו:\n${payLink}`,
  "agent.not_found": (name: string, names: string[]) =>
    names.length ? `לא מצאתי סוכן בשם ״${name}״. הסוכנים שלך: ${names.map((n) => `״${n}״`).join(", ")}.` : `לא מצאתי סוכן בשם ״${name}״. עדיין אין סוכנים — ״סוכן חדש״ יוצר אחד.`,
  "agent.disabled": (name: string) => `הסוכן ״${name}״ מושבת כרגע. להפעלה: ״הפעלת סוכן ${name}״.`,
  "agent.created": (name: string) => `הסוכן ״${name}״ מוכן. כדי לפנות אליו: ״@${name}״ בתחילת ההודעה — למשל ״@${name} מה חדש במייל?״.\nכל מה שיוצא החוצה מגיע קודם לאישור בכפתור.`,
  "agent.approval_note": () => "שימו לב: חלק מההנחיות מבקש לפעול בלי אישור. זה לא אפשרי - כל פעולה יוצאת עוברת אישור בכפתור, גם אצל סוכנים. שאר ההנחיות נשמרו.",
  "agent.reply_header": (name: string) => `*${name}:*`,
  "agent.hello": (name: string, capsLine: string) => `*${name}:*\nכאן. במה לעזור? בתפקיד הזה אני מטפלת ב${capsLine || "שיחה"}.`,
  "agent.back_to_main": () => `כאן ${P}. במה לעזור?`,
  "agent.list": (lines: AgentListLine[], quotaLine: string) =>
    [
      "*הסוכנים שלך*",
      lines.map((l) => `• @${l.name} — ${l.capsLine}${STATE_NOTE[l.state]}`).join("\n"),
      quotaLine,
      "לפנות לסוכן: ״@שם״ בתחילת ההודעה. ליצירה: ״סוכן חדש״. לעריכה: ״עריכת סוכן <שם>״.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  "agent.quota.trial": () => "בתקופת הניסיון אפשר לנסות את שלושת הסוכנים המובנים. סוכן משלך נפתח עם מנוי.",
  "agent.quota.basic": (used: number) => `סוכנים משלך: ${used} מתוך 1. הסוכנים המובנים כלולים במסלול פרו.`,
  "agent.quota.pro": (used: number) => `סוכנים משלך: ${used} מתוך 3, בנוסף לשלושת הסוכנים המובנים.`,

  // ---- create (§9.2) ----
  "agent.new.ask_template": () => "סוכן חדש. מאיפה מתחילים — מתבנית מוכנה, או מסוכן ריק?",
  "agent.new.ask_name": (templateName: string | null) =>
    templateName ? `על בסיס ״${templateName}״. איך לקרוא לסוכן? שם קצר, 2–24 תווים — למשל ״${templateName} אישית״.` : "איך לקרוא לסוכן? שם קצר, 2–24 תווים — למשל ״חשבוניות״ או ״לקוחות״.",
  "agent.new.name_invalid": (reason: string) => `${reason}\nאיך לקרוא לסוכן?`,
  "agent.new.ask_instructions_template": (templateName: string) =>
    `ההנחיות של ״${templateName}״ כבר מוכנות. מה להוסיף? למשל סגנון, לקוחות חשובים או מה לא לעשות. אפשר גם בהקלטה.`,
  "agent.new.ask_instructions_blank": () => "מה הסוכן עושה ואיך? כמה משפטים — תחום, סגנון, מה חשוב ומה לא לעשות. אפשר גם בהקלטה.",
  "agent.new.instructions_invalid": (reason: string) => `${reason}\nמה הסוכן עושה ואיך?`,
  "agent.new.ask_tools": (capsLine: string) => `הסוכן יוכל: ${capsLine}.\nמתאים, או לשנות?`,
  "agent.new.choose_tools": () => "מה הסוכן יוכל לעשות? שליטה מלאה ביכולות — באזור האישי באתר.",
  "agent.new.ask_recipients": () => "לאילו כתובות מותר לסוכן להכין העברות ומיילים? עד 5 כתובות, מופרדות בפסיק. בכל מקרה כל העברה מגיעה לאישור בכפתור.",
  "agent.new.recipients_invalid": (reason: string) => `${reason}\nעד 5 כתובות, מופרדות בפסיק — או ״בלי הגבלה״.`,
  "agent.new.summary": (s: AgentSummary) =>
    [
      `*סוכן חדש: ${s.name}*`,
      s.templateName ? `על בסיס: ${s.templateName}` : "סוכן משלך, בלי תבנית",
      `יכולות: ${s.capsLine}`,
      s.recipients.length ? `נמענים מותרים: ${s.recipients.join(", ")}` : "",
      s.instructions ? `${s.templateName ? "תוספות להנחיות" : "הנחיות"}:\n${quote(preview(s.instructions))}` : "",
      "לשמור?",
    ]
      .filter(Boolean)
      .join("\n"),
  "agent.new.cancelled": () => "בוטל. הסוכן לא נשמר.",
  "agent.new.expired": () => "הבחירה הזו כבר לא פעילה (עברו יותר מ-30 דקות). אפשר להתחיל שוב — ״סוכן חדש״, או ״סוכנים״ לרשימה.",

  // ---- edit (§9.3) ----
  "agent.edit.menu": (name: string) => `מה לשנות בסוכן ״${name}״?`,
  "agent.edit.ask_instructions": (name: string, builtin: boolean) =>
    builtin
      ? `מה להוסיף להנחיות של ״${name}״? הטקסט מחליף את ההוספות הקודמות; ההנחיות הבסיסיות של הסוכן נשארות. אפשר גם בהקלטה. כדי למחוק את ההוספות — ״ריק״.`
      : `מה ההנחיות החדשות לסוכן ״${name}״? הטקסט מחליף את ההנחיות הקודמות. אפשר גם בהקלטה.`,
  "agent.edit.ask_tools": (name: string) => `מה הסוכן ״${name}״ יוכל לעשות?`,
  "agent.edit.ask_recipients": (name: string) => `לאילו כתובות מותר לסוכן ״${name}״ להכין מיילים, העברות והזמנות? עד 5 כתובות, מופרדות בפסיק — או ״בלי הגבלה״.`,
  "agent.edit.saved": (name: string) => `נשמר. השינויים בסוכן ״${name}״ בתוקף מההודעה הבאה.`,
  "agent.edit.enabled": (name: string) => `הסוכן ״${name}״ פעיל. כדי לפנות אליו: ״@${name}״.`,
  "agent.edit.disabled": (name: string) => `הסוכן ״${name}״ הושבת. להפעלה מחדש: ״הפעלת סוכן ${name}״.`,
  "agent.edit.cancelled": () => "בוטל. לא שיניתי כלום.",

  // ---- delete ----
  "agent.delete.confirm": (name: string) => `למחוק את הסוכן ״${name}״? ההנחיות שלו נמחקות; מה שכבר נעשה נשאר ביומן הפעולות.`,
  "agent.delete.done": (name: string) => `הסוכן ״${name}״ נמחק.`,
  "agent.delete.kept": () => "הסוכן נשאר. לא שיניתי כלום.",
  "agent.delete.builtin": (name: string) => `סוכן מובנה אי אפשר למחוק. אפשר להשבית אותו: ״השבתת סוכן ${name}״.`,

  // ---- generic failure of a management action (site-side reason inside) ----
  "agent.error": (reason: string) => reason,

  // ---- forward_mail (§7.3) ----
  "act.mail.forward_confirm": (f: ForwardConfirm) =>
    [
      "*העברת מייל*",
      // the destination first: the mail's own fields (written by its sender) come after it, each one line and capped
      `אל: ${f.to}`,
      `נושא: ${f.subject || "(בלי נושא)"}`,
      f.from ? `מאת: ${f.from}` : "",
      f.attachments.length ? `קבצים: ${f.attachments.join(", ")}` : "",
      f.comment ? `\n${quote(f.comment)}` : "",
      "\nלהעביר?",
    ]
      .filter(Boolean)
      .join("\n"),
  "act.mail.forwarded": (to: string) => `הועבר אל ${to}.`,
} as const;

export type AgentCopyId = keyof typeof acopy;

/** Buttons and lists of the agent flows; ids come back as `ag:*` (like `pa:` / `rem:`). */
export const agentButtons = {
  instructionsNone: [{ id: "ag:inst:none", title: "בלי תוספות" }] satisfies ReplyButton[],
  tools: [
    { id: "ag:tools:ok", title: "מתאים" },
    { id: "ag:tools:change", title: "לשנות" },
  ] satisfies ReplyButton[],
  recipientsNone: [{ id: "ag:rcp:none", title: "בלי הגבלה" }] satisfies ReplyButton[],
  save: [
    { id: "ag:save", title: "שמירה" },
    { id: "ag:cancel", title: "ביטול" },
  ] satisfies ReplyButton[],
  cancel: [{ id: "ag:cancel", title: "ביטול" }] satisfies ReplyButton[],
  deleteConfirm: (agentId: string) =>
    [
      { id: `ag:del:yes:${agentId}`, title: "מחיקה" },
      { id: `ag:del:no:${agentId}`, title: "השאר" },
    ] satisfies ReplyButton[],
  /** approval buttons of a forward draft: העבר / ערוך / בטל (same ids as every pending action) */
  forward: (actionId: string) =>
    [
      { id: `pa:approve:${actionId}`, title: "העבר" },
      { id: `pa:edit:${actionId}`, title: "ערוך" },
      { id: `pa:cancel:${actionId}`, title: "בטל" },
    ] satisfies ReplyButton[],
};

export const agentLists = {
  /** WhatsApp list: button text ≤ 20, section title ≤ 24 */
  templateButton: "בחירת תבנית",
  templateTitle: "תבניות",
  toolsButton: "בחירת יכולות",
  toolsTitle: "יכולות",
  editButton: "בחירה",
  editTitle: "עריכה",
  blankRow: { id: "ag:tpl:blank", title: "סוכן ריק", description: "מתחילים מאפס: שם, הנחיות ויכולות" } satisfies ListRow,
  /** `toggle`: which switch to offer — none for a locked agent (over the quota; only an upgrade or a deletion frees it). */
  editRows: (key: string, builtin: boolean, toggle: "enable" | "disable" | null): ListRow[] =>
    [
      { id: `ag:ed:instructions:${key}`, title: builtin ? "הנחיות נוספות" : "שינוי הנחיות", description: builtin ? "מה להוסיף להנחיות של הסוכן" : "מה הסוכן עושה ואיך" },
      { id: `ag:ed:tools:${key}`, title: "שינוי יכולות", description: builtin ? "צמצום מתוך היכולות של הסוכן" : "מייל, יומן, קבצים, תזכורות" },
      { id: `ag:ed:recipients:${key}`, title: "נמענים מותרים", description: "לאילו כתובות מותר להכין מיילים והעברות" },
      ...(toggle ? [{ id: `ag:ed:toggle:${key}`, title: toggle === "disable" ? "השבתה" : "הפעלה", description: toggle === "disable" ? "הסוכן לא יענה עד שיופעל שוב" : "הסוכן יחזור לענות" }] : []),
      ...(builtin ? [] : [{ id: `ag:ed:delete:${key}`, title: "מחיקה", description: "מחיקת הסוכן וההנחיות שלו" }]),
    ] satisfies ListRow[],
};
