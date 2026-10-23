import { PLANS } from "@/lib/billing/plans";

/**
 * Chat strings for the services added on 23.10.2026 on top of the Microsoft 365 connection: Microsoft To Do and
 * SharePoint (the Google ones live in lib/copy/bot-google.ts), and the plan lines of the basic / pro split (`s.plan.*`:
 * a pro service asked for on basic or in the trial, a second account on a one-account plan). Keyed by the ids in docs/copy/bot-copy-services.md
 * (source of truth; a test checks every id is documented). Neutral phrasing; עלזה speaks about herself in the feminine.
 * Microsoft has no incremental consent: the link is the normal connect, which re-consents (and an organisation that
 * needs its admin gets the admin flow from the callback).
 */

const LINK_TTL = "הקישור עובד ל-30 הדקות הקרובות.";
const ADMIN_NOTE = "בארגון שבו מנהל ה-IT מאשר אפליקציות, ייתכן שתופיע בקשה לאישור מנהל.";
const NO_LINK = 'אפשר לכתוב "לחבר את Microsoft 365" ואשלח קישור.';
/** "במסלול הבסיסי" / "בתקופת הניסיון" — where the user is now */
const WHERE = (onTrial: boolean) => (onTrial ? "בתקופת הניסיון" : "במסלול הבסיסי");
/** lib/billing/commands.ts answers "שדרוג" with the upgrade offer (trial: the pay link) */
const UPGRADE = 'אפשר לכתוב "שדרוג" ואשלח את הפרטים.';

export const scopy = {
  "s.todo.consent": (link: string) => `כדי שאוכל לעבוד עם Microsoft To Do צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה למשימות:\n${link}\n${ADMIN_NOTE}\n${LINK_TTL}`,
  "s.todo.consent_no_link": () => `כדי שאוכל לעבוד עם Microsoft To Do צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה למשימות. ${NO_LINK}`,
  "s.todo.created": (title: string, list: string, due: string | null) => `נוספה משימה ל-Microsoft To Do (${list}): ${title}${due ? `, עד ${due}` : ""}.`,
  "s.sharepoint.consent": (link: string) => `כדי שאוכל לחפש באתרי SharePoint של הארגון צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה לאתרים:\n${link}\n${ADMIN_NOTE}\n${LINK_TTL}`,
  "s.sharepoint.consent_no_link": () => `כדי שאוכל לחפש באתרי SharePoint של הארגון צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה לאתרים. ${NO_LINK}`,
  "s.plan.pro_feature": (feature: string, onTrial: boolean) => `במסלול פרו (${PLANS.pro.priceIls} ₪ לחודש) יש גם ${feature}. ${WHERE(onTrial)} זה לא כלול. ${UPGRADE}`,
  "s.plan.one_account": (inForce: string, other: string, onTrial: boolean) =>
    `${WHERE(onTrial)} עובדים עם חשבון אחד, והחשבון המחובר הוא ${inForce}. במסלול פרו (${PLANS.pro.priceIls} ₪ לחודש) ${inForce} ו-${other} עובדים יחד. ${UPGRADE}\nאפשר גם להחליף חשבון: לנתק את ${inForce} באזור האישי, ואז לחבר את ${other}.`,
} as const;

export type ServicesCopyId = keyof typeof scopy;
