/**
 * Where an OAuth callback sends the browser (`returnTo` on /api/auth/{provider}/start, stored with the state):
 *   onboarding → success: /start/ready?connected=<provider>   failure: /start/connect?error=… (retry or skip)
 *   account    → /account?notice=… | /account?error=…        (default: personal area, chat links)
 * Only these fixed paths are possible — never a caller-supplied URL (no open redirect).
 */
export type OAuthReturnTo = "onboarding" | "account";

export function parseReturnTo(value: string | null | undefined): OAuthReturnTo {
  return value === "onboarding" || value === "/start/ready" || value === "/start/connect" ? "onboarding" : "account";
}

export function oauthReturnUrl(appUrl: string, returnTo: OAuthReturnTo, provider: "microsoft" | "google", outcome: { ok: true; notice: string } | { ok: false; error: string }): string {
  let dest: URL;
  if (returnTo === "onboarding") {
    dest = new URL(outcome.ok ? "/start/ready" : "/start/connect", appUrl);
    if (outcome.ok) dest.searchParams.set("connected", provider);
  } else {
    dest = new URL("/account", appUrl);
  }
  if (outcome.ok) dest.searchParams.set("notice", outcome.notice);
  else dest.searchParams.set("error", outcome.error);
  return dest.toString();
}
