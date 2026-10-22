import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { Wordmark } from "@/components/brand/wordmark";

const SECTIONS = [
  { href: "#day", label: "איך זה עובד" },
  { href: "#professions", label: "לפי מקצוע" },
  { href: "#pricing", label: "מחירים" },
  { href: "#faq", label: "שאלות" },
] as const;

/** Signed in: the way back to the personal area, in the hero's honey pill (Daniel, 22.10.2026). */
export function AccountCta() {
  return <Cta href="/account">לאזור האישי</Cta>;
}

/**
 * The landing header: wordmark and in-page links (wide screens). Signed out, sign-in lives next to the hero's call to
 * action and the header carries no buttons; signed in, `account` (a request-time hole in app/page.tsx) puts
 * "לאזור האישי" at the inline end. Not sticky — the hero owns the first frame.
 */
export function LandingHeader({ account }: { account?: ReactNode }) {
  return (
    <header className="relative z-10 mx-auto flex h-[4.75rem] w-full max-w-[84rem] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
      <Wordmark />
      <div className="flex items-center gap-4">
        <nav aria-label="בדף הזה" className="max-lg:hidden">
          <ul className="flex items-center gap-1 text-[0.9375rem]">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="rounded-full px-3.5 py-2 text-cream-muted transition-colors hover:text-cream"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {account}
      </div>
    </header>
  );
}
