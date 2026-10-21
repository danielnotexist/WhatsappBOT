"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StepDeck, StepPaper } from "@/components/brand/step-card";
import { Wordmark } from "@/components/brand/wordmark";
import { cardTones, type CardTone } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/** Which card paper each route gets (round plan §2/§3). null = no card (the /start intro). */
export function toneForPath(pathname: string): CardTone | null {
  if (pathname === "/start") return null;
  if (/\/(email)$/.test(pathname)) return "email";
  if (/\/(code)$/.test(pathname)) return "code";
  if (/\/(connect|whatsapp)$/.test(pathname)) return "connect";
  if (/\/ready$/.test(pathname)) return "ready";
  return "night";
}

/** The signup's papers in order (round plan §3: email → code → connect → ready). */
export const SIGNUP_PAPERS: readonly CardTone[] = ["email", "code", "connect", "ready"];

/** The papers still waiting behind the current one — signup only (sign-in is not a sequence). */
export function deckForPath(pathname: string): CardTone[] {
  if (!pathname.startsWith("/start/")) return [];
  const tone = toneForPath(pathname);
  const i = tone ? SIGNUP_PAPERS.indexOf(tone) : -1;
  return i < 0 ? [] : SIGNUP_PAPERS.slice(i + 1);
}

/** Where the paper (and the deck behind it) sits: the whole card on phones, the answer column on wide screens. */
const PAPER_AREA = "col-start-1 row-[1/3] lg:col-start-2 lg:row-[1/2]";

/**
 * The persistent signup/login shell: dark stage, wordmark, and ONE paper that stays mounted while the routes under it
 * change — so its colour cross-fades and its size morphs between steps instead of the page reloading.
 *
 * Each step renders two slots (components/auth/step-slots.tsx): StepAside (the question) and StepBody (the answer).
 *  - phones/tablets: one card — the aside on top of the paper, the body under it (full-screen sheet on phones);
 *  - wide screens: the question moves out onto the dark stage, and the paper holds only the fields.
 * The remaining signup papers wait behind the current one (StepDeck), peeking out above it.
 */
export function SignupShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/start";
  return (
    <ShellFrame tone={toneForPath(pathname)} deck={deckForPath(pathname)} showLogin={!pathname.startsWith("/login")}>
      {children}
    </ShellFrame>
  );
}

/** The frame itself, for routes that know their tone up front (dynamic routes, where usePathname would suspend). */
export function ShellFrame({
  tone,
  deck = [],
  showLogin = false,
  children,
}: {
  tone: CardTone | null;
  deck?: CardTone[];
  showLogin?: boolean;
  children: ReactNode;
}) {
  const light = tone ? cardTones[tone].light : false;
  const ready = tone === "ready";
  return (
    <div className="stage flex min-h-dvh flex-col">
      <header className="mx-auto flex h-[4.75rem] w-full max-w-6xl flex-none items-center justify-between px-4 sm:px-8">
        <Wordmark />
        {tone && showLogin ? (
          <Link href="/login" className="rounded-md px-2 py-1 text-[0.9375rem] text-cream-muted underline-offset-4 transition-colors hover:text-cream hover:underline">
            כבר יש לך חשבון? כניסה
          </Link>
        ) : null}
      </header>
      <main
        id="main"
        className={cn(
          "flex flex-1 flex-col",
          tone ? cn("items-center sm:justify-center sm:px-6 sm:pb-16 lg:px-8", deck.length ? "pt-7 sm:pt-10" : "pt-2 sm:pt-4") : "px-4 sm:px-8",
        )}
      >
        {tone ? (
          <div
            data-tone={tone}
            className={cn(
              "relative grid w-full grid-cols-1 grid-rows-[auto_1fr] sm:max-w-[31rem]",
              !ready && "max-sm:min-h-[calc(100dvh-4.75rem-1.75rem)]",
              // 68rem = the header's 72rem minus its padding, so the question lines up with the wordmark
              "lg:max-w-[68rem] lg:grid-rows-1 lg:gap-x-[clamp(3rem,7vw,7rem)]",
              ready ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]" : "lg:grid-cols-[minmax(0,1fr)_30rem]",
              light && "surface-light",
            )}
          >
            <StepDeck deck={deck} className={PAPER_AREA} />
            <StepPaper tone={tone} className={PAPER_AREA} />
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
