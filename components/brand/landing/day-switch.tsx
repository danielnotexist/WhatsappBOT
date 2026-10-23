"use client";

import { lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";
import { useMotionStopped } from "@/lib/a11y/store";

/**
 * Pinned scroll scene only where it reads well and is wanted: a large enough screen, motion allowed. Everywhere else
 * (and on the server, and until the chunk arrives) the server-rendered vertical sequence stays. The pinned scene and
 * the motion library are loaded only when this query matches (and "עצירת אנימציות" in the accessibility menu is off).
 */
export const PINNED_QUERY =
  "(min-width: 64rem) and (min-height: 40rem) and (prefers-reduced-motion: no-preference)";

const DayPinned = lazy(() => import("./day-pinned"));

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(PINNED_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

export function usePinnedScene(): boolean {
  const stopped = useMotionStopped();
  const wanted = useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(PINNED_QUERY).matches
        : false,
    () => false,
  );
  return wanted && !stopped;
}

export function DaySwitch({ children }: { children: ReactNode }) {
  const pinned = usePinnedScene();
  if (!pinned) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <DayPinned />
    </Suspense>
  );
}
