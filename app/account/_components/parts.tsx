import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The personal area's building blocks ("לילה ירוק"): a titled section, a quiet row on the stage, a square tile, a chevron. */

/**
 * A titled area. `action`: one control beside the title on wide screens (below it on phones) — e.g. the agents' upgrade.
 * The h2 is the target the area navigation moves focus to (./area-nav.tsx), so it carries no focus ring of its own.
 */
export function Section({
  id,
  title,
  description,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={cn("scroll-mt-24 lg:scroll-mt-6", className)}>
      <div className={cn(action && "flex flex-wrap items-end justify-between gap-x-8 gap-y-4")}>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-[1.625rem] leading-tight font-bold focus:outline-none">
            {title}
          </h2>
          {description ? <p className="mt-1.5 max-w-[36rem] text-[0.9375rem] leading-relaxed text-cream-muted">{description}</p> : null}
        </div>
        {action ? <div className="flex-none">{action}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** `footer`: a full-width line under the row, aligned with the text (the services of a connected account). */
export function Row({ mark, title, children, action, footer }: { mark: ReactNode; title: ReactNode; children?: ReactNode; action: ReactNode; footer?: ReactNode }) {
  const line = (
    <>
      {mark}
      <div className="min-w-0 flex-1">
        <p className="text-[1.0625rem] leading-snug font-semibold">{title}</p>
        {children}
      </div>
      <div className="flex-none">{action}</div>
    </>
  );
  if (!footer) return <li className="flex items-center gap-4 py-5">{line}</li>;
  return (
    <li className="py-5">
      <div className="flex items-center gap-4">{line}</div>
      <div className="mt-4 ps-16">{footer}</div>
    </li>
  );
}

export function Tile({ children, muted = false, className }: { children: ReactNode; muted?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid size-12 flex-none place-items-center rounded-2xl", muted ? "bg-cream/8" : "bg-cream", className)}>
      {children}
    </span>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none fill-none stroke-current stroke-2 transition-transform duration-200 group-open:rotate-180">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
