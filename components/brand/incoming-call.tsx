"use client";

import { motion, useReducedMotion } from "motion/react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { MascotAvatar } from "./mascot";

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
      className={cn("flex h-full flex-col items-center bg-[linear-gradient(180deg,#14251E_0%,#0B141A_70%)] px-5 pt-11 pb-7 text-[var(--wa-fg)] @min-[17rem]:px-6 @min-[17rem]:pt-14 @min-[17rem]:pb-10", className)}
    >
      <p className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--wa-time)] @min-[17rem]:text-[0.75rem]">
        <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden="true">
          <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" />
        </svg>
        מוצפנת מקצה לקצה
      </p>
      <p className="mt-1 text-[0.75rem] text-[var(--wa-time)] @min-[17rem]:text-[0.8125rem]">שיחה קולית בוואטסאפ</p>

      <div className="relative mt-6 grid place-items-center @min-[17rem]:mt-10">
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute size-24 rounded-full border border-sage/40 @min-[17rem]:size-36"
            initial={false}
            animate={reduce ? { opacity: 0.35, scale: 1.12 } : { opacity: [0.55, 0], scale: [1, 1.55] }}
            transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
          />
        ))}
        {/* the caller's profile photo — the same image as עלזה's real WhatsApp profile */}
        <MascotAvatar sizes="144px" className="size-24 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] @min-[17rem]:size-36" />
      </div>

      <p className="mt-5 font-heading text-[1.625rem] leading-none font-bold @min-[17rem]:mt-8 @min-[17rem]:text-[2rem]">{BRAND.name}</p>
      <p className="mt-1.5 text-[0.8125rem] text-[var(--wa-time)] @min-[17rem]:mt-2 @min-[17rem]:text-[0.875rem]">{status}</p>

      <div aria-hidden="true" className="mt-auto flex w-full items-center justify-around">
        <span className="flex flex-col items-center gap-2 text-[0.75rem] text-[var(--wa-time)]">
          <span className="grid size-13 place-items-center rounded-full bg-[var(--wa-red)] @min-[17rem]:size-16">
            <svg viewBox="0 0 24 24" className="size-6 rotate-[135deg] fill-white @min-[17rem]:size-7">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </span>
          דחייה
        </span>
        <span className="flex flex-col items-center gap-2 text-[0.75rem] text-[var(--wa-time)]">
          <motion.span
            className="grid size-13 place-items-center rounded-full bg-[var(--wa-green)] @min-[17rem]:size-16"
            initial={false}
            animate={reduce ? { y: 0 } : { y: [0, -6, 0] }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, repeat: Infinity, repeatDelay: 0.7 }}
          >
            <svg viewBox="0 0 24 24" className="size-6 fill-white @min-[17rem]:size-7">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </motion.span>
          מענה
        </span>
      </div>
    </div>
  );
}
