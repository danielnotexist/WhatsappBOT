import { cn } from "@/lib/utils";
import { FAQ } from "./content";
import { CONTAINER, H2 } from "./ui";

/**
 * FAQ with native <details>: keyboard and screen-reader support for free, no JS. The landing's questions by default;
 * /pricing passes its own (the plans).
 */
export function Faq({
  items = FAQ,
  title = "שאלות לפני שמתחילים.",
  id = "faq",
}: {
  items?: readonly { q: string; a: string }[];
  title?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="alze-defer scroll-mt-6 border-t border-line py-28 sm:py-40">
      <div className={cn(CONTAINER, "grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20")}>
        <h2 id={`${id}-title`} className={cn(H2, "max-w-[11ch] lg:sticky lg:top-12 lg:self-start")}>
          {title}
        </h2>
        <div className="alze-faq border-t border-line">
          {items.map((f) => (
            <details key={f.q} className="border-b border-line">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm py-6 font-heading text-[clamp(1.25rem,1.1rem+0.6vw,1.625rem)] leading-snug font-bold">
                {f.q}
                <span data-plus aria-hidden="true" className="relative mt-[0.35em] size-4 flex-none text-honey">
                  <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current" />
                  <span className="absolute inset-x-0 inset-y-0 mx-auto w-0.5 rounded-full bg-current" />
                </span>
              </summary>
              <p className="max-w-[40rem] pb-8 text-[1.0625rem] leading-[1.7] text-cream-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
