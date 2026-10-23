import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The personal area's building blocks ("לילה ירוק"): a titled section, a quiet row on the stage, a square tile, a chevron. */

export function Section({ id, title, description, className, children }: { id: string; title: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={cn("scroll-mt-6", className)}>
      <h2 id={`${id}-title`} className="font-heading text-[1.625rem] leading-tight font-bold">
        {title}
      </h2>
      {description ? <p className="mt-1.5 max-w-[36rem] text-[0.9375rem] leading-relaxed text-cream-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
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

export function Tile({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid size-12 flex-none place-items-center rounded-2xl", muted ? "bg-cream/8" : "bg-cream")}>
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
