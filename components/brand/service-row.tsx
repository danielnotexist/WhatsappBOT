"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ServiceId, ServiceView } from "@/lib/connections/services";
import Image from "next/image";
import { SERVICE_ICON_STYLE, serviceTileSrc } from "@/lib/connections/service-tiles";
import { cn } from "@/lib/utils";
import { ServiceGlyph } from "./service-icons";

/**
 * The services behind one connected account, as a row of solid icons ("חיבורים" in /account). Each icon is a real
 * control — a link that starts the missing consent ("צריך אישור נוסף") or a button — named "Gmail - מחובר" and described
 * by a small paper tooltip (role="tooltip", aria-describedby) that says what works or what is missing.
 *   - mouse: hover shows it (and it stays while the pointer is on the bubble); keyboard: focus shows it; touch: a tap
 *     toggles it — on a "needs approval" icon the first tap explains and the second one goes to the consent;
 *   - Esc or a tap elsewhere closes it; one tooltip at a time;
 *   - the bubble is out of the flow (no layout shift), kept inside the viewport at 390px, and fades in only when
 *     motion is allowed.
 * A service the plan does not include ("במסלול פרו") is a link to the upgrade, with the same two-tap behaviour on touch.
 * An account that is not connected shows its services faded ("preview": "Gmail - יתחבר עם Google"), as buttons that
 * only explain - the row's "חיבור" is the way in.
 * Status is never colour alone: the name says it, the tile shape says it (solid sage / dark with a honey dot / dashed /
 * dark with a small honey ring).
 */
export function ServiceRow({ services, label, className }: { services: readonly ServiceView[]; label: string; className?: string }) {
  const [open, setOpen] = useState<ServiceId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // the last press (pointer type + time): a touch tap toggles instead of relying on hover
  const pressRef = useRef<Press>({ type: "mouse", at: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const pending = services.filter((s) => s.status === "needs_consent").length;
  return (
    <div ref={rootRef} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {services.map((s) => (
          <ServiceIconItem key={s.id} view={s} open={open === s.id} setOpen={setOpen} pressRef={pressRef} />
        ))}
      </ul>
      {pending ? (
        <p className="flex items-center gap-2 text-[0.8125rem] leading-tight text-cream-muted">
          <span aria-hidden="true" className="size-2 flex-none rounded-full bg-honey" />
          {pending === 1 ? "שירות אחד מחכה לאישור נוסף" : `${pending} שירותים מחכים לאישור נוסף`}
        </p>
      ) : null}
    </div>
  );
}

interface Press {
  type: string;
  at: number;
}

/** A focus or click that follows a pointer press within this window belongs to that press (not to the keyboard). */
const PRESS_MS = 800;

const TILE: Record<ServiceView["status"], string> = {
  connected: "bg-sage text-night shadow-[inset_0_-2px_0_rgb(15_28_23/0.18)] hover:bg-[#AFD5B9]",
  needs_consent: "bg-cream/[0.07] text-cream-muted ring-1 ring-cream/15 ring-inset hover:bg-cream/[0.12] hover:text-cream",
  unavailable: "border border-dashed border-cream-muted/35 text-cream-muted/45 hover:border-cream-muted/60",
  pro_only: "bg-cream/[0.04] text-cream-muted/70 ring-1 ring-honey/35 ring-inset hover:bg-cream/[0.1] hover:text-cream",
  preview: "bg-cream/[0.03] text-cream-muted/50 ring-1 ring-cream/10 ring-inset hover:text-cream-muted",
};

/**
 * The illustrated tiles (SERVICE_ICON_STYLE "tiles"): the picture carries its own dark tile, so the status is drawn on
 * top of it — full colour when connected, faded with the honey dot when it needs an approval, faded with a honey ring
 * in pro, washed out behind a dashed edge when unavailable.
 */
const TILE_PICTURE: Record<ServiceView["status"], string> = {
  connected: "after:ring-sage/55",
  needs_consent: "after:ring-cream/15 [&_img]:opacity-60 hover:[&_img]:opacity-90",
  unavailable: "after:border after:border-dashed after:border-cream-muted/50 [&_img]:opacity-30 [&_img]:grayscale",
  pro_only: "after:ring-honey/60 [&_img]:opacity-45 hover:[&_img]:opacity-80",
  // not connected: a quiet preview of what connecting gives
  preview: "after:ring-cream/10 [&_img]:opacity-45 [&_img]:saturate-50 hover:[&_img]:opacity-80",
};

const DOT: Record<ServiceView["status"], string> = {
  connected: "bg-sage",
  needs_consent: "bg-honey",
  unavailable: "border-[1.5px] border-ink-muted/60",
  pro_only: "border-[1.5px] border-honey",
  preview: "border-[1.5px] border-ink-muted/60",
};

function ServiceIconItem({
  view,
  open,
  setOpen,
  pressRef,
}: {
  view: ServiceView;
  open: boolean;
  setOpen: (fn: ServiceId | null | ((cur: ServiceId | null) => ServiceId | null)) => void;
  pressRef: RefObject<Press>;
}) {
  const tipId = useId();
  const close = useCallback(() => setOpen((cur) => (cur === view.id ? null : cur)), [setOpen, view.id]);
  const show = useCallback(() => setOpen(view.id), [setOpen, view.id]);

  const onPointerDown = (e: ReactPointerEvent) => {
    pressRef.current = { type: e.pointerType, at: Date.now() };
  };
  const pressed = () => Date.now() - pressRef.current.at < PRESS_MS;
  // a mouse click on a button keeps the hover tooltip; a tap, a pen or a keyboard press toggles it
  const onButtonClick = () => {
    const mouse = pressed() && pressRef.current.type === "mouse";
    pressRef.current.at = 0;
    if (mouse) return show();
    setOpen((cur) => (cur === view.id ? null : view.id));
  };
  // a "needs approval" / "in pro" link: a tap first explains (the tooltip says a second tap starts the consent / upgrade)
  const onLinkClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    const touch = pressed() && pressRef.current.type !== "mouse";
    pressRef.current.at = 0;
    if (touch && !open) {
      e.preventDefault();
      show();
    }
  };

  const pictures = SERVICE_ICON_STYLE === "tiles";
  const tile = cn(
    "relative grid size-9 place-items-center rounded-xl transition-[background-color,color,border-color] duration-150 ease-out motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-honey",
    // the status edge sits over the picture (an inset ring under it would be hidden)
    pictures ? "after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-transparent after:ring-inset [&_img]:transition-opacity [&_img]:duration-150" : null,
    pictures ? TILE_PICTURE[view.status] : TILE[view.status],
  );
  const common = {
    className: tile,
    "aria-label": view.name,
    "aria-describedby": tipId,
    "data-status": view.status,
    onPointerDown,
    // focus from the keyboard opens it; focus that a tap or a click gives is handled on click
    onFocus: () => {
      if (!pressed()) show();
    },
    onBlur: close,
  };
  const glyph = (
    <>
      {pictures ? (
        <span className="block size-full overflow-hidden rounded-xl">
          <Image src={serviceTileSrc(view.id)} alt="" width={36} height={36} sizes="36px" draggable={false} className="block size-full" />
        </span>
      ) : (
        <ServiceGlyph icon={view.icon} className="size-5" />
      )}
      {view.status === "needs_consent" ? <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 z-10 size-2.5 rounded-full bg-honey ring-2 ring-night" /> : null}
    </>
  );

  return (
    <li
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") close();
      }}
    >
      {(view.status === "needs_consent" || view.status === "pro_only") && view.href ? (
        <a href={view.href} {...common} onClick={onLinkClick}>
          {glyph}
        </a>
      ) : (
        <button type="button" {...common} onClick={onButtonClick}>
          {glyph}
        </button>
      )}
      <Tooltip id={tipId} view={view} open={open} />
    </li>
  );
}

