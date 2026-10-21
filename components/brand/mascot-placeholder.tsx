import { cn } from "@/lib/utils";

export type MascotPose = "call" | "listen" | "wave" | "celebrate";

/** The flat hoopoe's colours: cinnamon body, a paler breast, ink-and-paper wing bars (the bird's own palette). */
const C = {
  body: "#D7926A",
  breast: "#EDC7A2",
  crest: "#DE9A5E",
  ink: "#13241C",
  bar: "#F2EADA",
  bill: "#3A2D24",
  leg: "#5A4A3F",
} as const;

/** One crest feather pointing up from (0,0): narrow at the base, widest near the tip, rounded end. */
function feather(length: number, width: number): string {
  const w = width;
  const l = length;
  return `M${-w * 0.28} 0C${-w * 0.62} ${-l * 0.42} ${-w * 0.62} ${-l * 0.86} 0 ${-l}C${w * 0.62} ${-l * 0.86} ${w * 0.62} ${-l * 0.42} ${w * 0.28} 0Z`;
}

const CREST_ANGLES = [-100, -76, -53, -31, -10, 10];
const CREST_LENGTHS = [46, 58, 64, 63, 56, 44];

/** Pose → how far the crest fans out and rises, and whether the wing lifts. */
const POSES: Record<MascotPose, { spread: number; raise: number; wing: number }> = {
  call: { spread: 1, raise: 1, wing: 0 },
  listen: { spread: 0.8, raise: 0.86, wing: 0 },
  wave: { spread: 1, raise: 1, wing: 16 },
  celebrate: { spread: 1.1, raise: 1.12, wing: 8 },
};

const BODY = "M150 90C158 118 150 148 120 160C98 168 70 164 52 150C62 126 84 102 114 92C128 87 142 86 150 90Z";
const WING = "M114 108C98 100 72 110 54 126C46 133 40 140 34 148C56 150 84 148 106 140C120 134 124 118 114 108Z";
/** Four paper bars, computed to sit inside the wing outline (no clipPath → no ids to collide when several birds share a page). */
const WING_BARS =
  "M86.3 111.9L103.2 138.9L109.1 135.2L92.3 108.2ZM71.7 116.6L88.1 142.7L94 139L77.7 112.9ZM58.8 124.4L71.8 145.2L77.3 141.8L64.3 121ZM47.8 134.7L55.1 146.4L60.2 143.3L52.9 131.6Z";

/**
 * עלזה's hoopoe (דוכיפת) as a flat illustration — placeholder until the soft 3D renders arrive (round plan §2).
 * Drawn from the real bird: a fanned cinnamon crest with paper bands and ink tips, a long decurved bill, ink wings with
 * paper bars, a banded tail. Same square frame the final image will use, so swapping it is a one-file change.
 *
 * `framing="portrait"` crops to head and crest for round avatars (WhatsApp header, incoming call).
 * Decorative by default; pass `label` to expose it as an image.
 */
export function MascotPlaceholder({
  pose = "call",
  label,
  className,
  framing = "full",
}: {
  pose?: MascotPose;
  label?: string;
  className?: string;
  framing?: "full" | "portrait";
}) {
  const p = POSES[pose];
  return (
    <svg
      viewBox={framing === "portrait" ? "60 6 146 146" : "0 0 200 200"}
      className={cn("block", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-pose={pose}
    >
      {/* tail: ink with one paper band */}
      <g transform="rotate(32 64 148)">
        <rect x="10" y="139" width="62" height="19" rx="9.5" fill={C.ink} />
        <rect x="22" y="139" width="9" height="19" fill={C.bar} />
      </g>
      {/* crest, behind the head: each feather is three nested shapes — ink tip, paper band, cinnamon */}
      {CREST_ANGLES.map((a, i) => {
        const len = CREST_LENGTHS[i]! * p.raise;
        return (
          <g key={a} transform={`translate(124 74) rotate(${a * p.spread - 6})`}>
            <path d={feather(len, 11)} fill={C.ink} />
            <path d={feather(len * 0.87, 11 * 0.95)} fill={C.bar} />
            <path d={feather(len * 0.74, 11 * 0.9)} fill={C.crest} />
          </g>
        );
      })}
      {/* body and the paler breast */}
      <path d={BODY} fill={C.body} />
      <path d="M150 90C158 118 150 148 120 160C112 150 116 120 132 99C138 92 145 89 150 90Z" fill={C.breast} />
      {/* legs */}
      <path d="M110 160L106 180M98 180H112M122 156V178M114 178H128" stroke={C.leg} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* wing */}
      <g transform={p.wing ? `rotate(${p.wing} 112 108)` : undefined}>
        <path d={WING} fill={C.ink} />
        <path d={WING_BARS} fill={C.bar} />
      </g>
      {/* head, bill, eye */}
      <circle cx="134" cy="80" r="22" fill={C.body} />
      <path d="M150 80C166 82 182 89 194 102C180 94 166 90 151 89Z" fill={C.bill} />
      <circle cx="140" cy="76" r="3.6" fill={C.ink} />
      <circle cx="141.2" cy="74.8" r="1.1" fill={C.bar} />
    </svg>
  );
}
