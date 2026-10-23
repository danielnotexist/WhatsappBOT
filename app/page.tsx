import type { Metadata } from "next";
import { BySession } from "@/components/auth/by-session";
import { Connectors } from "@/components/brand/landing/connectors";
import { DaySection } from "@/components/brand/landing/day-scenes";
import { Faq } from "@/components/brand/landing/faq";
import { FinalCta } from "@/components/brand/landing/final-cta";
import { LandingFooter } from "@/components/brand/landing/footer";
import { AccountCta, LandingHeader } from "@/components/brand/landing/header";
import { Hero, SignInCta } from "@/components/brand/landing/hero";
import { Meet } from "@/components/brand/landing/meet";
import { Pricing } from "@/components/brand/landing/pricing";
import { Professions } from "@/components/brand/landing/professions";
import { SmoothScroll } from "@/components/brand/landing/smooth-scroll";
import { SupportChat } from "@/components/brand/support-chat";
import { Trust } from "@/components/brand/landing/trust";
import { BRAND } from "@/lib/brand";
import "@/components/brand/landing/landing.css";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} - ${BRAND.tagline}` },
  description: BRAND.description,
  openGraph: { title: `${BRAND.name} - ${BRAND.tagline}`, description: BRAND.description },
};

/**
 * The landing page (round plan §2, "לילה ירוק"): hero with the live chat demo (and the "עובדת עם" strip) → "נעים להכיר"
 * (the hoopoe loop in a framed card) → one working day in a pinned phone → by profession → trust → the systems she works with → pricing → FAQ → end card → footer.
 * Static (prerendered); the client islands are the chat demo, the day scene's switch (pinned version lazy-loaded on
 * large screens), the connection tiles' tooltips, the hoopoe loop and Lenis. The only request-time parts are two small holes that read the session cookie: "לאזור האישי" in the header and the hero's "כניסה" (BySession).
 * The support chat ("שאלות ותמיכה") floats at the bottom of the inline-start side.
 */
export default function HomePage() {
  return (
    <div className="alze-night flex min-h-dvh flex-col overflow-x-clip">
      <SmoothScroll />
      <LandingHeader account={<BySession signedIn={<AccountCta />} />} />
      <main id="main" className="flex-1">
        <Hero signIn={<BySession signedIn={null} signedOut={<SignInCta />} />} />
        <Meet />
        <DaySection />
        <Professions />
        <Trust />
        <Connectors />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
      <SupportChat />
    </div>
  );
}
