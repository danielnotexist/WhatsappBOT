import type { CSSProperties, ReactNode } from "react";
import { ChatDemo } from "@/components/brand/chat-demo";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { BRAND } from "@/lib/brand";
import { HERO_SCRIPT, PRICING } from "./content";
import { DeferredMascot, profileBackground } from "./mascot";
import { StyleAfterHydration } from "./mascot-deferred";

/**
 * The hero: the headline is the title card, the phone is the only light in the room. On large screens the first
 * sentence runs the full width on one line and the phone rises beside the short second line (the name + "על זה.").
 * Under it only what has to be there (Daniel, 28.10.2026): one short line, the call to action and the free messages -
 * the systems she works with are the connectors section's job.
 * Server-rendered; the chat demo inside the phone is the one client island. The single entrance moment (the phone
 * rises, its screen turns on and lights the table) is CSS only and collapses under reduced motion.
 * `signIn` replaces the "כניסה" button (app/page.tsx: a request-time hole that hides it for a signed-in visitor, who
 * gets "לאזור האישי" in the header instead).
 */
export function Hero({ signIn = <SignInCta /> }: { signIn?: ReactNode }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative [--hero:clamp(3rem,1.5rem+6.2vw,7.5rem)]"
    >
      {/* key light from above, as on the signup stage */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-[4.75rem] h-[46rem] bg-[radial-gradient(70%_60%_at_65%_0%,rgb(156_201_168/0.09),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-[84rem] gap-x-16 px-4 pt-6 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:px-12 lg:pt-4 lg:pb-32">
        <div className="lg:col-span-2">
          <Handwritten tone="sage" className="lg:text-[2.25rem]">
            בוואטסאפ. בעברית.
          </Handwritten>
          <h1
            id="hero-title"
            className="mt-4 text-[length:var(--hero)] leading-[1.02] font-bold tracking-[-0.018em]"
          >
            <span className="block lg:whitespace-nowrap">מה שהבטחת לעשות.</span>
            <span className="headline-light block">{BRAND.name} על זה.</span>
          </h1>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <p className="mt-8 max-w-[33rem] text-lede text-cream-muted lg:mt-10">עוזרת אישית שמחוברת למייל, ליומן ולקבצים של העסק.</p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Cta href="/start" className="max-sm:flex-1 sm:min-w-64">
              בואו נתחיל - לוקח דקה
            </Cta>
            {signIn}
          </div>
          <p className="mt-5 text-[0.9375rem] text-cream-muted">
            {PRICING.trial} הודעות ראשונות בחינם, בלי כרטיס אשראי.
          </p>
        </div>

        {/* on large screens the phone climbs one headline line, beside the short second line; the hoopoe perches on
            its top corner, on the side away from the headline */}
        <div className="relative mt-36 flex justify-center sm:mt-40 lg:col-start-2 lg:row-start-2 lg:-mt-[calc(var(--hero)*1.02)]">
          {/* the light the screen throws on the table */}
          <div
            aria-hidden="true"
            className="alze-hero-light alze-screen-light pointer-events-none absolute inset-x-[-30%] -bottom-[14%] h-[55%] blur-xl"
          />
          {/* her profile picture replaces the demo's avatar once the page is interactive (landing.css) */}
          <StyleAfterHydration
            className="alze-hero-phone relative w-[min(100%,18.5rem)] sm:w-[19rem]"
            style={{ "--alze-avatar": profileBackground(36) } as CSSProperties}
          >
            <div className="alze-hero-bird absolute end-2 bottom-[calc(100%-0.55rem)] z-10 w-[6.5rem] sm:w-[7.5rem] lg:-end-5 xl:w-[9rem]">
              <DeferredMascot
                pose="waving"
                alt={`הדוכיפת של ${BRAND.name} מנופפת לשלום`}
                sizes="(min-width: 1280px) 144px, (min-width: 640px) 120px, 104px"
                eager
                // mirrored so she faces the headline, not the edge of the page
                className="-scale-x-100"
              />
            </div>
            <PhoneMockup label={`הדגמה: שיחה עם ${BRAND.name} בוואטסאפ`} className="w-full">
              <div data-screen className="flex h-full min-h-0 flex-col">
                <ChatDemo script={HERO_SCRIPT} />
              </div>
            </PhoneMockup>
          </StyleAfterHydration>
        </div>
      </div>
    </section>
  );
}

/** The hero's secondary button for a visitor who is not signed in. */
export function SignInCta() {
  return (
    <Cta href="/login" tone="ghost" className="px-6">
      כניסה
    </Cta>
  );
}
