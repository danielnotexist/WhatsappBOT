"use client";

import { useSyncExternalStore } from "react";
import { applySettings, DEFAULT_SETTINGS, normalize, readStored, TOGGLE_ATTRS, writeStored, type A11ySettings } from "./settings";

/* ---- a tiny external store, so the menu, the motion switch and Lenis all see the same value ---- */

let current: A11ySettings | null = null;
const listeners = new Set<() => void>();

function snapshot(): A11ySettings {
  if (current === null) current = readStored();
  return current;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getSettings(): A11ySettings {
  return typeof window === "undefined" ? DEFAULT_SETTINGS : snapshot();
}

/** Applies, saves and tells every subscriber. */
export function setSettings(next: A11ySettings): void {
  current = normalize(next);
  applySettings(current);
  writeStored(current);
  for (const l of listeners) l();
}

/** Tests only: forget the cached value (the next read goes back to storage). */
export function resetStoreForTests(): void {
  current = null;
}

/** The settings, live. Server and hydration: the defaults (the inline script already styled the page). */
export function useA11ySettings(): A11ySettings {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SETTINGS);
}

/** "עצירת אנימציות" is on. */
export function useMotionStopped(): boolean {
  return useA11ySettings().motion;
}

/** The same, outside React (read from <html>, which is always current). */
export function isMotionStopped(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(TOGGLE_ATTRS.motion);
}
