"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CrestMark } from "@/components/brand/wordmark";
import { PROVIDERS, type ConnectProvider } from "@/lib/auth/oauth-providers";
import { BRAND } from "@/lib/brand";

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-10" aria-hidden="true">
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}
function MailMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-10" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#FFFFFF" stroke="#C5221F" strokeWidth="1.5" />
      <path d="M3 6.5 12 13l9-6.5" fill="none" stroke="#C5221F" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Step 5 (round plan §3): the light hand-off screen — עלזה ↔ provider with a moving line, then the redirect.
 * After ~0.9s it hands over to our OAuth start route for the provider (`returnTo=onboarding`). `available: false` would
 * show "coming soon" and continue to the ready step instead.
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
      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="grid size-20 place-items-center rounded-3xl bg-ink text-honey shadow-[0_18px_40px_-18px_rgb(19_36_28/0.6)]">
          <CrestMark className="size-11" />
        </span>
        <span className="relative h-1 w-20 overflow-hidden rounded-full bg-ink/15 sm:w-28">
          <motion.span
            className="absolute inset-y-0 w-1/3 rounded-full bg-ink"
            initial={false}
            animate={reduce ? { insetInlineStart: "33%" } : { insetInlineStart: ["-33%", "100%"] }}
            transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
        <span className="grid size-20 place-items-center rounded-3xl bg-white shadow-[0_18px_40px_-18px_rgb(19_36_28/0.45)]">
          {provider === "microsoft" ? <MicrosoftMark /> : <MailMark />}
        </span>
      </div>

      <h1 className="mt-10 text-title font-bold">
        {BRAND.name} רוצה להתחבר ל-{p.product} שלך
      </h1>
      <p role="status" className="mt-4 text-lede text-ink-muted">
        {p.available ? `מעבירים אותך ל-${p.company}…` : `${p.product} מגיע בקרוב, ממשיכים בינתיים`}
      </p>
      <p className="mt-2 text-[1rem] text-ink-muted">{p.available ? "מתחבר…" : null}</p>

      {p.available ? (
        <a href={p.next} className="mt-10 text-[0.9375rem] font-semibold underline underline-offset-3">
          לא קרה כלום? המשך ל-{p.company}
        </a>
      ) : (
        <Link href={p.next as Route} className="mt-10 text-[0.9375rem] font-semibold underline underline-offset-3">
          המשך
        </Link>
      )}
    </div>
  );
}
