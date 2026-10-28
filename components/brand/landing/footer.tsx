import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { CONTAINER } from "./ui";

const LINKS = [
  { href: "/login", label: "כניסה" },
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/privacy", label: "מדיניות פרטיות" },
  { href: "/accessibility", label: "הצהרת נגישות" },
] as const;

export function LandingFooter() {
  return (
    <footer className="alze-defer border-t border-line [contain-intrinsic-size:auto_12rem]">
      <div
        className={cn(
          CONTAINER,
          "flex flex-col gap-8 py-12 sm:flex-row sm:items-end sm:justify-between",
        )}
      >
        <div>
          {/* the header's wordmark is the page transition's anchor: this one is not */}
          <Wordmark anchor={false} />
          <p className="mt-3 text-[0.9375rem] text-cream-muted">{BRAND.tagline}</p>
        </div>
        <nav aria-label="קישורים">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-[0.9375rem]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-cream-muted underline-offset-4 transition-colors hover:text-cream hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
