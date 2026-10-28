"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Cta } from "@/components/brand/cta";
import { GoogleLogo, MicrosoftLogo } from "@/components/brand/provider-logo";
import { trackEvent } from "@/lib/analytics/send";
import { SSO_COPY, SSO_ERRORS, isSsoErrorCode, type SsoProviderId } from "@/lib/copy/auth-sso";
import { cn } from "@/lib/utils";

export type SsoFrom = "start" | "login";

/** The start route of a provider sign-in (lib/auth/sso.ts). From /start a signed-in visitor connects and lands on the WhatsApp step. */
export function ssoHref(provider: SsoProviderId, from: SsoFrom): string {
  return `/api/auth/${provider}/start?intent=signin&from=${from}${from === "start" ? "&returnTo=onboarding" : ""}`;
}

/** An envelope, in the current colour — "המשך עם מייל". */
export function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("size-5 flex-none fill-none stroke-current stroke-2", className)}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The provider's mark on a small white disc: Google asks for its "G" on white, and both buttons keep the same chip. */
function LogoChip({ provider }: { provider: SsoProviderId }) {
  return (
    <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgb(19_36_28/0.1)]">
      {provider === "microsoft" ? <MicrosoftLogo className="size-[1.0625rem]" /> : <GoogleLogo className="size-[1.125rem]" />}
    </span>
  );
}

/**
 * "המשך עם Microsoft" and "המשך עם Google" (Daniel, 28.10.2026): the main way in on /start and /login. Each is a plain
 * link to its start route — the provider's consent signs in (or up) and connects the mailbox in one step — so it works
 * before hydration and leaves the site at once. Microsoft first (PLAN: M365 first). Under them, one line on what the
 * provider sign-in also does. From /start the click is the signup funnel's first step (the email card reports its own).
 * `phoneCompact`: below the wide layout (the pinned bar of /start) the buttons are a little lower.
 */
export function SsoButtons({ from, phoneCompact = false, className }: { from: SsoFrom; phoneCompact?: boolean; className?: string }) {
  const providers: SsoProviderId[] = ["microsoft", "google"];
  return (
    <div role="group" aria-label={SSO_COPY.groupLabel} className={cn("flex flex-col gap-3", phoneCompact && "max-lg:gap-2.5", className)}>
      {providers.map((p) => (
        <Cta
          key={p}
          href={ssoHref(p, from)}
          tone="cream"
          block
          className={cn("justify-center ps-3 pe-6", phoneCompact && "max-lg:min-h-12")}
          onClick={from === "start" ? () => trackEvent("signup_start") : undefined}
        >
          <LogoChip provider={p} />
          <span className="flex-1 text-center">{SSO_COPY.continueWith[p]}</span>
          {/* balances the chip, so the label sits in the middle of the button */}
          <span aria-hidden="true" className="w-5 flex-none" />
        </Cta>
      ))}
    </div>
  );
}

/** The line under the provider buttons: signing in with them connects the apps too. */
export function SsoNote({ className }: { className?: string }) {
  return <p className={cn("text-[0.9375rem] leading-snug text-cream-muted", className)}>{SSO_COPY.connectsApps}</p>;
}

/** The terms line of a signup that skips the email card (the provider buttons on /start). */
export function SsoTerms({ className }: { className?: string }) {
  return (
    <p className={cn("text-[0.875rem] text-cream-muted", className)}>
      בהמשך מאשרים את{" "}
      <Link href="/terms" className="rounded-sm text-cream underline underline-offset-3">
        התנאים
      </Link>{" "}
      ו
      <Link href="/privacy" className="rounded-sm text-cream underline underline-offset-3">
        מדיניות הפרטיות
      </Link>
      .
    </p>
  );
}

/** "המשך עם מייל": the email code, now the second way in. */
export function EmailOption({ href, className }: { href: "/start/email" | "/login/email"; className?: string }) {
  return (
    <Cta href={href} tone="ghost" block className={className}>
      <MailIcon />
      {SSO_COPY.continueWithEmail}
    </Cta>
  );
}

/**
 * Why a provider sign-in came back without signing in (`?sso_error=<code>`, lib/auth/sso.ts): one fixed line per code,
 * never text from the URL. Reads the address on the client, so the page around it stays static (wrap in Suspense).
 */
export function SsoErrorNotice({ className }: { className?: string }) {
  const code = useSearchParams().get("sso_error");
  if (!isSsoErrorCode(code)) return null;
  return (
    <p role="alert" className={cn("rounded-field border border-[color:var(--alze-error-on-dark)]/45 bg-[color:var(--alze-error-on-dark)]/10 px-4 py-3 text-[0.9375rem] leading-snug text-cream", className)}>
      {SSO_ERRORS[code]}
    </p>
  );
}
