"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { DemoCodeNote } from "./DemoCodeNote";

/*
 * DEMO_MODE of the RUNNING server, on the client. The DemoBar (root layout, on screen on every page and never
 * re-rendered by a client-side navigation) reads it per request and hands it over here once; from then on a step can
 * draw its demo parts in the same commit as the step itself — nothing streams in after the card (and nothing makes the
 * paper jump). Until the DemoBar has reported (a direct page load, before its part of the stream lands), the build's
 * value stands in.
 */

let reported: boolean | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rendered by the DemoBar's request-time part (components/demo/DemoBar.tsx) with the server's isDemo(). */
export function DemoFlag({ on }: { on: boolean }) {
  useLayoutEffect(() => {
    if (reported === on) return;
    reported = on;
    for (const listener of listeners) listener();
  }, [on]);
  return null;
}

/** DEMO_MODE as the running server reported it, or `atBuild` (the build's value) until it has. */
export function useDemoMode(atBuild: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reported ?? atBuild,
    () => atBuild,
  );
}

/** For tests: forget what the server reported. */
export function resetDemoFlagForTests() {
  reported = null;
}

/**
 * The code card's demo note (`demoNote` of CodeStep), drawn synchronously with the card: `atBuild` is the page's
 * isDemo() at build time, the running server's value (DemoFlag) wins as soon as it is known.
 */
export function DemoCodeNoteLive({ atBuild }: { atBuild: boolean }) {
  return useDemoMode(atBuild) ? <DemoCodeNote /> : null;
}
