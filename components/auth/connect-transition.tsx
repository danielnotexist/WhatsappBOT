"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Mascot } from "@/components/brand/mascot";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { PROVIDERS, type ConnectProvider } from "@/lib/auth/oauth-providers";
import { BRAND } from "@/lib/brand";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * The light sheet behind the hand-off: on a client-side arrival from the connect card it opens out of a card-sized
 * rectangle to the full screen (the paper becoming the page). Server HTML / reduced motion: simply there.
 */
export function HandoffSheet({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  return (
    <motion.div
      className="surface-light flex min-h-dvh flex-col bg-cream"
      initial={hydrated && !reduce ? { clipPath: "inset(12% 24% 12% 24% round 28px)" } : false}
      animate={{ clipPath: "inset(0% 0% 0% 0% round 0px)" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Step 5 (round plan §3): the light hand-off screen — עלזה ↔ provider with dots travelling between them, then the
 * redirect. After ~0.9s it hands over to our OAuth start route for the provider (`returnTo=onboarding`).
 * `available: false` would show "coming soon" and continue to the ready step instead.
 */
export function ConnectTransition({ provider }: { provider: ConnectProvider }) {
  const p = PROVIDERS[provider];
  const reduce = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (p.available) window.location.assign(p.next);
      else router.replace(p.next as Route);
    }, p.delayMs);
    return () => window.clearTimeout(t);
  }, [p, router]);

  return (
    <div className="flex w-full max-w-xl flex-col items-center text-center">
      <div className="flex items-center gap-3 sm:gap-5" aria-hidden="true">
        {/* עלזה's tile: the bird on night, opposite the provider's white tile */}
        <span className="relative flex size-20 items-end justify-center overflow-hidden rounded-3xl bg-night shadow-[0_18px_40px_-18px_rgb(19_36_28/0.6)] sm:size-24">
          <Mascot pose="front" eager idle={false} sizes="(min-width: 640px) 80px, 66px" className="-mb-1 w-[4.125rem] sm:w-20" />
        </span>
        <span className="flex h-20 items-center gap-2 px-1 sm:h-24">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full bg-ink"
              initial={false}
              animate={reduce ? { opacity: 0.5 } : { opacity: [0.18, 1, 0.18], scale: [0.8, 1.15, 0.8] }}
              transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
            />
          ))}
        </span>
        <span className="grid size-20 place-items-center rounded-3xl bg-white shadow-[0_18px_40px_-18px_rgb(19_36_28/0.45)] sm:size-24">
          <ProviderLogo provider={provider} className="size-10" />
        </span>
      </div>

      <h1 className="mt-10 text-title leading-[1.12] font-bold">
        {BRAND.name} רוצה להתחבר <span className="whitespace-nowrap">ל-{p.product}</span> שלך
      </h1>
      <p role="status" className="mt-4 text-lede text-ink-muted">
        {p.available ? `מעבירים אותך ל-${p.company}…` : `${p.product} מגיע בקרוב, ממשיכים בינתיים`}
      </p>
      {p.available ? (
        <p className="mt-2 max-w-sm text-[0.9375rem] text-ink-muted">ההתחברות עצמה נעשית אצל {p.company}. הסיסמה שלך לא עוברת דרכנו.</p>
      ) : null}

      {p.available ? (
        <a href={p.next} className="mt-10 rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
          לא קרה כלום? אפשר להמשיך ל-{p.company}
        </a>
      ) : (
        <Link href={p.next as Route} className="mt-10 rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
          המשך
        </Link>
      )}
    </div>
  );
}
