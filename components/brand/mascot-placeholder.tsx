import { cn } from "@/lib/utils";

export type MascotPose = "call" | "listen" | "wave" | "celebrate";

/**
 * Placeholder for עלזה's mascot — a soft plush (felt) hoopoe — until the 3D renders arrive (round plan §2, OpenRouter).
 * Same frame and proportions the final image will use (square, subject centred), so swapping it is a one-file change.
 * Decorative by default; pass `label` to expose it as an image.
 */
export function MascotPlaceholder({ pose = "call", label, className }: { pose?: MascotPose; label?: string; className?: string }) {
  const crestTilt = pose === "celebrate" ? -8 : pose === "listen" ? 6 : 0;
  return (
    <svg
      viewBox="0 0 200 200"
      className={cn("block", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {/* crest: five rounded feathers, honey with dark tips */}
      <g transform={`rotate(${crestTilt} 112 56)`}>
        {[-44, -22, 0, 22, 44].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 112 58)`}>
            <path d="M112 58c-7-14-8-30 0-44 8 14 7 30 0 44z" fill="#E7B65C" />
            <path d="M112 14c-3.2 5.2-4.4 10-4.2 14.2h8.4c.2-4.2-1-9-4.2-14.2z" fill="#13241C" />
          </g>
        ))}
      </g>
      {/* body */}
      <ellipse cx="98" cy="128" rx="58" ry="50" fill="#E3A47A" />
      <ellipse cx="106" cy="140" rx="36" ry="30" fill="#F1CBA6" />
      {/* felt seam */}
      <path d="M78 116c10 30 40 44 66 34" fill="none" stroke="#C98763" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />
      {/* wing: zebra stripes */}
      <g transform={pose === "wave" ? "rotate(-28 70 120)" : undefined}>
        <path d="M44 112c-8 32 14 58 46 60 10 0 16-4 20-10-26-6-48-26-66-50z" fill="#13241C" />
        <path d="M54 134c10 10 22 18 36 22M50 122c10 12 24 22 40 28M62 150c8 6 18 10 28 12" stroke="#EFE9DC" strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>
      {/* head */}
      <circle cx="120" cy="74" r="34" fill="#E3A47A" />
      <ellipse cx="128" cy="90" rx="7" ry="4" fill="#D9806C" opacity="0.55" />
      {/* eye */}
      <circle cx="132" cy="70" r="5.5" fill="#13241C" />
      <circle cx="133.8" cy="68.2" r="1.8" fill="#EFE9DC" />
      {/* long curved beak */}
      <path d="M150 78c18 2 32 10 42 24-14-8-28-12-44-14z" fill="#3B2A1E" />
      {/* feet */}
      <path d="M86 174v10M104 176v10" stroke="#3B2A1E" strokeWidth="4" strokeLinecap="round" />
      {pose === "listen" ? <circle cx="110" cy="70" r="7" fill="none" stroke="#9CC9A8" strokeWidth="3" /> : null}
    </svg>
  );
}
