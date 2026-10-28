import Link from "next/link";
import type { Route } from "next";
import { Cta } from "@/components/brand/cta";
import { HEADER_BAR } from "@/components/brand/frame";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import { closeAdminAction } from "../actions";
import { ADMIN_TABS, tabHref, type AdminTab } from "../tabs";

/** The panel's header: the wordmark with "ניהול", the way back to the personal area and closing the panel. */
export function AdminHeader({ open }: { open: boolean }) {
  return (
    <header className={cn(HEADER_BAR, "gap-3")}>
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark />
        {/* phones: the wordmark keeps its full size (it never moves between pages), so the label gives way */}
        <span className="rounded-full border border-honey/50 px-2.5 py-0.5 text-[0.8125rem] leading-snug text-honey max-sm:hidden">ניהול</span>
      </div>
      <div className="flex items-center gap-2">
        <Cta tone="ghost" size="sm" href="/account" className="max-sm:hidden">
          לאזור האישי
        </Cta>
        {open ? (
          <form action={closeAdminAction}>
            <Cta tone="ghost" size="sm" type="submit">
              סגירת הפאנל
            </Cta>
          </form>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The tabs: real links (/admin?tab=…), the current one marked with aria-current and a honey bar. A count beside a tab
 * that has something waiting (צריך עזרה, פניות פתוחות). One row on every width; narrower than it, the row scrolls inside.
 */
export function AdminNav({ current, counts }: { current: AdminTab; counts: Partial<Record<AdminTab, number>> }) {
  return (
    <nav aria-label="ניווט בפאנל הניהול" className="sticky top-0 z-30 -mx-4 border-b border-line bg-night/90 px-2 backdrop-blur-md sm:-mx-8 sm:px-6">
      <ul className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ADMIN_TABS.map((t) => {
          const n = counts[t.id] ?? 0;
          const active = current === t.id;
          return (
            <li key={t.id} className="flex flex-none">
              <Link
                href={tabHref(t.id) as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 items-center gap-2 px-3 text-[0.9375rem] whitespace-nowrap text-cream-muted transition-colors duration-150 hover:text-cream sm:px-4",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-honey after:opacity-0 aria-[current=page]:text-cream aria-[current=page]:after:opacity-100",
                )}
              >
                {t.label}
                {n > 0 ? (
                  <span className="min-w-6 rounded-full bg-honey/15 px-1.5 text-center text-[0.75rem] leading-5 text-honey tabular">
                    <span className="sr-only">, </span>
                    {n > 99 ? "99+" : n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
