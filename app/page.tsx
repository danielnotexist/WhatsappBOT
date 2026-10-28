import type { Metadata } from "next";
import { BySession } from "@/components/auth/by-session";
import { Connectors } from "@/components/brand/landing/connectors";
import { DaySection } from "@/components/brand/landing/day-scenes";
import { Faq } from "@/components/brand/landing/faq";
import { FinalCta } from "@/components/brand/landing/final-cta";
import { LandingFooter } from "@/components/brand/landing/footer";
import { AccountCta, LandingHeader, NavSignIn } from "@/components/brand/landing/header";
import { Hero, SignInCta } from "@/components/brand/landing/hero";
import { Pricing } from "@/components/brand/landing/pricing";
import { Professions } from "@/components/brand/landing/professions";
import { SmoothScroll } from "@/components/brand/landing/smooth-scroll";
import { PageTransition } from "@/components/brand/page-transition";
import { SupportChat } from "@/components/brand/support-chat";
import { Trust } from "@/components/brand/landing/trust";
import { BRAND } from "@/lib/brand";
import { jsonLdString, organizationJsonLd, softwareApplicationJsonLd } from "@/lib/seo/json-ld";
import { HOME_TITLE, SITE_IMAGE, pageMetadata } from "@/lib/seo/site";
import "@/components/brand/landing/landing.css";

export const metadata: Metadata = pageMetadata({ path: "/", title: HOME_TITLE, absoluteTitle: true, description: BRAND.description, image: SITE_IMAGE });

/**
 * The landing page (round plan §2, "לילה ירוק"): hero with the live chat demo → one working day (the brand film in a
 * framed card) → by profession → trust → the systems she works with → pricing → FAQ → end card → footer. Only the text
 * that has to be there (Daniel, 28.10.2026): headings, the questions, short labels; the details live on their own pages.
 * Static (prerendered); the client islands are the chat demo, the day scene's switch (pinned version lazy-loaded on
 * large screens), the connection tiles' tooltips, the hoopoe loop and Lenis. The only request-time parts are small holes that read the session cookie: "לאזור האישי" / "כניסה" in the header and the hero's "כניסה" (BySession).
 * The support chat ("שאלות ותמיכה") floats at the bottom of the inline-start side.
 */
export default function HomePage() {
  return (
    <PageTransition>
      <div className="alze-night flex min-h-dvh flex-col overflow-x-clip">
        {/* structured data for search engines: who we are and what the plans cost (lib/seo/json-ld.ts) */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([organizationJsonLd(), softwareApplicationJsonLd()]) }} />
        <SmoothScroll />
        <LandingHeader account={<BySession signedIn={<AccountCta />} />} signIn={<BySession signedIn={null} signedOut={<NavSignIn />} />} />
        <main id="main" className="flex-1">
          <Hero signIn={<BySession signedIn={null} signedOut={<SignInCta />} />} />
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
    </PageTransition>
  );
}
