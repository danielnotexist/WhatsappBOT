import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { rtlUnits } from "./rtl";

/**
 * The share images (opengraph-image.tsx of /, /pricing and each /for/<profession>), 1200×630 in "לילה ירוק": the
 * night stage with a low honey dawn, the crest and the name, a honey kicker, the headline in cream and a muted line.
 * The site font (Varela Round, lib/fonts.ts) is loaded from the repo's TTF — next/og takes ttf / otf / woff only, and
 * next/font serves woff2 — and every Hebrew line is laid out in visual order (./rtl.ts), since satori has no bidi.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const C = { night: "#0F1C17", night2: "#16261F", line: "#26382F", cream: "#EFE9DC", muted: "#A3AE9F", honey: "#E7B65C" } as const;

let font: Promise<Buffer> | null = null;
/** assets/fonts/VarelaRound-Regular.ttf (SIL OFL 1.1, assets/fonts/VarelaRound-OFL.txt), read once per process. */
function varelaRound(): Promise<Buffer> {
  font ??= readFile(join(process.cwd(), "assets/fonts/VarelaRound-Regular.ttf"));
  return font;
}

/** A Hebrew line that wraps right to left: one flex item per word, in visual order. */
function RtlText({ text, size, color, lineHeight = 1.2, maxWidth }: { text: string; size: number; color: string; lineHeight?: number; maxWidth: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "flex-start", maxWidth, fontSize: size, color, lineHeight }}>
      {rtlUnits(text).map((u, i) => (
        <div key={i} style={{ display: "flex", marginLeft: Math.round(size * 0.28), whiteSpace: "pre" }}>
          {u}
        </div>
      ))}
    </div>
  );
}

/** The crest of the wordmark (components/brand/wordmark.tsx CrestMark), drawn in honey. */
function Crest({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {[-36, -12, 12, 36].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 21)`}>
          <path d="M12 21c-2.4-5-2.6-10.6 0-15.6 2.6 5 2.4 10.6 0 15.6z" fill={C.honey} />
          <circle cx="12" cy="6.6" r="1.25" fill={C.night} />
        </g>
      ))}
    </svg>
  );
}

export interface OgCard {
  /** the small honey line above the headline ("מחירים", "לפי מקצוע: עורכי דין") */
  kicker?: string;
  title: string;
  subtitle?: string;
}

export async function ogImage(card: OgCard): Promise<ImageResponse> {
  const data = await varelaRound();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px 60px",
          backgroundColor: C.night,
          backgroundImage: `radial-gradient(80% 70% at 50% 125%, rgba(231,182,92,0.34), rgba(216,169,156,0.1) 55%, rgba(15,28,23,0) 78%)`,
          fontFamily: "Varela Round",
          color: C.cream,
        }}
      >
        {/* the name at the inline start (right), the address at the end */}
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
            <Crest size={52} />
            <div style={{ display: "flex", marginRight: 14, fontSize: 52, lineHeight: 1, color: C.cream }}>{rtlUnits(BRAND.name)[0]}</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: C.muted, letterSpacing: 1 }}>{BRAND.domain}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {card.kicker ? (
            <div style={{ display: "flex", marginBottom: 22 }}>
              <RtlText text={card.kicker} size={32} color={C.honey} maxWidth={1040} />
            </div>
          ) : null}
          <RtlText text={card.title} size={card.title.length > 34 ? 66 : 78} color={C.cream} lineHeight={1.14} maxWidth={1040} />
          {card.subtitle ? (
            <div style={{ display: "flex", marginTop: 28 }}>
              <RtlText text={card.subtitle} size={32} color={C.muted} lineHeight={1.4} maxWidth={980} />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", height: 4, width: 120, alignSelf: "flex-end", borderRadius: 4, backgroundColor: C.honey }} />
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Varela Round", data, weight: 400, style: "normal" }],
    },
  );
}
