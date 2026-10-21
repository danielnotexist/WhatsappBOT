import type { Metadata } from "next";
import Link from "next/link";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { IncomingCall } from "@/components/brand/incoming-call";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "הרשמה", description: BRAND.description };

/**
 * Step 1 (round plan §3): עלזה is calling — phone first, then the handwritten line, the headline, "about a minute",
 * "בואו נתחיל" and the sign-in link. On phones the CTA stays pinned to the bottom so it is always in reach. Static.
 */
export default function StartIntroPage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 pt-1 pb-40 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-2 lg:pb-20">
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
        {/* on phones the call to action (and the sign-in line under it) stays pinned to the bottom */}
        <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:bg-[linear-gradient(to_top,var(--alze-night)_72%,transparent)] max-lg:px-4 max-lg:pt-8 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:mt-9">
          <Cta href="/start/email" className="max-lg:w-full lg:min-w-56">
            בואו נתחיל
          </Cta>
          <p className="mt-3 text-[0.9375rem] text-cream-muted max-lg:text-center lg:mt-6">
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
