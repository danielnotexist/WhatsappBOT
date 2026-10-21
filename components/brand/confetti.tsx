"use client";

import { useEffect, useRef } from "react";
import { palette } from "@/lib/design/tokens";

/**
 * One burst of confetti when mounted (/start/ready). canvas-confetti is loaded on demand, draws on our own
 * canvas (no worker → no blob: URL for the CSP), and does nothing under prefers-reduced-motion.
 */
export function Confetti({ delayMs = 250 }: { delayMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let reset: (() => void) | undefined;
    const timer = window.setTimeout(async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;
      const fire = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
      reset = () => fire.reset();
      const colors = [palette.honey, palette.sage, palette.dust, palette.cream, palette.moss];
      const shared = { colors, ticks: 260, gravity: 0.9, scalar: 1.05, disableForReducedMotion: true };
      void fire({ ...shared, particleCount: 90, spread: 70, startVelocity: 48, origin: { x: 0.5, y: 0.35 } });
      void fire({ ...shared, particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } });
      void fire({ ...shared, particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      reset?.();
    };
  }, [delayMs]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="confetti" className="pointer-events-none fixed inset-0 z-50 size-full" />;
}
