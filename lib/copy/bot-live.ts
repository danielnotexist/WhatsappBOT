/**
 * The spend caps of the live AI (lib/ai/budget.ts) and the website chat (/demo/chat) — kept apart from lib/copy/bot.ts.
 * Ids are documented in docs/copy/bot-copy-live.md (a test checks it). Calm, neutral phrasing, short hyphens only:
 * these lines are also shown on the site, in the chat page.
 */
export const liveCopy = {
  /** the day's AI / STT budget is spent (the demo with LIVE_AI=1) */
  "budget.daily_cap_demo": () => "הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר.",
  /** the day's budget is spent outside the demo (AI_DAILY_BUDGET_USD set by the operator) */
  "budget.daily_cap": () => "הגענו לתקרת השימוש של היום. אפשר להמשיך מחר.",
  /** this user's daily message cap in the demo (DEMO_USER_DAILY_MESSAGES) */
  "budget.user_cap_demo": (limit: number) => `הגענו ל-${limit} הודעות היום, המכסה של גרסת הבדיקה. אפשר להמשיך מחר.`,
} as const;

/** The reply for a blocked call. */
export function budgetReply(reason: "budget" | "user_messages", demo: boolean, userLimit: number | null): string {
  if (reason === "user_messages") return liveCopy["budget.user_cap_demo"](userLimit ?? 0);
  return demo ? liveCopy["budget.daily_cap_demo"]() : liveCopy["budget.daily_cap"]();
}
