"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cardTones, type CardTone } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/**
 * The one signup card (round plan §3). It lives in the persistent signup layout, so moving between steps keeps
 * the same element: the paper colour cross-fades (cream → dusty pink → sage → night) and the size morphs (motion
 * `layout`). On phones it fills the screen under the header. Light tones flip the semantic tokens (`surface-light`).
 */
export function StepCard({
  tone,
  children,
  className,
  footer,
}: {
  tone: CardTone;
  children: ReactNode;
  className?: string;
  /** below the content, inside the card (progress, small print) */
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const t = cardTones[tone];
  return (
    <motion.section
      layout={!reduce}
      initial={false}
      animate={{ backgroundColor: t.bg, color: t.fg }}
      transition={{ duration: reduce ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
      data-tone={tone}
      className={cn(
        "relative flex w-full flex-col rounded-card px-6 pt-8 pb-7 shadow-stage sm:max-w-[31rem] sm:px-10 sm:pt-11 sm:pb-9",
        "max-sm:min-h-[calc(100dvh-4.75rem)] max-sm:rounded-b-none",
        t.light && "surface-light",
        className,
      )}
    >
      <div className="flex flex-1 flex-col">{children}</div>
      {footer ? <div className="mt-8">{footer}</div> : null}
    </motion.section>
  );
}

/** "שלב 2 מתוך 4" as four short bars — the signup is a real sequence, so the marker carries information. */
export function StepProgress({ step, total = 4, light = true }: { step: number; total?: number; light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ol className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cn(
              "h-1 w-7 rounded-full",
              light ? (i < step ? "bg-ink" : "bg-ink/20") : i < step ? "bg-honey" : "bg-cream/20",
            )}
          />
        ))}
      </ol>
      <p className={cn("text-[0.875rem]", light ? "text-ink-muted" : "text-cream-muted")}>
        שלב {step} מתוך {total}
      </p>
    </div>
  );
}
