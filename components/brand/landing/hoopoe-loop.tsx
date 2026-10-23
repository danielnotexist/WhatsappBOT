"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMotionStopped } from "@/lib/a11y/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/** The hoopoe's 8-second loop (public/brand/video/): VP9 first, H.264 for Safari, and its first frame as the poster. */
export const HOOPOE_LOOP = {
  webm: "/brand/video/hoopoe-loop.webm",
  mp4: "/brand/video/hoopoe-loop.mp4",
  poster: "/brand/video/hoopoe-loop-poster.webp",
  width: 1280,
  height: 720,
} as const;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/*
 * The device setting, live. Not lib/hooks/use-reduced-motion.ts: that one goes through motion/react, which the landing
 * page keeps out of its first load (day-switch.tsx loads it only for the pinned scene).
 */
function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
const deviceReduced = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches;

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const tabVisible = () => document.visibilityState !== "hidden";

/**
 * The hoopoe loop as a framed card (the clip has its own green backdrop, so it never floats on the page): a fixed
 * aspect-ratio box - 4:3 on phones (the bird larger, the sparkles cropped at the sides), 16:9 from `sm` - with the
 * poster underneath, so nothing moves when the video arrives. Decorative: the section's headline says who she is.
 *
 * The <video> exists only on the client, once the card first comes into view, and only when motion is allowed: under
 * prefers-reduced-motion or "עצירת אנימציות" (data-a11y-motion on <html>) the card is the poster alone, and so it is
 * without JS. It plays while it is on screen and the tab is visible, and pauses otherwise.
 */
export function HoopoeLoop({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const stopped = useMotionStopped();
  const reduced = useSyncExternalStore(subscribeReduced, deviceReduced, () => false);
  const visible = useSyncExternalStore(subscribeVisibility, tabVisible, () => true);
  const motion = hydrated && !reduced && !stopped;

  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const observable = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    const el = frameRef.current;
    if (!motion || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        setInView(on);
        if (on) setSeen(true);
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  // without IntersectionObserver (very old browsers) it simply plays while the tab is visible
  const onScreen = observable ? inView : true;
  const mounted = motion && (observable ? seen : true);
  const playing = mounted && onScreen && visible;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.muted = true; // the autoplay policy reads the property, not the attribute
      void v.play()?.catch(() => {
        // autoplay refused (data saver, low power): the poster frame stays
      });
    } else {
      v.pause();
    }
  }, [playing, mounted]);

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      data-state={mounted ? "video" : "poster"}
      className={cn(
        "relative isolate aspect-[4/3] overflow-hidden rounded-card bg-night-2 shadow-stage sm:aspect-video",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the same file as the video's poster, fetched once */}
      <img
        src={HOOPOE_LOOP.poster}
        alt=""
        width={HOOPOE_LOOP.width}
        height={HOOPOE_LOOP.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-cover select-none"
      />
      {mounted ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={HOOPOE_LOOP.poster}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          className="absolute inset-0 size-full object-cover"
        >
          <source src={HOOPOE_LOOP.webm} type="video/webm" />
          <source src={HOOPOE_LOOP.mp4} type="video/mp4" />
        </video>
      ) : null}
      {/* the hairline sits over the picture, so the clip's edge never shows a seam against the rounded corner */}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-cream/10 ring-inset" />
    </div>
  );
}
