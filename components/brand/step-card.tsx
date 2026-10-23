"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { cardTones, palette, type CardTone } from "@/lib/design/tokens";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_CSS = `cubic-bezier(${EASE.join(", ")})`;
/** seconds — the paper's morph (colour, size) and its entrance */
const MORPH = 0.55;
/** how far the paper rises while it fades in when the shell appears (px) */
const PAPER_RISE = 18;
/**
 * A paper hidden for longer than this (ms) was off screen (the router's <Activity>: another page, then back/forward);
 * shorter is React re-running its effects in the same commit (StrictMode).
 */
const RESHOW_GAP_MS = 32;
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
 *  - Reduced motion: no morph; the colour and shadow are plain style values that React writes in the step's own commit
 *    (animated by motion, even with duration 0, they would land a frame later — the new step drawn on the old paper).
 *    `transition-none`: the paper never uses CSS transitions (motion drives it), whatever a global rule sets — a
 *    transition's first painted frame is still the old colour.
 *  - Shown again after the shell was hidden (a page outside the signup, then back/forward): the paper enters the way it
 *    does when the shell first appears, together with the step's own entrance.
 */
export function StepPaper({ tone, className, ref }: { tone: CardTone; className?: string; ref?: RefObject<HTMLDivElement | null> }) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const own = useRef<HTMLDivElement>(null);
  const paper = ref ?? own;
  const dissolved = tone === "ready";
  const color = paperColor(tone);
  const shadow = dissolved ? SHADOW_OFF : SHADOW_ON;
  const animated = hydrated && !reduce;

  const hiddenAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = paper.current;
    const hidden = hiddenAt.current;
    if (animated && hidden !== null && performance.now() - hidden > RESHOW_GAP_MS && typeof el?.animate === "function") {
      // the shell's own entrance (`initial` below), applied before the first paint (Web Animations start synchronously)
      el.animate([{ opacity: 0, transform: `translateY(${PAPER_RISE}px)` }, { opacity: 1, transform: "none" }], {
        duration: MORPH * 1000,
        easing: EASE_CSS,
        fill: "backwards",
      });
    }
    return () => {
      hiddenAt.current = performance.now();
    };
  }, [paper, animated]);

  return (
    <motion.div
      ref={paper}
      aria-hidden="true"
      data-paper={tone}
      layout={!reduce}
      initial={animated ? { opacity: 0, y: PAPER_RISE, backgroundColor: color, boxShadow: SHADOW_OFF } : false}
      animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, backgroundColor: color, boxShadow: shadow }}
      transition={{ duration: reduce ? 0 : MORPH, ease: EASE }}
      style={reduce ? { borderRadius: RADIUS, backgroundColor: color, boxShadow: shadow } : { borderRadius: RADIUS }}
      className={cn("pointer-events-none relative transition-none max-sm:!rounded-b-none", className)}
    />
  );
}

/**
 * The papers still to come, stacked behind the current one and peeking out above it — the progress you can see.
 * When a step is done its paper slides down into the front position (and the front paper takes its colour).
 */
export function StepDeck({ deck, className, ref }: { deck: CardTone[]; className?: string; ref?: RefObject<HTMLDivElement | null> }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      data-deck-stack=""
      layout={!reduce}
      transition={{ duration: reduce ? 0 : MORPH, ease: EASE }}
      className={cn("pointer-events-none relative isolate", className)}
    >
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

interface GridBox {
  w: number;
  h: number;
  vw: number;
  vh: number;
}

function gridBox(el: HTMLElement): GridBox {
  return { w: el.offsetWidth, h: el.offsetHeight, vw: window.innerWidth, vh: window.innerHeight };
}

/**
 * The papers follow a late change of the step's size. Motion's `layout` measures only when the paper itself renders —
 * a step change — so a size change without one (a part of the step streamed in after it, a notice that appears) would
 * make the paper, and the deck behind it, jump. This watches the grid that holds them: measured after every commit of
 * the shell (motion morphs those), observed in between. When only the height moved (same width, same window), each
 * paper goes from the height on screen to its new one on the morph's own duration and ease — a Web Animation started
 * in the ResizeObserver callback, so before that frame is painted. A bottom margin takes up the difference, so the
 * grid's rows never see the animated height. Nothing under reduced motion or before hydration.
 */
export function useLateResizeMorph(grid: RefObject<HTMLElement | null>, ...papers: RefObject<HTMLElement | null>[]) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const on = hydrated && !reduce;
  const targets = useRef(papers);
  const measured = useRef<{ grid: GridBox; heights: number[] } | null>(null);
  const running = useRef(new Map<HTMLElement, Animation>());

  // every commit of the shell: whatever changed with it is motion's (a step change); a late morph in flight stops here
  useLayoutEffect(() => {
    targets.current = papers;
    for (const animation of running.current.values()) animation.cancel();
    running.current.clear();
    const el = grid.current;
    measured.current = el ? { grid: gridBox(el), heights: targets.current.map((ref) => ref.current?.offsetHeight ?? 0) } : null;
  });

  useEffect(() => {
    const el = grid.current;
    if (!el || !on || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const before = measured.current;
      const now = gridBox(el);
      const heights = targets.current.map((ref, i) => {
        const paper = ref.current;
        if (!paper) return 0;
        const inFlight = running.current.get(paper);
        // the height on screen right now: a late morph still running, or the paper's last measured height
        const from = inFlight ? parseFloat(getComputedStyle(paper).height) : (before?.heights[i] ?? paper.offsetHeight);
        inFlight?.cancel();
        running.current.delete(paper);
        const to = paper.offsetHeight;
        const follow = before && now.w === before.grid.w && now.vw === before.grid.vw && now.vh === before.grid.vh;
        if (follow && Math.abs(to - from) >= 1 && typeof paper.animate === "function") {
          const animation = paper.animate(
            [
              { height: `${from}px`, marginBottom: `${to - from}px` },
              { height: `${to}px`, marginBottom: "0px" },
            ],
            { duration: MORPH * 1000, easing: EASE_CSS },
          );
          running.current.set(paper, animation);
          animation.onfinish = () => running.current.delete(paper);
        }
        return to;
      });
      measured.current = { grid: now, heights };
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [grid, on]);
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
