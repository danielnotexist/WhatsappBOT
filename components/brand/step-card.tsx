"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cardTones, palette, type CardTone } from "@/lib/design/tokens";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const RADIUS = "1.75rem"; // --radius-card; set as a style so motion can correct it while the paper morphs
const SHADOW_ON = "0 40px 90px -40px rgba(0,0,0,0.75), 0 0 0 1px rgba(239,233,220,0.04)";
const SHADOW_OFF = "0 40px 90px -40px rgba(0,0,0,0), 0 0 0 1px rgba(239,233,220,0)";
/** how far each waiting paper peeks out above the one in front of it (px) */
const DECK_GAP = 9;

/** "ready" has no paper: the card dissolves into the stage for the last step. */
function paperColor(tone: CardTone): string {
  return tone === "ready" ? "rgba(15,28,23,0)" : cardTones[tone].bg;
}

/**
 * The signup paper (round plan §3) — only the background. It lives in the persistent signup layout, so between steps it
 * stays the same element: the colour cross-fades (cream → dusty pink → sage → night) and the size morphs (motion
 * `layout`). The step's content sits on top of it in the same grid cell (see components/auth/signup-shell.tsx).
 */
export function StepPaper({ tone, className }: { tone: CardTone; className?: string }) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const dissolved = tone === "ready";
  return (
    <motion.div
      aria-hidden="true"
      data-paper={tone}
      layout={!reduce}
      initial={hydrated && !reduce ? { opacity: 0, y: 18, backgroundColor: paperColor(tone), boxShadow: SHADOW_OFF } : false}
      animate={{ opacity: 1, y: 0, backgroundColor: paperColor(tone), boxShadow: dissolved ? SHADOW_OFF : SHADOW_ON }}
      transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
      style={{ borderRadius: RADIUS }}
      className={cn("pointer-events-none relative max-sm:!rounded-b-none", className)}
    />
  );
}

/**
 * The papers still to come, stacked behind the current one and peeking out above it — the progress you can see.
 * When a step is done its paper slides down into the front position (and the front paper takes its colour).
 */
export function StepDeck({ deck, className }: { deck: CardTone[]; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div aria-hidden="true" layout={!reduce} transition={{ duration: reduce ? 0 : 0.55, ease: EASE }} className={cn("pointer-events-none relative isolate", className)}>
      <AnimatePresence initial={false}>
        {deck.map((tone, i) => {
          const depth = i + 1;
          return (
            <motion.span
              key={tone}
              data-deck={tone}
              className={cn("absolute inset-0 origin-top", tone === "ready" && "ring-1 ring-cream/12 ring-inset")}
              style={{ borderRadius: RADIUS, zIndex: -depth, backgroundColor: tone === "ready" ? palette.night2 : cardTones[tone].bg }}
              initial={{ y: -(depth + 1) * DECK_GAP, scaleX: 1 - (depth + 1) * 0.045, opacity: 0 }}
              animate={{ y: -depth * DECK_GAP, scaleX: 1 - depth * 0.045, opacity: 1 - (depth - 1) * 0.12 }}
              exit={{ y: 0, scaleX: 1, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
            />
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A self-contained card: paper + content in one box (kept for simple uses and tests; the signup shell composes
 * StepPaper/StepDeck with the step's own aside/body instead, so the question can leave the paper on wide screens).
 */
export function StepCard({ tone, children, className }: { tone: CardTone; children: ReactNode; className?: string }) {
  const t = cardTones[tone];
  return (
    <section
      data-tone={tone}
      style={{ backgroundColor: paperColor(tone), color: t.fg }}
      className={cn("relative flex w-full flex-col rounded-card px-6 pt-8 pb-7 sm:px-10 sm:pt-11 sm:pb-9", tone !== "ready" && "shadow-stage", t.light && "surface-light", className)}
    >
      {children}
    </section>
  );
}

/** "שלב 2 מתוך 4" — the signup is a real sequence, so the marker carries information (the deck shows the same). */
export function StepProgress({ step, total = 4, light = true }: { step: number; total?: number; light?: boolean }) {
  return (
    <p className={cn("flex items-center gap-2 text-[0.875rem]", light ? "text-ink-muted" : "text-cream-muted")}>
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("size-1.5 rounded-full", light ? (i < step ? "bg-ink" : "bg-ink/20") : i < step ? "bg-honey" : "bg-cream/25")} />
        ))}
      </span>
      שלב {step} מתוך {total}
    </p>
  );
}
