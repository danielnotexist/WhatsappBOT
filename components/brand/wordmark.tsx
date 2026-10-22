import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** A hoopoe crest — the small mark next to the name. */
export function CrestMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("block", className)} aria-hidden="true" focusable="false">
      {[-36, -12, 12, 36].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 21)`}>
          <path d="M12 21c-2.4-5-2.6-10.6 0-15.6 2.6 5 2.4 10.6 0 15.6z" fill="currentColor" />
          <circle cx="12" cy="6.6" r="1.25" fill="var(--alze-night)" />
        </g>
      ))}
    </svg>
  );
}

/** The wordmark: crest + "עלזה" in the headline serif. Links home unless `href` is null. */
export function Wordmark({ href = "/", className }: { href?: "/" | null; className?: string }) {
  const content = (
    <span className={cn("inline-flex items-center gap-2 font-heading text-[1.6rem] leading-none font-bold text-cream", className)}>
      <CrestMark className="size-6 text-honey" />
      {BRAND.name}
    </span>
  );
  if (href === null) return content;
  return (
    <Link href={href} aria-label={`${BRAND.name} - לדף הבית`} className="rounded-md">
      {content}
    </Link>
  );
}
