"use client";

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { FRAME_CONTENT_MAX, HEADER_BAR } from "@/components/brand/frame";
import { PageTransition } from "@/components/brand/page-transition";
import { StepDeck, StepPaper, useLateResizeMorph } from "@/components/brand/step-card";
import { Wordmark } from "@/components/brand/wordmark";
import { cardTones, type CardTone } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { ShellAccountLink, ShellSessionProvider } from "./shell-session";

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
 * A size change that comes after the step (a part streamed into it, a notice) morphs too (useLateResizeMorph).
 * The header ends with the account link: "כבר יש לך חשבון? כניסה" signed out, "לאזור האישי" signed in (`account`).
 */
export function SignupShell({ account, children }: { account?: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "/start";
  return (
    <ShellFrame
      tone={toneForPath(pathname)}
      deck={deckForPath(pathname)}
      showLogin={!pathname.startsWith("/login")}
      account={account}
    >
      {children}
    </ShellFrame>
  );
}

/** The frame itself, for routes that know their tone up front (dynamic routes, where usePathname would suspend). */
export function ShellFrame({
  tone,
  deck = [],
  showLogin = false,
  account,
  children,
}: {
  tone: CardTone | null;
  deck?: CardTone[];
  showLogin?: boolean;
  /**
   * The header's account link, rendered by the layout as a request-time hole that reads the session cookie
   * (components/auth/by-session.tsx). Without it: the signed-out link only.
   */
  account?: ReactNode;
  children: ReactNode;
}) {
  const light = tone ? cardTones[tone].light : false;
  const ready = tone === "ready";
  const grid = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  useLateResizeMorph(grid, paper, deckRef);
  return (
    <ShellSessionProvider loginVisible={Boolean(tone && showLogin)}>
      {/* the page transition: on entering / leaving the shell only — between its own steps the card morphs instead.
          Before any DOM node, or React never runs its enter / exit (components/brand/page-transition.tsx) */}
      <PageTransition>
        <div className="stage flex min-h-dvh flex-col">
          <header className={HEADER_BAR}>
            <Wordmark />
            {account ?? <ShellAccountLink signedIn={false} />}
          </header>
          <main
            id="main"
            className={cn(
              "flex flex-1 flex-col",
              tone
                ? cn(
                    "items-center sm:justify-center sm:px-6 sm:pb-16 lg:px-12",
                    deck.length ? "pt-7 sm:pt-10" : "pt-2 sm:pt-4",
                    // wide screens: centred, but never higher than the hoopoe standing on the paper allows — a taller card
                    // (an error box) moves down instead of pushing her crest into the header. Two flex spacers: the top one
                    // keeps a floor (paper top at least 10.5rem under the header, with the padding above), the bottom one
                    // takes the rest.
                    tone !== "ready" &&
                      "lg:justify-start lg:before:flex-1 lg:before:content-[''] lg:after:flex-1 lg:after:content-['']",
                    tone !== "ready" && (deck.length ? "lg:before:min-h-[8rem]" : "lg:before:min-h-[9.5rem]"),
                  )
                : "px-4 sm:px-8 lg:px-12",
            )}
          >
            {tone ? (
              <div
                ref={grid}
                data-tone={tone}
                className={cn(
                  "relative grid w-full grid-cols-1 grid-rows-[auto_1fr] sm:max-w-[31rem]",
                  !ready && "max-sm:min-h-[calc(100dvh-4.75rem-1.75rem)]",
                  // the frame's content box (components/brand/frame.ts), so the question lines up with the wordmark
                  FRAME_CONTENT_MAX,
                  "lg:grid-rows-1 lg:gap-x-[clamp(3rem,7vw,7rem)]",
                  ready
                    ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
                    : "lg:grid-cols-[minmax(0,1fr)_30rem]",
                  light && "surface-light",
                )}
              >
                <StepDeck ref={deckRef} deck={deck} className={PAPER_AREA} />
                <StepPaper ref={paper} tone={tone} className={PAPER_AREA} />
                {children}
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </PageTransition>
    </ShellSessionProvider>
  );
}
