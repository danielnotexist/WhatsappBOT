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

/**
 * The emblem (Daniel, 28.10.2026): the hoopoe's head in a honey ring, on the night. Decorative - the name next to it
 * says it. `public/brand/mascot/emblem.webp` is cut from the front pose.
 */
export function Emblem({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block flex-none overflow-hidden rounded-full border-2 border-honey bg-[radial-gradient(circle_at_50%_35%,#24402f,#0c1712)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a 15 KB decorative crop, same file everywhere */}
      <img src="/brand/mascot/emblem.webp" alt="" width={256} height={256} className="block size-full" decoding="async" />
    </span>
  );
}

/**
 * The logo: emblem + "עלזה" in the site's face (regular weight - Daniel, 28.10.2026), and under it the company slogan
 * ("מבקשים בוואטסאפ. היא על זה.") on every page. `slogan={false}` drops it where there is no room. On a light surface
 * (`className` with text-ink) the slogan takes the ink's muted tone. Links home unless `href` is null.
 */
export function Wordmark({ href = "/", className, slogan = true }: { href?: "/" | null; className?: string; slogan?: boolean }) {
  const light = className?.split(/\s+/).includes("text-ink") ?? false;
  const content = (
    <span className={cn("inline-flex items-center gap-2.5 text-cream", className)}>
      <Emblem className="size-9" />
      <span className="flex flex-col">
        <span className="font-heading text-[1.7rem] leading-none">{BRAND.name}</span>
        {slogan ? (
          <span className={cn("mt-1 text-[0.75rem] leading-none", light ? "text-ink-muted" : "text-cream-muted")}>{BRAND.slogan}</span>
        ) : null}
      </span>
    </span>
  );
  if (href === null) return content;
  return (
    <Link href={href} aria-label={`${BRAND.name} - לדף הבית`} className="rounded-md">
      {content}
    </Link>
  );
}
