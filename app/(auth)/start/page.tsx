import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmailOption, SsoButtons, SsoErrorNotice, SsoNote, SsoTerms } from "@/components/auth/sso-options";
import { Handwritten } from "@/components/brand/handwritten";
import { IncomingCall } from "@/components/brand/incoming-call";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { BRAND } from "@/lib/brand";
import { TRIAL_MESSAGES } from "@/lib/billing/plans";
import { SSO_COPY } from "@/lib/copy/auth-sso";
import { pageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata({
  path: "/start",
  title: "הרשמה",
  description: `הרשמה ל-${BRAND.name} בדקה: כניסה עם Microsoft או Google שמחברת גם את המייל, או מייל וקוד, ו-${TRIAL_MESSAGES} הודעות ראשונות בחינם בוואטסאפ.`,
});

/**
 * Step 1 (round plan §3): עלזה is calling — phone first, then the handwritten line, the headline, "about a minute",
 * and the ways in (Daniel, 28.10.2026): "המשך עם Microsoft" / "המשך עם Google" first — one consent signs up and
 * connects the mailbox, and the signup goes straight to the WhatsApp step — then "המשך עם מייל" (the email card and
 * the code, as before), the terms line and the sign-in link. On phones the buttons stay pinned to the bottom, with the
 * email way and the sign-in link side by side under them; the line about the apps and the terms stay in the flow.
 * Static; a provider sign-in that came back refused shows its reason here (`?sso_error=`, read on the client).
 */
export default function StartIntroPage() {
  return (
    <div className="mx-auto grid w-full max-w-[78rem] flex-1 items-center gap-8 pt-1 pb-56 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-2 lg:pb-20">
      <div className="flex justify-center lg:order-2">
        <PhoneMockup label={`${BRAND.name} מתקשרת`} className="w-[min(100%,12.5rem)] sm:w-[min(100%,19rem)]">
          <IncomingCall />
        </PhoneMockup>
      </div>
      <div className="flex flex-col items-start lg:order-1">
        <Handwritten tone="sage">עושה את העבודה, באמת.</Handwritten>
        <h1 className="mt-3 text-hero font-bold">
          העוזרת האישית שלך, <span className="headline-light">בוואטסאפ</span>.
        </h1>
        <p className="mt-5 text-lede text-cream-muted">לוקח בערך דקה.</p>
        {/* phones: what the provider buttons also do, and the terms, in the flow above the pinned bar */}
        <SsoNote className="mt-4 max-w-[26rem] lg:hidden" />
        <SsoTerms className="mt-2 lg:hidden" />
        <Suspense fallback={null}>
          <SsoErrorNotice className="mt-6 w-full lg:max-w-[25rem]" />
        </Suspense>
        {/* on phones the ways in stay pinned to the bottom */}
        <div
          data-pinned-cta=""
          className="w-full max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:bg-[linear-gradient(to_top,var(--alze-night)_78%,transparent)] max-lg:px-4 max-lg:pt-8 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:mt-8 lg:max-w-[25rem]"
        >
          <SsoButtons from="start" phoneCompact />
          <SsoNote className="mt-3.5 max-lg:hidden" />
          <EmailOption href="/start/email" className="mt-5 max-lg:hidden" />
          <div className="mt-1.5 flex items-center justify-between gap-x-4 text-[0.9375rem] lg:hidden">
            <Link href="/start/email" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-cream underline underline-offset-3">
              {SSO_COPY.continueWithEmail}
            </Link>
            <p className="text-cream-muted">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-cream underline underline-offset-3">
                כניסה
              </Link>
            </p>
          </div>
          <SsoTerms className="mt-4 max-lg:hidden" />
          <p className="mt-2 text-[0.9375rem] text-cream-muted max-lg:hidden">
            כבר יש לך חשבון?{" "}
            <Link href="/login" className="font-semibold text-cream underline underline-offset-3">
              כניסה
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
