"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useMotionStopped } from "@/lib/a11y/store";

/**
 * "עצירת אנימציות" for the motion library: with the switch on, every motion component skips transform and layout
 * animations. With it off this is motion's own default ("never"), so nothing changes. Our components also read the
 * switch through lib/hooks/use-reduced-motion.ts; CSS animations stop in app/globals.css.
 */
export function A11yMotion({ children }: { children: ReactNode }) {
  const stopped = useMotionStopped();
  return <MotionConfig reducedMotion={stopped ? "always" : "never"}>{children}</MotionConfig>;
}
