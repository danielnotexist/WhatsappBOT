import Link from "next/link";
import type { Route } from "next";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-7 text-[1.0625rem] font-semibold leading-tight transition-[transform,background-color,box-shadow,opacity] duration-200 select-none focus-visible:outline-3 focus-visible:outline-offset-3 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

const tones = {
  /** the one warm call to action on the dark stage */
  honey: "bg-honey text-night shadow-[0_14px_30px_-14px_rgb(231_182_92/0.7)] hover:bg-[#EDC273] focus-visible:outline-honey",
  /** primary action inside a light step card */
  ink: "bg-ink text-cream hover:bg-[#1C3328] focus-visible:outline-ink",
  /** secondary action inside a light card */
  outline: "border-2 border-ink-muted bg-transparent text-ink hover:bg-ink/6 focus-visible:outline-ink",
  /** secondary action on the dark stage */
  ghost: "border-2 border-cream-muted/60 bg-transparent text-cream hover:bg-cream/6 focus-visible:outline-honey",
} as const;

export type CtaTone = keyof typeof tones;

type CommonProps = { tone?: CtaTone; className?: string; children: ReactNode; block?: boolean };

/** A brand button. With `href` it renders a link (internal → next/link, external → <a>). */
export function Cta(props: CommonProps & ({ href: Route | URL | string; external?: boolean; onClick?: () => void } | ButtonHTMLAttributes<HTMLButtonElement>)) {
  const { tone = "honey", className, children, block } = props;
  const cls = cn(base, tones[tone], block && "w-full", className);
  if ("href" in props && props.href !== undefined) {
    const { href, external, onClick } = props as { href: string; external?: boolean; onClick?: () => void };
    if (external || /^https?:|^mailto:/.test(href)) {
      return (
        <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} onClick={onClick}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href as Route} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }
  const { tone: _t, className: _c, children: _ch, block: _b, ...rest } = props as CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;
  void _t;
  void _c;
  void _ch;
  void _b;
  return (
    <button type="button" {...rest} className={cls}>
      {children}
    </button>
  );
}
