import Link from "next/link";
import type { Route } from "next";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The press: a 2px darker bottom edge (a key, not a glow) that flattens when pressed, plus a 1px drop.
 * Disabled buttons keep their shape and lose their ink, so the layout never jumps when they wake up.
 */
const base =
  "inline-flex items-center justify-center gap-2.5 rounded-full font-semibold leading-tight select-none transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-out focus-visible:outline-3 focus-visible:outline-offset-3 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 aria-disabled:cursor-not-allowed";

const sizes = {
  md: "min-h-14 px-7 text-[1.0625rem]",
  /** list rows (the personal area) */
  sm: "min-h-11 px-5 text-[0.9375rem]",
} as const;

const tones = {
  /** the one warm call to action on the dark stage */
  honey:
    "bg-honey text-night shadow-[inset_0_-2px_0_rgb(15_28_23/0.2)] hover:bg-[#EDC273] active:shadow-none focus-visible:outline-honey disabled:bg-honey/30 disabled:text-night/55 disabled:shadow-none",
  /** primary action inside a light step card */
  ink: "bg-ink text-cream shadow-[inset_0_-2px_0_rgb(0_0_0/0.35)] hover:bg-[#1C3328] active:shadow-none focus-visible:outline-ink disabled:bg-ink/12 disabled:text-ink/45 disabled:shadow-none",
  /** secondary action inside a light card */
  outline: "border-2 border-ink-muted bg-transparent text-ink hover:border-ink hover:bg-ink/6 focus-visible:outline-ink",
  /** secondary action on the dark stage */
  ghost: "border-2 border-cream-muted/55 bg-transparent text-cream hover:border-cream hover:bg-cream/6 focus-visible:outline-honey",
} as const;

export type CtaTone = keyof typeof tones;
export type CtaSize = keyof typeof sizes;

type CommonProps = { tone?: CtaTone; size?: CtaSize; className?: string; children: ReactNode; block?: boolean };

/** The classes of a brand button — for the rare element that must look like one but is not a <Cta> (a <summary>). */
export function ctaClass({ tone = "honey", size = "md", block, className }: Omit<CommonProps, "children">): string {
  return cn(base, sizes[size], tones[tone], block && "w-full", className);
}

/**
 * A brand button. With `href` it renders a link: pages → next/link; external URLs, mailto: and our own /api/ routes
 * (OAuth starts that redirect away) → a plain <a>, in a new tab only with `external`.
 */
export function Cta(
  props: CommonProps & ({ href: Route | URL | string; external?: boolean; onClick?: () => void; "aria-label"?: string } | ButtonHTMLAttributes<HTMLButtonElement>),
) {
  const { tone = "honey", size = "md", className, children, block } = props;
  const cls = ctaClass({ tone, size, block, className });
  if ("href" in props && props.href !== undefined) {
    const { href, external, onClick, "aria-label": ariaLabel } = props as { href: string; external?: boolean; onClick?: () => void; "aria-label"?: string };
    if (external || /^https?:|^mailto:|^\/api\//.test(href)) {
      return (
        <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} onClick={onClick} aria-label={ariaLabel}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href as Route} className={cls} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  const { tone: _t, size: _s, className: _c, children: _ch, block: _b, ...rest } = props as CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;
  void _t;
  void _s;
  void _c;
  void _ch;
  void _b;
  return (
    <button type="button" {...rest} className={cls}>
      {children}
    </button>
  );
}
