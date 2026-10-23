/**
 * Chat strings for the services added on 23.10.2026 on top of the Microsoft 365 connection: Microsoft To Do and
 * SharePoint (the Google ones live in lib/copy/bot-google.ts). Keyed by the ids in docs/copy/bot-copy-services.md
 * (source of truth; a test checks every id is documented). Neutral phrasing; עלזה speaks about herself in the feminine.
 * Microsoft has no incremental consent: the link is the normal connect, which re-consents (and an organisation that
 * needs its admin gets the admin flow from the callback).
 */

const LINK_TTL = "הקישור עובד ל-30 הדקות הקרובות.";
const ADMIN_NOTE = "בארגון שבו מנהל ה-IT מאשר אפליקציות, ייתכן שתופיע בקשה לאישור מנהל.";
const NO_LINK = 'אפשר לכתוב "לחבר את Microsoft 365" ואשלח קישור.';

export const scopy = {
  "s.todo.consent": (link: string) => `כדי שאוכל לעבוד עם Microsoft To Do צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה למשימות:\n${link}\n${ADMIN_NOTE}\n${LINK_TTL}`,
  "s.todo.consent_no_link": () => `כדי שאוכל לעבוד עם Microsoft To Do צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה למשימות. ${NO_LINK}`,
  "s.todo.created": (title: string, list: string, due: string | null) => `נוספה משימה ל-Microsoft To Do (${list}): ${title}${due ? `, עד ${due}` : ""}.`,
  "s.sharepoint.consent": (link: string) => `כדי שאוכל לחפש באתרי SharePoint של הארגון צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה לאתרים:\n${link}\n${ADMIN_NOTE}\n${LINK_TTL}`,
  "s.sharepoint.consent_no_link": () => `כדי שאוכל לחפש באתרי SharePoint של הארגון צריך לחבר מחדש את Microsoft 365 ולאשר את ההרשאה לאתרים. ${NO_LINK}`,
} as const;

export type ServicesCopyId = keyof typeof scopy;
