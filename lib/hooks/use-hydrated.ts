"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * false on the server and during hydration, true afterwards. Lets an entrance animation skip the first paint
 * (server HTML stays visible without JS) and play only on client-side navigations.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
