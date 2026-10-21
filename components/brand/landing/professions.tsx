import { CrestMark } from "@/components/brand/wordmark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { PROFESSIONS } from "./content";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * "לפי מקצוע": four real one-line exchanges, set as a transcript — who asks, what they write (large, in the serif),
 * what she answers (marked with her crest). No cards, no icons: the words are the content.
 */
export function Professions() {
  return (
    <section
      id="professions"
      aria-labelledby="professions-title"
      className="alze-defer scroll-mt-6 py-28 sm:py-40"
    >
      <div className={CONTAINER}>
        <div>
          <h2 id="professions-title" className={cn(H2, "max-w-[12ch]")}>
            כל משרד שואל אחרת.
          </h2>
          <p className={cn(LEDE, "mt-6 max-w-[30rem]")}>
            ארבע שאלות מהיום-יום של משרד קטן, והתשובה שחוזרת בוואטסאפ.
          </p>
        </div>

        <ul className="mt-16 border-t border-line sm:mt-20">
          {PROFESSIONS.map((p) => (
            <li
              key={p.profession}
              className="grid gap-4 border-b border-line py-10 sm:py-14 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-12"
            >
              <h3 className="font-sans text-[1.0625rem] leading-snug font-semibold text-sage lg:pt-3">
                {p.profession}
              </h3>
              <div>
                <p className="max-w-[24ch] font-heading text-[clamp(1.625rem,1.15rem+1.9vw,2.75rem)] leading-[1.18] font-bold text-balance text-cream">
                  ״{p.ask}״
                </p>
                <p className="mt-6 flex max-w-[44rem] gap-3.5 text-[1.125rem] leading-[1.65] text-cream-muted">
                  <CrestMark className="mt-1 size-5 flex-none text-honey" />
                  <span>
                    <span className="sr-only">{BRAND.name} עונה: </span>
                    {p.answer}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
