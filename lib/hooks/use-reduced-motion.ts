"use client";

import { useReducedMotion as useDeviceReducedMotion } from "motion/react";
import { useMotionStopped } from "@/lib/a11y/store";

/**
 * Reduced motion for our components: the device setting (motion's own hook), or "עצירת אנימציות" from the
 * accessibility menu. Use this instead of importing `useReducedMotion` from motion directly.
 */
export function useReducedMotion(): boolean {
  const device = useDeviceReducedMotion();
  const stopped = useMotionStopped();
  return Boolean(device) || stopped;
}
