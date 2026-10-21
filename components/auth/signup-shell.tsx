"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StepCard } from "@/components/brand/step-card";
import { Wordmark } from "@/components/brand/wordmark";
import type { CardTone } from "@/lib/design/tokens";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/** Which card paper each route gets (round plan §2/§3). null = no card (the /start intro). */
export function toneForPath(pathname: string): CardTone | null {
  if (pathname === "/start") return null;
  if (/\/(email)$/.test(pathname)) return "email";
  if (/\/(code)$/.test(pathname)) return "code";
  if (/\/(connect|whatsapp)$/.test(pathname)) return "connect";
  if (/\/ready$/.test(pathname) || pathname.startsWith("/login/w/")) return "ready";
  return "night";
}


/**
 * The persistent signup/login shell: dark stage, wordmark, and ONE card that stays mounted while the routes under it
 * change — so the paper colour cross-fades and the size morphs between steps instead of the page reloading.
 * On phones the card fills the screen under the header.
 */
export function SignupShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/start";
  return (
    <ShellFrame tone={toneForPath(pathname)} contentKey={pathname} wide={/\/ready$/.test(pathname)} showLogin={!pathname.startsWith("/login")}>
      {children}
    </ShellFrame>
  );
}

/** The frame itself, for routes that know their tone up front (dynamic routes, where usePathname would suspend). */
export function ShellFrame({
  tone,
  contentKey,
  wide = false,
  showLogin = false,
  children,
}: {
  tone: CardTone | null;
  contentKey?: string;
  wide?: boolean;
  showLogin?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const animateIn = hydrated && !reduce;
  return (
    <div className="stage flex min-h-dvh flex-col">
      <header className="mx-auto flex h-[4.75rem] w-full max-w-6xl flex-none items-center justify-between px-4 sm:px-8">
        <Wordmark />
        {tone && showLogin ? (
          <Link href="/login" className="rounded-md px-2 py-1 text-[0.9375rem] text-cream-muted underline-offset-4 hover:text-cream hover:underline">
            כבר יש לך חשבון? כניסה
          </Link>
        ) : null}
      </header>
      <main id="main" className={cn("flex flex-1 flex-col items-center", tone ? "sm:justify-center sm:px-6 sm:pb-16" : "px-4 sm:px-8")}>
        {tone ? (
          <StepCard tone={tone} className={wide ? "sm:max-w-[62rem]" : "sm:max-w-[31rem]"}>
            <motion.div
              key={contentKey}
              className="flex flex-1 flex-col"
              initial={animateIn ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: animateIn ? 0.4 : 0, delay: animateIn ? 0.12 : 0, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </StepCard>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
