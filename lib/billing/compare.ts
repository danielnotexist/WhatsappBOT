import { BRAND } from "@/lib/brand";
import { COMING_SOON, PLANS, TRIAL_MESSAGES, ZOOM_SOON_LINE, entitlements, planFeatures, type Entitlements, type PaidPlan, type ProFlag } from "./plans";

/**
 * The full comparison of basic and pro (/pricing): every row generated from the entitlements and the plan specs in
 * ./plans.ts, so the page can never promise what the code does not enforce. The lines both plans share take their
 * words from basic's list (planFeatures), the pro-only ones from pro's list; "בקרוב" on what is not built yet
 * (COMING_SOON). Site text: Hebrew, the short hyphen only.
 */

export type CompareCell = { kind: "yes" } | { kind: "no" } | { kind: "soon" } | { kind: "text"; text: string };

export interface CompareRow {
  id: string;
  label: string;
  basic: CompareCell;
  pro: CompareCell;
}

export interface CompareSection {
  id: string;
  title: string;
  rows: CompareRow[];
}

const he = new Intl.NumberFormat("he-IL");
const YES: CompareCell = { kind: "yes" };
const NO: CompareCell = { kind: "no" };
const text = (t: string): CompareCell => ({ kind: "text", text: t });

/** A pro capability on a plan: included (or "בקרוב" while it is being built) or not. */
function flag(e: Entitlements, k: ProFlag): CompareCell {
  if (!e[k]) return NO;
  return COMING_SOON.includes(k) ? { kind: "soon" } : YES;
}

const accountsText = (n: Entitlements["maxProviders"]) => (n > 1 ? "Google ו-Microsoft יחד" : "אחד: Google או Microsoft");
const customAgentsText = (n: number) => (n === 0 ? "-" : n === 1 ? "סוכן אחד" : `עד ${n} סוכנים`);

export function planComparison(): CompareSection[] {
  const b = entitlements("basic");
  const p = entitlements("pro");
  const basicLine = (id: string) => planFeatures("basic").lines.find((l) => l.id === id)!.text;
  const proLine = (id: string) => planFeatures("pro").lines.find((l) => l.id === id)!.text;
  const both = (id: string): CompareRow => ({ id, label: basicLine(id), basic: YES, pro: YES });
  const pro = (id: string, k: ProFlag): CompareRow => ({ id, label: proLine(id), basic: flag(b, k), pro: flag(p, k) });
  const messages = (plan: PaidPlan) => `עד ${he.format(PLANS[plan].messages)} הודעות${plan === "pro" ? ", בשימוש הוגן" : ""}`;

  return [
    {
      id: "plan",
      title: "המסלול",
      rows: [
        { id: "price", label: "מחיר לחודש, כולל מע״מ", basic: text(`${PLANS.basic.priceIls} ₪`), pro: text(`${PLANS.pro.priceIls} ₪`) },
        // the annual cycle: 10 months for 12, one charge (lib/billing/plans.ts)
        { id: "price_annual", label: "מחיר לשנה, חודשיים מתנה", basic: text(`${he.format(PLANS.basic.annualPriceIls)} ₪`), pro: text(`${he.format(PLANS.pro.annualPriceIls)} ₪`) },
        { id: "messages", label: "הודעות בחודש", basic: text(messages("basic")), pro: text(messages("pro")) },
        { id: "accounts", label: "חשבונות מחוברים", basic: text(accountsText(b.maxProviders)), pro: text(accountsText(p.maxProviders)) },
      ],
    },
    {
      id: "work",
      title: "מייל, יומן וקבצים",
      rows: [both("mail"), both("calendar"), both("files"), pro("drive", "driveFullRead"), pro("file_create", "fileCreate"), pro("sharepoint", "sharepoint"), pro("tasks", "tasks")],
    },
    {
      id: "day",
      title: "לאורך היום",
      rows: [
        both("routine"),
        pro("proactive", "proactive"),
        pro("meetings", "meetingSummaries"),
        // Teams and Meet shipped; Zoom is "בקרוב" on pro (ZOOM_SOON_LINE), never on basic
        { id: ZOOM_SOON_LINE.id, label: ZOOM_SOON_LINE.text, basic: NO, pro: p.meetingSummaries ? { kind: "soon" } : NO },
        pro("business", "businessSystems"),
      ],
    },
    {
      id: "agents",
      title: "סוכנים",
      rows: [
        { id: "builtin", label: "שלושת הסוכנים המובנים: מזכירה, מתמחה ומנהלת חשבונות", basic: b.builtinAgents ? YES : NO, pro: p.builtinAgents ? YES : NO },
        { id: "custom", label: "סוכנים משלך, עם הנחיות ויכולות שבוחרים", basic: text(customAgentsText(b.customAgents)), pro: text(customAgentsText(p.customAgents)) },
      ],
    },
  ];
}

/** The line under the table: the free messages, as basic in what connects (entitlements("trial")). */
export function trialNote(): string {
  const t = entitlements("trial");
  const agents = t.builtinAgents ? `, ושלושת הסוכנים המובנים של ${BRAND.name} כמו שהם` : "";
  return `${TRIAL_MESSAGES} ההודעות הראשונות בחינם, בלי כרטיס אשראי: ${t.maxProviders === 1 ? "חשבון אחד, כמו בבסיסי" : "כמו בפרו"}${agents}.`;
}
