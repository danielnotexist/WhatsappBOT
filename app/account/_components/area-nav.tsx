"use client";

import { CreditCard, House, Link2, MessageCircle, Settings, UsersRound, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCOUNT_AREAS, areaFrom, areaHref, type AccountArea } from "../areas";

/**
 * The areas of the personal area, switched on the page. Every area is rendered by the server once (the same data
 * as before); the URL says which one shows (../areas.ts), so a link from WhatsApp, an OAuth return or a server
 * action lands on the right one and the browser's back button walks the areas.
 *
 * The links are real links (`/account?tab=agents`): without JavaScript, or opened in a new tab, the server renders
 * that area. With JavaScript a plain click switches at once (history.pushState — Next.js keeps useSearchParams in
 * sync), moves focus to the area's heading and, when the page was scrolled past it, brings the area into view.
 * Pattern: a <nav> of links with aria-current="page" + a heading per area (not tabs: each one is an address).
 */

export function useActiveArea(): AccountArea {
  return areaFrom(useSearchParams());
}

/** The area a click asked for: its panel takes focus once it shows (not on a page load or a server redirect). */
const pending: { area: AccountArea | null } = { area: null };

function isPlainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function goTo(area: AccountArea) {
  const href = areaHref(area);
  const here = window.location.pathname + window.location.search;
  pending.area = area;
  // the same area again: only drop a notice from the address (no new history entry)
  if (areaFrom(new URLSearchParams(window.location.search)) === area) {
    if (here !== href) window.history.replaceState(null, "", href);
    focusArea(area);
    return;
  }
  window.history.pushState(null, "", href);
}

function focusArea(area: AccountArea) {
  const panel = document.getElementById(`area-${area}`);
  if (!panel || panel.hidden) return;
  pending.area = null;
  if (panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: "start" });
  const heading = panel.querySelector<HTMLElement>("h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

/** A link to an area (the navigation, the status chips, "ניהול" on the overview). */
export function AreaLink({ area, children, onClick, ...rest }: { area: AccountArea; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      href={areaHref(area)}
      onClick={(e) => {
        onClick?.(e);
        if (!isPlainClick(e)) return;
        e.preventDefault();
        goTo(area);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** One area's content: shown when the URL names it. Not a landmark itself — the Section inside is the region. */
export function AreaPanel({ area, children }: { area: AccountArea; children: ReactNode }) {
  const active = useActiveArea() === area;
  useEffect(() => {
    if (active && pending.area === area) focusArea(area);
  }, [active, area]);
  return (
    <div id={`area-${area}`} data-area={area} hidden={!active} className="scroll-mt-[5.5rem] lg:scroll-mt-6">
      {children}
    </div>
  );
}

const ICONS: Record<AccountArea, LucideIcon> = {
  overview: House,
  connections: Link2,
  whatsapp: MessageCircle,
  agents: UsersRound,
  plan: CreditCard,
  settings: Settings,
};

/**
 * Wide screens: a column on the inline-start side (sticky beside the content). Phones and tablets: one sticky row of
 * six equal cells, icon over label — every area visible at 390px; narrower than that the row scrolls inside itself,
 * never the page. A honey dot marks an area that needs the user (a broken connection, no number, a failed charge).
 */
export function AreaNav({ attention, className }: { attention: readonly AccountArea[]; className?: string }) {
  const active = useActiveArea();
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    list.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav
      aria-label="ניווט באזור האישי"
      className={cn(
        "sticky top-0 z-30 -mx-4 border-b border-line bg-night/90 px-2 backdrop-blur-md sm:-mx-8 sm:px-6",
        "lg:top-6 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none",
        className,
      )}
    >
      <ul ref={listRef} className="grid auto-cols-[minmax(3.75rem,1fr)] grid-flow-col overflow-x-auto [scrollbar-width:none] lg:flex lg:flex-col lg:gap-1 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {ACCOUNT_AREAS.map(({ id, label }) => {
          const Icon = ICONS[id];
          const current = active === id;
          return (
            <li key={id} className="flex">
              <AreaLink
                area={id}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 pt-3 pb-2.5 text-[0.8125rem] leading-none whitespace-nowrap text-cream-muted transition-colors duration-150 hover:text-cream",
                  // the current area: a honey bar under the cell (phones) / at the inline-start edge (wide screens)
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-honey after:opacity-0 after:transition-opacity aria-[current=page]:text-cream aria-[current=page]:after:opacity-100",
                  "lg:flex-row lg:justify-start lg:gap-3.5 lg:rounded-2xl lg:px-4 lg:py-3 lg:text-[1.0625rem] lg:leading-snug lg:hover:bg-cream/[0.04] lg:aria-[current=page]:bg-night-2",
                  "lg:after:inset-x-auto lg:after:inset-y-3 lg:after:start-0 lg:after:h-auto lg:after:w-[3px]",
                )}
              >
                <span className="relative">
                  <Icon aria-hidden="true" strokeWidth={1.9} className={cn("size-[1.375rem] lg:size-5", current ? "text-honey" : "text-current")} />
                  {attention.includes(id) ? (
                    <span aria-hidden="true" className="absolute -end-1 -top-0.5 size-2 rounded-full bg-honey ring-2 ring-night lg:hidden" />
                  ) : null}
                </span>
                <span>{label}</span>
                {attention.includes(id) ? <span aria-hidden="true" className="ms-auto hidden size-2 flex-none rounded-full bg-honey lg:block" /> : null}
              </AreaLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
