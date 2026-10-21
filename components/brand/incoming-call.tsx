"use client";

import { motion, useReducedMotion } from "motion/react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { MascotPlaceholder } from "./mascot-placeholder";

/**
 * A WhatsApp incoming voice call from עלזה (the /start intro). Purely illustrative: exposed to screen readers as
 * one image with a description; the decline/answer buttons are drawn, not focusable.
 * The ring pulses twice per second-and-a-half; under reduced motion it is still.
 */
export function IncomingCall({ className, status = "מצלצלת…" }: { className?: string; status?: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      role="img"
      aria-label={`${BRAND.name} מתקשרת אליך בוואטסאפ`}
      className={cn("flex h-full flex-col items-center bg-[linear-gradient(180deg,#14251E_0%,#0B141A_70%)] px-6 pt-14 pb-10 text-[var(--wa-fg)]", className)}
    >
      <p className="flex items-center gap-1.5 text-[0.75rem] text-[var(--wa-time)]">
        <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden="true">
          <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" />
        </svg>
        מוצפנת מקצה לקצה
      </p>
      <p className="mt-1 text-[0.8125rem] text-[var(--wa-time)]">שיחה קולית בוואטסאפ</p>

      <div className="relative mt-10 grid place-items-center">
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute size-36 rounded-full border border-sage/40"
            initial={false}
            animate={reduce ? { opacity: 0.35, scale: 1.12 } : { opacity: [0.55, 0], scale: [1, 1.55] }}
            transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
          />
        ))}
        <span className="relative grid size-36 place-items-center overflow-hidden rounded-full bg-paper shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)]">
          <MascotPlaceholder pose="call" className="size-32 translate-y-2" />
        </span>
      </div>

      <p className="mt-8 font-heading text-[2rem] leading-none font-bold">{BRAND.name}</p>
      <p className="mt-2 text-[0.875rem] text-[var(--wa-time)]">{status}</p>

      <div aria-hidden="true" className="mt-auto flex w-full items-center justify-around">
        <span className="flex flex-col items-center gap-2 text-[0.75rem] text-[var(--wa-time)]">
          <span className="grid size-16 place-items-center rounded-full bg-[var(--wa-red)]">
            <svg viewBox="0 0 24 24" className="size-7 rotate-[135deg] fill-white">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </span>
          דחייה
        </span>
        <span className="flex flex-col items-center gap-2 text-[0.75rem] text-[var(--wa-time)]">
          <motion.span
            className="grid size-16 place-items-center rounded-full bg-[var(--wa-green)]"
            initial={false}
            animate={reduce ? { y: 0 } : { y: [0, -6, 0] }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, repeat: Infinity, repeatDelay: 0.7 }}
          >
            <svg viewBox="0 0 24 24" className="size-7 fill-white">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </motion.span>
          מענה
        </span>
      </div>
    </div>
  );
}
