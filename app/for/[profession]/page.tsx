import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BySession } from "@/components/auth/by-session";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { FinalCta } from "@/components/brand/landing/final-cta";
import { LandingFooter } from "@/components/brand/landing/footer";
import { AccountCta, LandingHeader } from "@/components/brand/landing/header";
import { PROFESSION_PAGES, professionPage } from "@/components/brand/landing/profession-pages";
import { Trust } from "@/components/brand/landing/trust";
import { CONTAINER, H2, LEDE } from "@/components/brand/landing/ui";
import { SupportChat } from "@/components/brand/support-chat";
import { CrestMark } from "@/components/brand/wordmark";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo/site";
import { cn } from "@/lib/utils";
import "@/components/brand/landing/landing.css";

export function generateStaticParams(): { profession: string }[] {
  return PROFESSION_PAGES.map((p) => ({ profession: p.slug }));
}

export async function generateMetadata(props: PageProps<"/for/[profession]">): Promise<Metadata> {
  const p = professionPage((await props.params).profession);
  if (!p) return {};
  return pageMetadata({ path: `/for/${p.slug}`, title: p.title, description: p.description, image: `/for/${p.slug}/opengraph-image`, imageAlt: `${BRAND.name} - ${p.title}` });
}

/**
 * /for/<profession> — "לפי מקצוע" as pages of their own (round plan "אנליטיקה ו-SEO": found on Google): the headline
 * for that office, three of its everyday questions with her answers (the landing's transcript style), what she does
 * there, trust, and the one call to action. Static (prerendered for each profession); the only request-time part is
 * "לאזור האישי" in the header (BySession). Copy: components/brand/landing/profession-pages.ts.
 */
export default async function ProfessionPage(props: PageProps<"/for/[profession]">) {
  const p = professionPage((await props.params).profession);
  if (!p) notFound();
  const others = PROFESSION_PAGES.filter((o) => o.slug !== p.slug);

  return (
    <div className="alze-night flex min-h-dvh flex-col overflow-x-clip">
      <LandingHeader page="/for" account={<BySession signedIn={<AccountCta />} />} />
      <main id="main" className="flex-1">
        <section aria-labelledby="profession-title" className="pt-10 pb-20 sm:pt-16 sm:pb-28">
          <div className={CONTAINER}>
            <Handwritten tone="sage">לפי מקצוע: {p.profession}</Handwritten>
            <h1 id="profession-title" className="mt-4 max-w-[18ch] text-[clamp(2.5rem,1.5rem+4.2vw,5rem)] leading-[1.04] font-bold tracking-[-0.014em] text-balance">
              {p.headline}
            </h1>
            <p className={cn(LEDE, "mt-6 max-w-[34rem]")}>{p.lede}</p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Cta href="/start" className="max-sm:w-full sm:min-w-64">
                בואו נתחיל - לוקח דקה
              </Cta>
              <Link href="/pricing" className="text-center text-[1rem] text-cream-muted underline underline-offset-4 transition-colors hover:text-cream">
                המסלולים והמחירים
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="exchanges-title" className="py-20 sm:py-28">
          <div className={CONTAINER}>
            <h2 id="exchanges-title" className={cn(H2, "max-w-[16ch]")}>
              שלוש שאלות מהיום-יום.
            </h2>
            <p className={cn(LEDE, "mt-6 max-w-[30rem]")}>כותבים לה בוואטסאפ כמו לעוזרת במשרד. כשמשהו אמור לצאת, היא שואלת קודם.</p>
            <ul className="mt-14 border-t border-line sm:mt-16">
              {p.exchanges.map((e) => (
                <li key={e.ask} className="border-b border-line py-10 sm:py-12">
                  <p className="max-w-[28ch] font-heading text-[clamp(1.5rem,1.1rem+1.6vw,2.5rem)] leading-[1.2] font-bold text-balance text-cream">״{e.ask}״</p>
                  <p className="mt-6 flex max-w-[44rem] gap-3.5 text-[1.125rem] leading-[1.65] text-cream-muted">
                    <CrestMark className="mt-1 size-5 flex-none text-honey" />
                    <span>
                      <span className="sr-only">{BRAND.name} עונה: </span>
                      {e.answer}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="tasks-title" className="py-20 sm:py-28">
          <div className={cn(CONTAINER, "grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16")}>
            <h2 id="tasks-title" className={cn(H2, "max-w-[14ch]")}>
              מה היא עושה במשרד.
            </h2>
            <ol className="grid gap-6">
              {p.tasks.map((t, i) => (
                <li key={t} className="flex gap-5 border-b border-line pb-6 text-[1.125rem] leading-[1.6] text-cream">
                  <span className="w-6 flex-none text-honey tabular" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Trust />

        <nav aria-labelledby="others-title" className="py-16">
          <div className={CONTAINER}>
            <h2 id="others-title" className="text-[1.25rem] font-bold">
              גם למשרדים אחרים
            </h2>
            <ul className="mt-5 flex flex-wrap gap-3">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/for/${o.slug}` as Route} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[1rem] text-cream transition-colors hover:border-honey/60">
                    {o.profession}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <FinalCta />
      </main>
      <LandingFooter />
      <SupportChat />
    </div>
  );
}
