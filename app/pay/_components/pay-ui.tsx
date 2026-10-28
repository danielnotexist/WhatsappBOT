import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BySession } from "@/components/auth/by-session";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { Mascot, type MascotPoseName } from "@/components/brand/mascot";
import { FRAME, HEADER_BAR } from "@/components/brand/frame";
import { PageTransition } from "@/components/brand/page-transition";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

/**
 * The payment pages (/pay/<token>, /pay/done) in "לילה ירוק": the signup's dark stage and wordmark, one handwritten
 * line and a headline on the stage, and the decision on paper. The header offers "לאזור האישי" to a signed-in
 * browser (a request-time hole, like the landing and the signup shell).
 */
export function PayStage({ children }: { children: ReactNode }) {
  return (
    <PageTransition>
      <div className="stage flex min-h-dvh flex-col">
        <header className={HEADER_BAR}>
          <Wordmark />
          <BySession
            signedIn={
              <Cta href="/account" size="sm">
                לאזור האישי
              </Cta>
            }
          />
        </header>
        <main id="main" className={cn(FRAME, "flex-1 pb-20 sm:pb-28")}>
          {children}
        </main>
      </div>
    </PageTransition>
  );
}

/** The handwritten line + the headline + one line under it, on the stage. */
export function PayHeading({ tag, title, children, className }: { tag: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby="pay-title" className={cn("pt-8 sm:pt-12", className)}>
      <Handwritten tone="sage">{tag}</Handwritten>
      <h1 id="pay-title" className="mt-2 text-title leading-[1.1] font-bold">
        {title}
      </h1>
      {children}
    </section>
  );
}

/** A short line of reassurance with a sage check (as on the sign-in page). */
export function Assurance({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-[0.3em] size-4 flex-none fill-none stroke-sage stroke-[2.4]">
        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

/** An error on the stage, above the papers (role=alert). */
export function PayError({ text }: { text: string }) {
  return (
    <div role="alert" className="mt-8 flex items-start gap-3 rounded-2xl border border-destructive/45 bg-destructive/10 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream sm:px-5">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-current stroke-[2.2] text-destructive">
        <path d="M12 7.5v5.5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" />
      </svg>
      <p className="flex-1">{text}</p>
    </div>
  );
}

/**
 * One paper with the hoopoe standing on its top edge (as on the signup papers and the subscription slip): the
 * invalid link, the payment result, the card update. `honey` is the pro paper (the upgrade and its result), the same
 * honey as the pro plan on the choose-plan face.
 */
export function PayPaper({
  pose,
  mascotAlt = "",
  tone = "paper",
  children,
  className,
}: {
  pose: MascotPoseName;
  mascotAlt?: string;
  tone?: "paper" | "honey";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative mt-28 max-w-[34rem] sm:mt-32", className)}>
      <Mascot pose={pose} alt={mascotAlt} eager sizes="(min-width: 640px) 112px, 88px" className="absolute end-6 bottom-full -mb-1 w-[5.5rem] sm:end-8 sm:w-28" />
      <div className={cn("surface-light rounded-card p-6 text-ink shadow-stage sm:p-8", tone === "honey" ? "bg-honey" : "bg-paper")}>{children}</div>
    </div>
  );
}

/** A neutral line on the stage above the paper (role=status): what changed since the page was shown. */
export function PayNotice({ text }: { text: string }) {
  return (
    <div role="status" className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-cream/[0.04] px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream sm:px-5">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-current stroke-[2.2] text-sage">
        <path d="M12 11v5.5M12 7.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" />
      </svg>
      <p className="flex-1">{text}</p>
    </div>
  );
}

/** A quiet text link on the stage. */
export function StageLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-sm text-[0.9375rem] text-cream-muted underline underline-offset-3 hover:text-cream">
      {children}
    </Link>
  );
}
