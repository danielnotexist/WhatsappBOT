import { Wordmark } from "@/components/brand/wordmark";

const SECTIONS = [
  { href: "#day", label: "איך זה עובד" },
  { href: "#professions", label: "לפי מקצוע" },
  { href: "#pricing", label: "מחירים" },
  { href: "#faq", label: "שאלות" },
] as const;

/**
 * The landing header: wordmark and in-page links (wide screens). Sign-in lives next to the hero's call to action, so the
 * header carries no buttons. Not sticky — the hero owns the first frame.
 */
export function LandingHeader() {
  return (
    <header className="relative z-10 mx-auto flex h-[4.75rem] w-full max-w-[84rem] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
      <Wordmark />
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
    </header>
  );
}
