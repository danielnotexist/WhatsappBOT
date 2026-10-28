import type { Metadata } from "next";
import { BySession } from "@/components/auth/by-session";
import { Cta } from "@/components/brand/cta";
import { PRICING, PRICING_FAQ } from "@/components/brand/landing/content";
import { Faq } from "@/components/brand/landing/faq";
import { FinalCta } from "@/components/brand/landing/final-cta";
import { LandingFooter } from "@/components/brand/landing/footer";
import { AccountCta, LandingHeader } from "@/components/brand/landing/header";
import { PlanCompare, PlanConnections } from "@/components/brand/landing/plan-compare";
import { PlanSheet } from "@/components/brand/landing/pricing";
import { CONTAINER, LEDE } from "@/components/brand/landing/ui";
import { PageTransition } from "@/components/brand/page-transition";
import { SupportChat } from "@/components/brand/support-chat";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo/site";
import { cn } from "@/lib/utils";
import "@/components/brand/landing/landing.css";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "מחירים",
  description: `המסלולים של ${BRAND.name}, בסיסי ופרו: מה כל אחד כולל, עם אילו מערכות הוא עובד, ושאלות על התשלום.`,
  image: "/pricing/opengraph-image",
});

/**
 * /pricing - the details the landing's compact price list leaves out (Daniel, 23.10.2026): the two plans on their paper
 * sheet, the full comparison (lib/billing/compare.ts, from the entitlements), every system each plan connects to, the
 * questions about plans, and the one call to action. Static like the landing; the only request-time part is
 * "לאזור האישי" in the header (BySession).
 */
export default function PricingPage() {
  return (
    <PageTransition>
      <div className="alze-night flex min-h-dvh flex-col overflow-x-clip">
        <LandingHeader page="/pricing" account={<BySession signedIn={<AccountCta />} />} />
        <main id="main" className="flex-1">
          <section aria-labelledby="pricing-page-title" className="pt-10 pb-6 sm:pt-16">
            <div className={CONTAINER}>
              <div className="grid gap-5 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-end xl:gap-14">
                <h1 id="pricing-page-title" className="text-[clamp(2.75rem,1.6rem+4.6vw,5.5rem)] leading-[1.02] font-bold tracking-[-0.014em] xl:whitespace-nowrap">
                  מחירים ומסלולים.
                </h1>
                <p className={cn(LEDE, "max-w-[31rem] xl:pb-2")}>
                  {PRICING.trial} ההודעות הראשונות בחינם, בלי כרטיס אשראי. אחר כך בוחרים מסלול בוואטסאפ, בלי התחייבות.
                </p>
              </div>
              <PlanSheet className="mt-10 sm:mt-14" headingLevel={2} />
              <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <p className="max-w-[40rem] text-[0.9375rem] leading-[1.65] text-cream-muted">{PRICING.connectionsNote}</p>
                <Cta href="/start" className="flex-none max-sm:w-full">
                  בואו נתחיל - לוקח דקה
                </Cta>
              </div>
            </div>
          </section>
          <PlanCompare />
          <PlanConnections />
          <Faq id="pricing-faq" title="שאלות על המסלולים." items={PRICING_FAQ} />
          <FinalCta />
        </main>
        <LandingFooter />
        <SupportChat />
      </div>
    </PageTransition>
  );
}
