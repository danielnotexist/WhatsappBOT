"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * עלזה's hoopoe — the soft 3D renders Daniel generated (public/brand/mascot/, transparent WebP). Every pose shares one
 * 660×740 canvas at the same scale with the feet on the bottom baseline, so poses can swap in place between steps.
 * Display at most ~340px wide. MascotPlaceholder (the flat SVG) stays only as a fallback.
 */
export type MascotPoseName = "front" | "calling" | "listening" | "waving" | "celebrating" | "envelope" | "calendar" | "thinking";

export const MASCOT_CANVAS = { width: 660, height: 740 } as const;

export function mascotSrc(pose: MascotPoseName): string {
  return `/brand/mascot/${pose}.webp`;
}

/**
 * One pose, sized by its width (className). A slow idle sway around the feet — a few degrees over seven seconds —
 * stops under reduced motion. Decorative by default (`alt=""`); pass Hebrew alt text where the bird carries meaning.
 */
export function Mascot({
  pose,
  alt = "",
  sizes = "160px",
  eager = false,
  idle = true,
  className,
}: {
  pose: MascotPoseName;
  alt?: string;
  /** the rendered width, for the image optimiser (e.g. "(min-width: 1024px) 144px, 88px") */
  sizes?: string;
  /** above the fold: load at once instead of lazily */
  eager?: boolean;
  idle?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const move = idle && !reduce;
  return (
    <motion.div
      data-mascot={pose}
      className={cn("pointer-events-none origin-bottom select-none", className)}
      initial={false}
      animate={move ? { rotate: [0, -1.6, 0, 1.2, 0], y: [0, -2, 0, -1, 0] } : { rotate: 0, y: 0 }}
      transition={move ? { duration: 7, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
    >
      <Image
        src={mascotSrc(pose)}
        alt={alt}
        width={MASCOT_CANVAS.width}
        height={MASCOT_CANVAS.height}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className="block h-auto w-full"
      />
    </motion.div>
  );
}

/** עלזה's WhatsApp profile photo (whatsapp-profile.png, 640×640 on its own green), zoomed to head and chest for round avatars. */
export function MascotAvatar({ className, sizes = "64px", alt = "" }: { className?: string; sizes?: string; alt?: string }) {
  return (
    <span className={cn("relative block overflow-hidden rounded-full bg-night-2", className)}>
      <Image src="/brand/mascot/whatsapp-profile.png" alt={alt} fill sizes={sizes} draggable={false} className="origin-[50%_30%] scale-[1.7] object-cover" />
    </span>
  );
}
