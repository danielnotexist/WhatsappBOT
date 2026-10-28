import { BRAND } from "@/lib/brand";

/**
 * The site's words for "המשך עם Microsoft / Google" (Daniel, 28.10.2026): the buttons on /start and /login, the one line
 * that says signing in also connects the apps, and every outcome a sign-in can come back with. Short, neutral (no
 * "שלח/י" forms), only the short dash (docs/copy/style-guide.md). Client-safe: plain strings, no server imports.
 * The outcome codes travel in the URL (`?sso_error=` on /start and /login, `?sso=` on /login/code) and are mapped to
 * these fixed lines: a URL never carries text that the page would show.
 */

export type SsoProviderId = "microsoft" | "google";

export const SSO_COPY = {
  continueWith: { microsoft: "המשך עם Microsoft", google: "המשך עם Google" } satisfies Record<SsoProviderId, string>,
  continueWithEmail: "המשך עם מייל",
  /** under the buttons: what the provider sign-in does besides signing in */
  connectsApps: `כניסה עם Microsoft או Google מחברת ל${BRAND.name} גם את המייל, היומן והקבצים, בצעד אחד.`,
  /** the group's accessible name */
  groupLabel: "דרכים להמשיך",
} as const;

/** Why a provider sign-in came back without signing in (`?sso_error=<code>` on the page it started from). */
export const SSO_ERRORS = {
  state: "הכניסה לא הושלמה: הבקשה פגה או שכבר השתמשו בה. אפשר לנסות שוב.",
  denied: "הכניסה בוטלה. אפשר לנסות שוב, או להמשיך עם מייל.",
  failed: "הכניסה לא הושלמה. אפשר לנסות שוב, או להמשיך עם מייל.",
  unverified: "כתובת המייל של חשבון ה-Google הזה לא אומתה אצל Google, ולכן אי אפשר להיכנס איתו. אפשר להמשיך עם מייל.",
  no_email: "לא התקבלה כתובת מייל מהחשבון. אפשר להמשיך עם מייל.",
  admin_required: "הארגון דורש אישור חד-פעמי של מנהל ה-IT. בינתיים אפשר להמשיך עם מייל ולחבר את Microsoft 365 אחר כך.",
  admin_blocked: "מנהל ה-Google Workspace של הארגון חוסם את החיבור. אפשר להמשיך עם מייל.",
} as const;

export type SsoErrorCode = keyof typeof SSO_ERRORS;

export function isSsoErrorCode(v: unknown): v is SsoErrorCode {
  return typeof v === "string" && Object.hasOwn(SSO_ERRORS, v);
}

/**
 * The code card after a provider sign-in that cannot be trusted with an existing account (`?sso=microsoft`): the email
 * matches an account, the provider does not vouch for it, so the code proves it instead (lib/auth/sso.ts).
 */
export const SSO_OTP_FALLBACK: Record<SsoProviderId, string> = {
  microsoft: "יש כבר חשבון עם המייל הזה. כדי לוודא שהוא שלך, שלחנו אליו קוד. אחרי הכניסה אפשר לחבר את Microsoft 365 מהאזור האישי.",
  google: "יש כבר חשבון עם המייל הזה. כדי לוודא שהוא שלך, שלחנו אליו קוד. אחרי הכניסה אפשר לחבר את Google מהאזור האישי.",
};

export function isSsoProviderId(v: unknown): v is SsoProviderId {
  return v === "microsoft" || v === "google";
}

const PROVIDER_TITLE: Record<SsoProviderId, string> = { microsoft: "Microsoft 365", google: "Google" };

/**
 * Signed in to an existing account on a one-account plan that already works with the other provider: the sign-in
 * stands, the new connection is not kept (lib/connections/plan-gate.ts) — shown in the personal area's "חיבורים".
 */
export function ssoNotConnectedOnePlan(provider: SsoProviderId): string {
  const other: SsoProviderId = provider === "google" ? "microsoft" : "google";
  return `החיבור ל-${PROVIDER_TITLE[provider]} לא נשמר: במסלול הזה עובדים עם חשבון אחד, ו-${PROVIDER_TITLE[other]} כבר מחובר. שניהם יחד: במסלול פרו.`;
}
