"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMotionStopped } from "@/lib/a11y/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * The brand film (media/brand-film, the 1920x1080 cut: 32 s, 16 bars of "Ramp It Up" at 120 BPM, a seamless loop), as
 * the web encodes in public/brand/video/: VP9 first, H.264 (with its soundtrack) for Safari, and a poster frame.
 */
export const BRAND_FILM = {
  webm: "/brand/video/brand-film.webm",
  mp4: "/brand/video/brand-film.mp4",
  poster: "/brand/video/brand-film-poster.webp",
  width: 1920,
  height: 1080,
} as const;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/*
 * The device setting, live. Not lib/hooks/use-reduced-motion.ts: that one goes through motion/react, which the landing
 * keeps out of its first load.
 */
function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
const deviceReduced = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches;

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const tabVisible = () => document.visibilityState !== "hidden";

/**
 * The film in a framed card: a 16:9 box (rounded-card, shadow-stage, a hairline over the picture - the film's night is
 * the page's night, so the frame is what sets it apart) with the poster underneath, so nothing moves when the video
 * arrives. The words of the film are on the page around it (the section's heading and line), so the picture itself is
 * decorative; the one control is the sound.
 *
 * The <video> exists only on the client, once the card first comes into view, and only when motion is allowed: under
 * prefers-reduced-motion or "עצירת אנימציות" (data-a11y-motion on <html>) the card is the poster alone, and so it is
 * without JS. It plays muted (autoplay muted loop playsInline, preload metadata) while it is on screen and the tab is
 * visible, and pauses otherwise. "הפעלת צליל" / "השתקה" turns its soundtrack on and off.
 */
export function BrandFilm({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const stopped = useMotionStopped();
  const reduced = useSyncExternalStore(subscribeReduced, deviceReduced, () => false);
  const visible = useSyncExternalStore(subscribeVisibility, tabVisible, () => true);
  const motion = hydrated && !reduced && !stopped;

  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const [sound, setSound] = useState(false);
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
    // the autoplay policy reads the property, not the attribute
    v.muted = !sound;
    if (playing) {
      void v.play()?.catch(() => {
        // autoplay refused (data saver, low power): the poster frame stays
      });
    } else {
      v.pause();
    }
  }, [playing, mounted, sound]);

  return (
    <div
      ref={frameRef}
      data-state={mounted ? "video" : "poster"}
      className={cn("relative isolate aspect-video overflow-hidden rounded-card bg-night-2 shadow-stage", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the same file as the video's poster, fetched once */}
      <img
        src={BRAND_FILM.poster}
        alt=""
        width={BRAND_FILM.width}
        height={BRAND_FILM.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-cover select-none"
      />
      {mounted ? (
        <video
          ref={videoRef}
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={BRAND_FILM.poster}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          className="absolute inset-0 size-full object-cover"
        >
          <source src={BRAND_FILM.webm} type="video/webm" />
          <source src={BRAND_FILM.mp4} type="video/mp4" />
        </video>
      ) : null}
      {/* the hairline sits over the picture, so the clip's edge never shows a seam against the rounded corner */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-cream/12 ring-inset" />
      {mounted ? (
        <button
          type="button"
          onClick={() => setSound((s) => !s)}
          aria-label={sound ? "השתקה" : "הפעלת צליל"}
          data-sound={sound ? "on" : "off"}
          className="absolute end-2.5 bottom-2.5 grid size-9 place-items-center rounded-full bg-night/75 text-cream ring-1 ring-cream/20 backdrop-blur-sm transition-colors hover:bg-night focus-visible:ring-2 focus-visible:ring-honey focus-visible:outline-none sm:end-4 sm:bottom-4 sm:size-11"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4z" className="fill-current" />
            {sound ? (
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            ) : (
              <path d="m16 9.5 5 5m0-5-5 5" />
            )}
          </svg>
        </button>
      ) : null}
    </div>
  );
}
