"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveal-on-scroll for below-the-fold content only. At rest (server HTML, no JS, reduced motion, or already on
 * screen at load) everything is visible — we only hide what starts below the fold, then fade it in once.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"rest" | "hidden" | "shown">("rest");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top <= window.innerHeight) return;
    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={state === "hidden" ? { opacity: 0, y: 18 } : { opacity: 1, y: 0 }}
      transition={state === "shown" ? { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
