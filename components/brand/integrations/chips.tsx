"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { SoonTag, type TileTone } from "./soon-tag";

/**
 * A row of product tiles, each a button with a tooltip: the product's name and what she does with it.
 *  - One tab stop for the whole row (a toolbar with a roving tabindex): Tab enters at the last chip used, the arrow
 *    keys move along the row (mirrored in RTL), Home / End jump to the ends.
 *  - The tooltip opens on mouse hover, on keyboard focus and on a tap (touch has no hover); Esc, a press outside or
 *    leaving the row closes it. It stays inside the nearest `[data-tip-bounds]` (the plan card) or the viewport.
 *  - Screen readers: the button's name is the product (plus "בקרוב"), its description is the one-line benefit.
 * The marks come in server-rendered (`marks`), so the SVGs never ship in this island's bundle.
 */

export interface ChipItem {
  id: string;
  name: string;
  benefit: string;
  soon: boolean;
}

export interface ChipGroup {
  id: string;
  /** the group's accessible name (Google / Microsoft 365) */
  label: string;
  items: ChipItem[];
  /** one server-rendered tile per item, in the same order */
  marks: ReactNode[];
}

type Open = { id: string; via: "hover" | "focus" | "tap" } | null;

const EDGE = 8;

export function IntegrationChips({
  groups,
  labelledBy,
  label,
  tone = "night",
  className,
}: {
  groups: ChipGroup[];
  labelledBy?: string;
  label?: string;
  /** the surface the row stands on; the tooltip takes the opposite one */
  tone?: TileTone;
  className?: string;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const [active, setActive] = useState(groups[0]?.items[0]?.id ?? "");
  const [open, setOpen] = useState<Open>(null);
  const tipId = (id: string) => `${uid}-tip-${id}`;

  // a press anywhere else closes a tapped tooltip (touch has no blur to rely on)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // keep the bubble inside its bounds; the caret stays on the chip
  useLayoutEffect(() => {
    if (!open) return;
    const bubble = document
      .getElementById(tipId(open.id))
      ?.querySelector<HTMLElement>("[data-bubble]");
    if (!bubble) return;
    bubble.style.translate = "";
    const r = bubble.getBoundingClientRect();
    const b = root.current?.closest("[data-tip-bounds]")?.getBoundingClientRect();
    const min = Math.max(b?.left ?? 0, 0) + EDGE;
    const max = Math.min(b?.right ?? window.innerWidth, window.innerWidth) - EDGE;
    const dx = r.left < min ? min - r.left : r.right > max ? max - r.right : 0;
    if (dx) bubble.style.translate = `${Math.round(dx)}px 0`;
    // tipId only depends on uid, which never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(null);
      }
      return;
    }
    const chips = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>("[data-integration-chip]") ?? []),
    ];
    const i = chips.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const rtl = root.current?.closest("[dir]")?.getAttribute("dir") === "rtl";
    const step: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
    let next: number;
    if (e.key in step) next = (i + step[e.key]! + chips.length) % chips.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = chips.length - 1;
    else return;
    e.preventDefault();
    chips[next]!.focus();
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!root.current?.contains(e.relatedTarget as Node | null))
      setOpen((o) => (o?.via === "hover" ? o : null));
  }

  const isNight = tone === "night";
  return (
    <div
      ref={root}
      role="toolbar"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2.5", className)}
    >
      {groups.map((g) => (
        <div
          key={g.id}
          role="group"
          aria-label={g.label}
          className="flex flex-wrap items-center gap-2"
        >
          {g.items.map((item, i) => {
            const shown = open?.id === item.id;
            return (
              <span key={item.id} className="relative flex">
                <button
                  type="button"
                  data-integration-chip={item.id}
                  aria-label={item.soon ? `${item.name}, בקרוב` : item.name}
                  aria-describedby={tipId(item.id)}
                  tabIndex={active === item.id ? 0 : -1}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setOpen({ id: item.id, via: "hover" });
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse")
                      setOpen((o) => (o?.id === item.id && o.via !== "focus" ? null : o));
                  }}
                  onPointerDown={() => {
                    pressed.current = true;
                  }}
                  onFocus={() => {
                    setActive(item.id);
                    if (!pressed.current) setOpen({ id: item.id, via: "focus" });
                    pressed.current = false;
                  }}
                  onClick={() => {
                    pressed.current = false;
                    setOpen((o) =>
                      o?.id === item.id && o.via === "tap" ? null : { id: item.id, via: "tap" },
                    );
                  }}
                  className="block rounded-[0.6875rem] focus-visible:outline-offset-2"
                >
                  {g.marks[i]}
                </button>
                <span
                  role="tooltip"
                  id={tipId(item.id)}
                  hidden={!shown}
                  className="pointer-events-none absolute inset-x-0 bottom-full z-30 flex flex-col items-center pb-1.5"
                >
                  <span
                    data-bubble
                    className={cn(
                      "w-max max-w-[18.5rem] animate-in rounded-[0.875rem] px-3.5 pt-2 pb-2.5 text-start duration-150 fade-in-0 slide-in-from-bottom-1",
                      isNight
                        ? "bg-paper text-ink shadow-[0_18px_40px_-16px_rgb(0_0_0/0.8)]"
                        : "bg-night-2 text-cream shadow-[0_18px_40px_-18px_rgb(19_36_28/0.75)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-2 text-[0.9375rem] leading-snug font-semibold"
                    >
                      <bdi>{item.name}</bdi>
                      {item.soon ? <SoonTag tone={isNight ? "paper" : "night"} /> : null}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[0.875rem] leading-snug",
                        isNight ? "text-ink-muted" : "text-cream-muted",
                      )}
                    >
                      {item.benefit}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "-mt-px h-1.5 w-3 [clip-path:polygon(0_0,100%_0,50%_100%)]",
                      isNight ? "bg-paper" : "bg-night-2",
                    )}
                  />
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
