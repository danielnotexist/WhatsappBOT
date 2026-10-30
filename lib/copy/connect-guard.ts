/**
 * The connect flow's refusals that protect the account (security round, area C): a chat link used twice or by a
 * browser signed in to another account, a callback that did not start in this browser, a chat link that tries to add a
 * mailbox other than the account's own, and a plan refusal reached through a chat link (no pay link from a chat link).
 * Neutral wording, no "שלח/י" forms (docs/copy/style-guide.md).
 */
export const CONNECT_GUARD = {
  link_used: "הקישור לא בתוקף (הוא עובד 30 דקות ופעם אחת). אפשר לבקש קישור חדש בשיחה.",
  other_account: "הדפדפן הזה מחובר לחשבון אחר. כדי להשתמש בקישור מהשיחה, יש לצאת מהחשבון באתר ולפתוח את הקישור שוב.",
  unbound: "החיבור לא הושלם: הוא התחיל בדפדפן אחר או שעבר זמן רב מדי. אפשר להתחיל שוב מאותו דפדפן.",
  chat_other_mailbox: "קישור מהשיחה מחבר רק את תיבת המייל שבכתובת של החשבון. כדי לחבר תיבה בכתובת אחרת, יש להיכנס לאזור האישי באתר ולחבר אותה משם.",
  plan_second_account: "בחבילה הנוכחית אפשר לחבר חשבון אחד - Google או Microsoft 365. לשדרוג החבילה אפשר להיכנס לאזור האישי באתר.",
  plan_pro_feature: "האפשרות הזו כלולה בחבילת Pro. לשדרוג החבילה אפשר להיכנס לאזור האישי באתר.",
} as const;
