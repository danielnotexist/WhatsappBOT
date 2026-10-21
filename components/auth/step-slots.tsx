"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Mascot, type MascotPoseName } from "@/components/brand/mascot";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Enter softly on client-side navigation only — the server HTML is visible at once, with or without JS. */
function useEntrance(delay: number) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const on = hydrated && !reduce;
  return {
    initial: on ? { opacity: 0, y: 10 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { duration: on ? 0.42 : 0, delay: on ? delay : 0, ease: EASE },
  } as const;
}

/**
 * The question side of a step: handwritten line, headline, a line of context. Inside the card on phones and tablets;
 * on wide screens it leaves the paper for the dark stage, so the stage tokens come back (cream type, honey focus).
 */
export function StepAside({ children, className }: { children: ReactNode; className?: string }) {
  const entrance = useEntrance(0.1);
  return (
    <motion.div
      data-slot="step-aside"
      {...entrance}
      className={cn(
        "relative z-10 col-start-1 row-start-1 flex min-w-0 flex-col px-6 pt-9 sm:px-10 sm:pt-11",
        "lg:col-start-1 lg:row-start-1 lg:self-center lg:px-0 lg:pt-0 lg:pb-4",
        "lg:text-cream lg:[--border:var(--alze-line)] lg:[--foreground:var(--alze-cream)] lg:[--muted-foreground:var(--alze-cream-muted)] lg:[--ring:var(--alze-honey)] lg:[color-scheme:dark]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/**
 * The hoopoe of a step (a different pose per step). Phones/tablets: in the card's bottom row, next to the progress line.
 * Wide screens: standing on the paper's top edge, in front of the papers still to come. Decorative.
 */
export function StepMascot({ pose }: { pose: MascotPoseName }) {
  return (
    <Mascot pose={pose} eager sizes="(min-width: 1024px) 144px, (min-width: 640px) 96px, 84px" className="w-[5.25rem] flex-none sm:w-24 lg:absolute lg:end-9 lg:bottom-full lg:-mb-1.5 lg:w-36" />
  );
}

/** The answer side of a step: the fields and the actions. Always on the paper. */
export function StepBody({ children, className }: { children: ReactNode; className?: string }) {
  const entrance = useEntrance(0.16);
  return (
    <motion.div
      data-slot="step-body"
      {...entrance}
      className={cn(
        "relative z-10 col-start-1 row-start-2 flex min-w-0 flex-col px-6 pt-8 pb-7 sm:px-10 sm:pb-9",
        "lg:col-start-2 lg:row-start-1 lg:px-10 lg:pt-10 lg:pb-9",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
