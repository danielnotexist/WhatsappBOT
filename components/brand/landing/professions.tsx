import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { PROFESSIONS } from "./content";
import { PROFESSION_PAGES } from "./profession-pages";
import { CONTAINER, H2 } from "./ui";

/**
 * "לפי מקצוע": four real questions from four offices — who asks, and what they write (large, in the serif). No cards,
 * no icons, no answers (Daniel, 28.10.2026: only the text that has to be there): the questions are the content. Each
 * profession's name is the link to its own page (/for/<slug>, components/brand/landing/profession-pages.ts), where her
 * answers are.
 */
const slugOf = (profession: string) => PROFESSION_PAGES.find((p) => p.profession === profession)?.slug ?? null;

export function Professions() {
  return (
    <section id="professions" aria-labelledby="professions-title" className="alze-defer scroll-mt-6 py-24 sm:py-32">
      <div className={CONTAINER}>
        <h2 id="professions-title" className={cn(H2, "max-w-[12ch]")}>
          כל משרד שואל אחרת.
        </h2>

        <ul className="mt-12 border-t border-line sm:mt-16">
          {PROFESSIONS.map((p) => {
            const slug = slugOf(p.profession);
            return (
              <li key={p.profession} className="grid gap-3 border-b border-line py-8 sm:py-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-12">
                <h3 className="font-sans text-[1.0625rem] leading-snug font-semibold text-sage lg:pt-3">
                  {slug ? (
                    <Link href={`/for/${slug}` as Route} className="rounded-sm underline decoration-sage/40 underline-offset-4 transition-colors hover:decoration-sage">
                      {p.profession}
                    </Link>
                  ) : (
                    p.profession
                  )}
                </h3>
                <p className="max-w-[24ch] font-heading text-[clamp(1.625rem,1.15rem+1.9vw,2.75rem)] leading-[1.18] font-bold text-balance text-cream">״{p.ask}״</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
