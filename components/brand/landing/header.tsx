import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { HEADER_BAR } from "@/components/brand/frame";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

/**
 * The header's links (Daniel, 28.10.2026: three, no more): "איך זה עובד" (the landing's #day), "מחירים" (its own page,
 * /pricing) and "כניסה" (NavSignIn, for a visitor who is not signed in).
 */
const SECTIONS = [
  { href: "#day", label: "איך זה עובד" },
  { href: "/pricing", label: "מחירים" },
] as const;

const LINK = "rounded-full px-3.5 py-2 text-cream-muted transition-colors hover:text-cream";

/**
 * "כניסה", the last of the header's links. Pages pass it through a request-time hole (BySession) so a signed-in
 * visitor, who gets "לאזור האישי" at the inline end, does not see it.
 */
export function NavSignIn() {
  return (
    <li>
      <Link href="/login" className={LINK}>
        כניסה
      </Link>
    </li>
  );
}

/** Signed in: the way back to the personal area, in the hero's honey pill (Daniel, 22.10.2026). */
export function AccountCta() {
  return <Cta href="/account">לאזור האישי</Cta>;
}

/**
 * The landing header: wordmark and the three links (wide screens; on phones the hero carries "כניסה"). Signed out,
 * `signIn` ends the links with "כניסה"; signed in, `account` (a request-time hole in app/page.tsx) puts "לאזור האישי"
 * at the inline end instead. Not sticky - the hero owns the first frame.
 * On another page (/pricing, a profession page under /for) `page` is its path: the in-page links lead back to the
 * landing's sections ("/#day"), and the link to this page is marked current.
 */
export function LandingHeader({ account, signIn = <NavSignIn />, page }: { account?: ReactNode; signIn?: ReactNode; page?: "/pricing" | "/for" }) {
  return (
    <header className={cn(HEADER_BAR, "relative z-10 gap-6")}>
      <Wordmark />
      <div className="flex items-center gap-4">
        <nav aria-label="ניווט באתר" className="max-lg:hidden">
          <ul className="flex items-center gap-1 text-[0.9375rem]">
            {SECTIONS.map((s) => {
              const current = s.href === page;
              const className = current ? "rounded-full px-3.5 py-2 text-cream" : LINK;
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
            {signIn}
          </ul>
        </nav>
        {account}
      </div>
    </header>
  );
}
