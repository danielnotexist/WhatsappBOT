"use client";

import { useEffect } from "react";

/**
 * Lenis smooth scrolling — on the landing page only, and only for a mouse/trackpad with motion allowed (touch scrolling
 * is already smooth, and reduced motion means native scrolling). Loaded after hydration, destroyed on navigation, so
 * the rest of the site keeps the browser's own scrolling. In-page anchor links (#pricing…) glide too.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches)
      return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.11 });
      destroy = () => lenis.destroy();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);
  return null;
}
