import { getImageProps } from "next/image";
import { cn } from "@/lib/utils";
import { MascotIsland } from "./mascot-deferred";

/**
 * The felt hoopoe (Daniel's character sheet, public/brand/mascot/): eight poses on one 660×740 transparent canvas,
 * same scale, feet on the bottom baseline (≈ 2.7% above the canvas edge). Native detail ≈ 330×370, so it is shown at
 * most ~340px wide.
 *
 * Images go through the next/image optimizer (resized WebP per screen) via `getImageProps`, rendered as plain <img>:
 * the <Image> component is a client component and would add its JS to the first load of an otherwise static page.
 *
 * Idle motion is CSS (landing.css): "breathe" for a perched bird, "float" for one in the air, a small wiggle around
 * the feet on hover; all of it is off under prefers-reduced-motion.
 */
export type MascotPose =
  | "front"
  | "calling"
  | "listening"
  | "waving"
  | "celebrating"
  | "envelope"
  | "calendar"
  | "thinking";

export const MASCOT_SIZE = { width: 660, height: 740 } as const;
export const PROFILE_SRC = "/brand/mascot/whatsapp-profile.png";

export interface MascotProps {
  pose: MascotPose;
  /** empty = decorative (the text next to it already says it) */
  alt?: string;
  /** the rendered width, for the srcset (e.g. "(min-width: 1024px) 144px, 104px") */
  sizes: string;
  idle?: "breathe" | "float" | "none";
  eager?: boolean;
  className?: string;
}

/** Props for a native <img> of a pose, resized by the optimizer. */
export function mascotImgProps({ pose, alt = "", sizes, eager = false }: MascotProps) {
  const { props } = getImageProps({
    src: `/brand/mascot/${pose}.webp`,
    width: MASCOT_SIZE.width,
    height: MASCOT_SIZE.height,
    alt,
    sizes,
    loading: eager ? "eager" : "lazy",
  });
  return props;
}

export const mascotClass = (idle: MascotProps["idle"] = "breathe", className?: string) =>
  cn("alze-mascot block", idle !== "none" && `alze-${idle}`, className);

/** The hoopoe, rendered immediately (used inside client parts that load after the first paint anyway). */
export function Mascot(p: MascotProps) {
  return (
    <span className={mascotClass(p.idle, p.className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- optimizer URLs from getImageProps, no client JS */}
      <img
        {...mascotImgProps(p)}
        alt={p.alt ?? ""}
        draggable={false}
        className="block h-auto w-full select-none"
      />
    </span>
  );
}

/**
 * The hoopoe in a server-rendered section: the optimized URLs are computed here, the <img> is added after hydration
 * (MascotIsland) so the first paint never waits on her; an empty box of her proportions holds the place meanwhile.
 */
export function DeferredMascot(p: MascotProps) {
  return (
    <MascotIsland
      img={mascotImgProps(p)}
      alt={p.alt ?? ""}
      className={mascotClass(p.idle, p.className)}
    />
  );
}

/** Her WhatsApp profile picture (the chat header and notification avatar). Decorative: her name is next to it. */
export function ProfileAvatar({ size, className }: { size: number; className?: string }) {
  const { props } = getImageProps({ src: PROFILE_SRC, width: size, height: size, alt: "" });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- optimizer URLs from getImageProps, no client JS
    <img
      {...props}
      alt=""
      className={cn("block flex-none rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The profile picture as a CSS image-set (for places that only take a background), per the next/image docs. */
export function profileBackground(size: number): string {
  const { props } = getImageProps({ alt: "", width: size, height: size, src: PROFILE_SRC });
  const set = (props.srcSet ?? "")
    .split(", ")
    .filter(Boolean)
    .map((entry) => {
      const [url, dpi] = entry.split(" ");
      return `url("${url}") ${dpi}`;
    })
    .join(", ");
  return set ? `image-set(${set})` : `url("${props.src}")`;
}
