import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { HEADER_BAR } from "@/components/brand/frame";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

/** In-page sections of the landing (`#…`), and "מחירים" - its own page since the compact price list (/pricing). */
const SECTIONS = [
  { href: "#day", label: "איך זה עובד" },
  { href: "#professions", label: "לפי מקצוע" },
  { href: "#connectors", label: "חיבורים" },
  { href: "/pricing", label: "מחירים" },
  { href: "#faq", label: "שאלות" },
] as const;

/** Signed in: the way back to the personal area, in the hero's honey pill (Daniel, 22.10.2026). */
export function AccountCta() {
  return <Cta href="/account">לאזור האישי</Cta>;
}

/**
 * The landing header: wordmark and the section links (wide screens). Signed out, sign-in lives next to the hero's call
 * to action and the header carries no buttons; signed in, `account` (a request-time hole in app/page.tsx) puts
 * "לאזור האישי" at the inline end. Not sticky - the hero owns the first frame.
 * On another page (/pricing, a profession page under /for) `page` is its path: the in-page links lead back to the
 * landing's sections ("/#day"), and the link to this page is marked current.
 */
export function LandingHeader({ account, page }: { account?: ReactNode; page?: "/pricing" | "/for" }) {
  return (
    <header className={cn(HEADER_BAR, "relative z-10 gap-6")}>
      <Wordmark />
      <div className="flex items-center gap-4">
        <nav aria-label={page ? "ניווט באתר" : "בדף הזה"} className="max-lg:hidden">
          <ul className="flex items-center gap-1 text-[0.9375rem]">
            {SECTIONS.map((s) => {
              // a profession page (/for/<slug>) belongs to the landing's "לפי מקצוע"
              const current = s.href === page || (page === "/for" && s.href === "#professions");
              const className = current ? "rounded-full px-3.5 py-2 text-cream" : "rounded-full px-3.5 py-2 text-cream-muted transition-colors hover:text-cream";
              return (
                <li key={s.href}>
                  {/* another page: a client navigation, so the page transition runs; a section of this page: a plain anchor (smooth scroll) */}
                  {s.href.startsWith("#") ? (
                    <a href={page ? `/${s.href}` : s.href} aria-current={current ? "page" : undefined} className={className}>
                      {s.label}
                    </a>
                  ) : (
                    <Link href={s.href as Route} aria-current={current ? "page" : undefined} className={className}>
                      {s.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        {account}
      </div>
    </header>
  );
}
