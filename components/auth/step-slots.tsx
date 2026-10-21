"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Mascot, type MascotPoseName } from "@/components/brand/mascot";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { ENTRANCE_DURATION, ENTRANCE_EASE, ENTRANCE_RISE, entranceGuard } from "./entrance";

/**
 * Enter softly on client-side navigation only — the server HTML is visible at once, with or without JS. Once per
 * screen (./entrance.ts): a Suspense fallback that gives way to the streamed step does not start the entrance over,
 * and a step the router shows again after another one (back/forward) enters like any step change.
 */
function useEntrance(slot: "aside" | "body", delay: number) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const pathname = usePathname() ?? "";
  const on = hydrated && !reduce;
  // decided once, when the slot mounts (motion reads `initial` only then)
  const [{ screen, plan }] = useState(() => ({ screen: pathname, plan: entranceGuard.plan(slot, pathname, delay, performance.now(), on) }));
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(false);

  useLayoutEffect(() => {
    const { visit, replay } = entranceGuard.enter(slot, screen, plan, performance.now(), shown.current);
    shown.current = true;
    const el = ref.current;
    if (replay && on && typeof el?.animate === "function") {
      // the same entrance as a fresh step, applied before the first paint (Web Animations start synchronously)
      el.animate([{ opacity: 0, transform: `translateY(${ENTRANCE_RISE}px)` }, { opacity: 1, transform: "none" }], {
        duration: ENTRANCE_DURATION * 1000,
        delay: delay * 1000,
        easing: `cubic-bezier(${ENTRANCE_EASE.join(", ")})`,
        fill: "backwards",
      });
    }
    return () => entranceGuard.leave(visit);
  }, [slot, screen, plan, delay, on]);

  return {
    ref,
    initial: plan.delay === null ? false : { opacity: 0, y: ENTRANCE_RISE },
    animate: { opacity: 1, y: 0 },
    transition: { duration: plan.delay === null ? 0 : ENTRANCE_DURATION, delay: plan.delay ?? 0, ease: ENTRANCE_EASE },
  } as const;
}

/**
 * The question side of a step: handwritten line, headline, a line of context. Inside the card on phones and tablets;
 * on wide screens it leaves the paper for the dark stage, so the stage tokens come back (cream type, honey focus).
 */
export function StepAside({ children, className }: { children: ReactNode; className?: string }) {
  const entrance = useEntrance("aside", 0.1);
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
  const entrance = useEntrance("body", 0.16);
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