const EDGE = 8;

/** The paper bubble above the icon (below it when there is no room), shifted to stay inside the viewport. */
function Tooltip({ id, view, open }: { id: string; view: ServiceView; open: boolean }) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ dx: number; below: boolean }>({ dx: 0, below: false });

  // measured from layout sizes (offsetWidth/Height), not the bubble's rect: the zoom-in animation scales that rect
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    const host = el?.parentElement;
    const item = host?.parentElement;
    if (!open || !el || !host || !item) return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const span = host.getBoundingClientRect(); // as wide as the icon, never shifted
    const center = span.left + span.width / 2;
    const half = el.offsetWidth / 2;
    const dx = Math.round(center - half < EDGE ? EDGE - (center - half) : center + half > vw - EDGE ? vw - EDGE - (center + half) : 0);
    const below = item.getBoundingClientRect().top - el.offsetHeight - 10 < EDGE;
    setFit((cur) => (cur.dx === dx && cur.below === below ? cur : { dx, below }));
  }, [open]);

  return (
    <div
      hidden={!open}
      data-open={open ? "" : undefined}
      className={cn("pointer-events-none absolute inset-x-0 z-30 flex justify-center", fit.below ? "top-full pt-2.5" : "bottom-full pb-2.5")}
    >
      <div
        ref={bubbleRef}
        id={id}
        role="tooltip"
        // the `translate` property composes with the entrance animation's `transform`
        style={{ translate: fit.dx ? `${fit.dx}px 0` : undefined }}
        className={cn(
          "surface-light pointer-events-auto relative w-max max-w-[15.5rem] shrink-0 rounded-xl bg-paper px-3.5 py-2.5 text-start text-ink shadow-stage",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        )}
      >
        <p aria-hidden="true" className="flex items-center gap-2 text-[0.875rem] leading-snug font-semibold">
          <span className={cn("size-2 flex-none rounded-full", DOT[view.status])} />
          {view.name}
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">{view.note}</p>
        {view.action ? <p className="mt-1.5 text-[0.8125rem] leading-snug font-semibold text-ink">{view.action}</p> : null}
        {/* the arrow stays over the icon when the bubble shifts; only 10px wide, so it never widens the page */}
        <span aria-hidden="true" className={cn("absolute inset-x-0 mx-auto block size-2.5 rotate-45 bg-paper", fit.below ? "bottom-full" : "top-full")} style={{ translate: `${-fit.dx}px ${fit.below ? "50%" : "-50%"}` }} />
      </div>
    </div>
  );
}
