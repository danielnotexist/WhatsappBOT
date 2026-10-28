import type { Metadata } from "next";
import Link from "next/link";
import { SupportChat } from "@/components/brand/support-chat";
import { HEADER_BAR } from "@/components/brand/frame";
import { PageTransition } from "@/components/brand/page-transition";
import { Wordmark } from "@/components/brand/wordmark";
import { LEGAL_INDEXED, NOINDEX } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

// Drafts until a lawyer signs off: kept out of search engines (round plan §3) until LEGAL_INDEXED (lib/seo/site.ts).
export const metadata: Metadata = LEGAL_INDEXED ? {} : { robots: NOINDEX };

const DOCS = [
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/privacy", label: "פרטיות" },
  { href: "/accessibility", label: "נגישות" },
] as const;

function DocsNav({ className }: { className?: string }) {
  return (
    <nav aria-label="מסמכים" className={cn("flex gap-1 text-[0.9375rem] text-cream-muted sm:gap-3", className)}>
      {DOCS.map((d) => (
        <Link key={d.href} href={d.href} className="rounded-md px-1.5 py-1 transition-colors hover:text-cream hover:underline hover:underline-offset-4">
          {d.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The legal drafts: a reading page on the stage — one column at a comfortable measure (~68 characters), serif headings
 * from the markdown renderer, and a quiet draft note instead of a loud banner.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="stage flex min-h-dvh flex-col">
        <header className={HEADER_BAR}>
          <Wordmark />
          {/* phones: the wordmark keeps its full size (it never moves between pages), so the documents move into the page */}
          <DocsNav className="max-sm:hidden" />
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-24 sm:px-8">
          <DocsNav className="-mt-4 mb-4 -ms-1.5 sm:hidden" />
          <div role="note" className="flex gap-3 rounded-2xl border border-honey/35 bg-honey/[0.07] px-4 py-3 text-[0.9375rem] leading-relaxed text-cream sm:px-5">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-honey stroke-2">
              <path d="M12 3 2.5 20h19z" strokeLinejoin="round" />
              <path d="M12 10v4.5M12 17.2v.3" strokeLinecap="round" />
            </svg>
            <p>
              <b className="font-semibold text-honey">טיוטה.</b> המסמך עדיין בבדיקה משפטית ואינו בתוקף. הנוסח הסופי יפורסם כאן לפני ההשקה.
            </p>
          </div>
          <article className="mt-8 max-w-[68ch] text-[1.0625rem] break-words leading-[1.8] [&_h1]:leading-[1.12] [&_h2]:leading-[1.2] [&_h3]:leading-[1.3] [&_li]:ps-1">
            {children}
          </article>
        </main>
        <SupportChat />
      </div>
    </PageTransition>
  );
}
