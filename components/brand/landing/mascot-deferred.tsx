"use client";

import type { CSSProperties, ImgHTMLAttributes, ReactNode } from "react";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * Client half of DeferredMascot (mascot.tsx): adds the hoopoe's <img> after hydration, so the page's first paint (the
 * headline) never waits on her images — the hero's choreography has her land a beat after the phone anyway. Until
 * then an empty box of her exact proportions holds the place, so nothing moves when she appears. Without JS she is
 * simply absent: she is decorative or described by the text around her.
 */
/**
 * A wrapper whose inline style (custom properties that point at images) applies only after hydration, so those images
 * are not requested before the first paint. Used for the hero chat's avatar swap (landing.css).
 */
export function StyleAfterHydration({
  style,
  className,
  children,
}: {
  style: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  return (
    <div className={className} style={hydrated ? style : undefined}>
      {children}
    </div>
  );
}

export function MascotIsland({
  img,
  alt,
  className,
}: {
  img: ImgHTMLAttributes<HTMLImageElement>;
  alt: string;
  className: string;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return <span aria-hidden="true" className={cn(className, "aspect-[660/740]")} />;
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- optimizer URLs from getImageProps, no client JS */}
      <img {...img} alt={alt} draggable={false} className="block h-auto w-full select-none" />
    </span>
  );
}
