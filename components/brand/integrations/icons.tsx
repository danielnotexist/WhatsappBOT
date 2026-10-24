import { useId, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Product marks of the systems she works with (lib/integrations/catalogue.ts), as inline SVG.
 *
 * Third-party trademarks: each mark belongs to its owner (Google LLC, Microsoft Corporation, monday.com Ltd., WhatsApp LLC / Meta) and is
 * shown only to say that she works with the product ("works with" - nominative use), at its own proportions and
 * colours, straight on our night and paper surfaces (lib/integrations/tiles.ts "marks"; "svg" puts them on a white
 * chip). Never recolour, crop or combine them with our own marks. Before production: legal check against Google's and Microsoft's brand guidelines
 * (docs/PROGRESS.md).
 *
 * Geometry follows the owners' published icons: Google's 2020 Workspace icons (Gmail, Calendar, Drive, Docs, Sheets,
 * Slides, Meet; Tasks redrawn from Google's 96dp PNG), Microsoft's Fluent product icons from its brand-icons CDN
 * (48px set; the faint shadow layers under the front plate are left out - invisible at tile size), and monday.com's
 * three-shape mark. Always decorative (aria-hidden): the name is next to the tile or in its accessible label.
 */

type IconProps = { className?: string };

function Svg({
  viewBox,
  className,
  children,
}: {
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox={viewBox} className={cn("block", className)} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** A document-unique id for gradients and clip paths (several copies of a mark share a page). */
function useSvgId(): string {
  return `alze-i${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The front plate with the letter, shared by Microsoft's Office icons: a 22×22 rounded square with a gradient. */
function OfficePlate({
  id,
  stops,
  glyph,
}: {
  id: string;
  stops: [string, string, string];
  glyph: string;
}) {
  return (
    <>
      <defs>
        <linearGradient
          id={id}
          x1="5.822"
          y1="11.568"
          x2="20.178"
          y2="36.432"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={stops[0]} />
          <stop offset=".5" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>
      <rect x="2" y="13" width="22" height="22" rx="1.833" fill={`url(#${id})`} />
      <path d={glyph} fill="#fff" />
    </>
  );
}

// ---------------------------------------------------------------- Google

export function GmailIcon({ className }: IconProps) {
  return (
    <Svg viewBox="52 42 88 66" className={className}>
      <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
      <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
    </Svg>
  );
}

export function GoogleCalendarIcon({ className }: IconProps) {
  return (
    <Svg viewBox="0 0 200 200" className={className}>
      <g transform="translate(3.75 3.75)">
        <path
          fill="#fff"
          d="M148.882 43.618l-47.368-5.263-57.895 5.263-5.264 52.632 5.263 52.632 52.632 6.579 52.632-6.579 5.263-53.947z"
        />
        <path
          fill="#1a73e8"
          d="M65.211 125.276c-3.934-2.658-6.658-6.539-8.145-11.671l9.132-3.763c.829 3.158 2.276 5.605 4.342 7.342 2.053 1.737 4.553 2.592 7.474 2.592 2.987 0 5.553-.908 7.697-2.724s3.224-4.132 3.224-6.934c0-2.868-1.132-5.211-3.395-7.026s-5.105-2.724-8.5-2.724h-5.276v-9.039H76.5c2.921 0 5.382-.789 7.382-2.368 2-1.579 3-3.737 3-6.487 0-2.447-.895-4.395-2.684-5.855s-4.053-2.197-6.803-2.197c-2.684 0-4.816.711-6.395 2.145s-2.724 3.197-3.447 5.276l-9.039-3.763c1.197-3.395 3.395-6.395 6.618-8.987 3.224-2.592 7.342-3.895 12.342-3.895 3.697 0 7.026.711 9.974 2.145 2.947 1.434 5.263 3.421 6.934 5.947 1.671 2.539 2.5 5.382 2.5 8.539 0 3.224-.776 5.947-2.329 8.184-1.553 2.237-3.461 3.947-5.724 5.145v.539c2.987 1.25 5.421 3.158 7.342 5.724 1.908 2.566 2.868 5.632 2.868 9.211s-.908 6.776-2.724 9.579c-1.816 2.803-4.329 5.013-7.513 6.618-3.197 1.605-6.789 2.421-10.776 2.421C73.408 129.263 69.145 127.934 65.211 125.276zM121.25 79.961l-9.974 7.25-5.013-7.605 17.987-12.974h6.895v61.197h-9.895z"
        />
        <path
          fill="#ea4335"
          d="M148.882 196.25l47.368-47.368-23.684-10.526-23.684 10.526-10.526 23.684z"
        />
        <path fill="#34a853" d="M33.092 172.566l10.526 23.684h105.263v-47.368H43.618z" />
        <path
          fill="#4285f4"
          d="M12.039-3.75C3.316-3.75-3.75 3.316-3.75 12.039v136.842l23.684 10.526 23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75z"
        />
        <path
          fill="#188038"
          d="M-3.75 148.882v31.579c0 8.724 7.066 15.789 15.789 15.789h31.579v-47.368z"
        />
        <path fill="#fbbc04" d="M148.882 43.618v105.263h47.368V43.618l-23.684-10.526z" />
        <path
          fill="#1967d2"
          d="M196.25 43.618V12.039c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368z"
        />
      </g>
    </Svg>
  );
}

export function GoogleDriveIcon({ className }: IconProps) {
  return (
    <Svg viewBox="0 0 87.3 78" className={className}>
      <path
        fill="#0066da"
        d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
      />
      <path
        fill="#00ac47"
        d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"
      />
      <path
        fill="#ea4335"
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z"
      />
      <path
        fill="#00832d"
        d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
      />
      <path
        fill="#2684fc"
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
      />
      <path
        fill="#ffba00"
        d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"
      />
    </Svg>
  );
}

/** Docs, Sheets and Slides share Google's 2020 page: the sheet, its folded corner and a white glyph. */
function GooglePage({
  className,
  page,
  fold,
  glyph,
}: IconProps & { page: string; fold: string; glyph: ReactNode }) {
  return (
    <Svg viewBox="0 0 64 88" className={className}>
      <path
        fill={page}
        d="M58 88H6c-3.3 0-6-2.7-6-6V6c0-3.3 2.7-6 6-6h36l22 22v60c0 3.3-2.7 6-6 6z"
      />
      <path fill={fold} d="M42 0l22 22H42z" />
      {glyph}
    </Svg>
  );
}

export function GoogleDocsIcon({ className }: IconProps) {
  return (
    <GooglePage
      className={className}
      page="#3086f6"
      fold="#0c67d6"
      glyph={<path fill="#fdffff" d="M50 39H14v-5h36zm0 7H14v5h36zm-10 12H14v5h26z" />}
    />
  );
}

export function GoogleSheetsIcon({ className }: IconProps) {
  return (
    <GooglePage
      className={className}
      page="#34a853"
      fold="#188038"
      glyph={
        <path
          fill="#fff"
          d="M12 34v29h40V34zm17.5 24H17v-7h12.5zm0-12H17v-7h12.5zM47 58H34.5v-7H47zm0-12H34.5v-7H47z"
        />
      }
    />
  );
}

export function GoogleSlidesIcon({ className }: IconProps) {
  return (
    <GooglePage
      className={className}
      page="#f8bf08"
      fold="#f59307"
      glyph={<path fill="#fdffff" d="M12 34.5v28h40v-28zm35 23H17v-18h30z" />}
    />
  );
}

export function GoogleMeetIcon({ className }: IconProps) {
  return (
    <Svg viewBox="0 0 87.5 72" className={className}>
      <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z" />
      <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z" />
      <path fill="#e94235" d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z" />
      <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z" />
      <path
        fill="#00ac47"
        d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32zM49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z"
      />
      <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l20-16.57V6c0-3.315-2.685-6-6-6z" />
    </Svg>
  );
}

/** Google Tasks: the blue ring and the check whose long stroke crosses it, darker where they overlap. */
export function GoogleTasksIcon({ className }: IconProps) {
  const id = useSvgId();
  const check = "M35 45l12.5 12.5L82 23";
  return (
    <Svg viewBox="0 0 96 96" className={className}>
      <defs>
        <clipPath id={id}>
          <path
            clipRule="evenodd"
            d="M7.5 47.5a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm14 0a26 26 0 1 0 52 0 26 26 0 1 0-52 0z"
          />
        </clipPath>
      </defs>
      <circle cx="47.5" cy="47.5" r="33" fill="none" stroke="#2684fc" strokeWidth="14" />
      <path
        d={check}
        fill="none"
        stroke="#2684fc"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={check}
        fill="none"
        stroke="#0066da"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
        clipPath={`url(#${id})`}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------- Microsoft (Fluent product icons, 48 grid)

export function OutlookIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <defs>
        <linearGradient
          id={`${id}e`}
          x1="28.5"
          y1="25"
          x2="28.5"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#35b8f1" />
          <stop offset="1" stopColor="#28a8ea" />
        </linearGradient>
      </defs>
      <path
        fill="#0a2767"
        d="M45 25a.96.96 0 0 0-.458-.825h-.005l-.018-.01-14.9-8.82a2.026 2.026 0 0 0-.2-.119 2 2 0 0 0-1.834 0 2.026 2.026 0 0 0-.2.119l-14.9 8.82-.018.01a.971.971 0 0 0 .023 1.663l14.9 8.82a2.241 2.241 0 0 0 .2.119 2 2 0 0 0 1.834 0 2.241 2.241 0 0 0 .2-.119l14.9-8.82A.959.959 0 0 0 45 25z"
      />
      <path
        fill="#0364b8"
        d="M14.222 19.111H24v8.963h-9.778zM43 10V5.9A1.858 1.858 0 0 0 41.187 4H15.813A1.858 1.858 0 0 0 14 5.9V10l15 4z"
      />
      <path fill="#0078d4" d="M14 10h10v9H14z" />
      <path fill="#28a8ea" d="M34 10H24v9l10 9h9v-9l-9-9z" />
      <path fill="#0078d4" d="M24 19h10v9H24z" />
      <path fill="#0364b8" d="M24 28h10v9H24z" />
      <path fill="#14447d" d="M14.222 28.074H24v8.148h-9.778z" />
      <path fill="#0078d4" d="M34 28h9v9h-9z" />
      <path
        fill={`url(#${id}e)`}
        d="M44.542 25.783l-.019.01-14.9 8.38c-.065.04-.131.078-.2.112a2.077 2.077 0 0 1-.808.2l-.814-.476a2.033 2.033 0 0 1-.2-.115l-15.1-8.618h-.007L12 25v16.964A2.05 2.05 0 0 0 14.063 44h28.906c.017 0 .032-.008.05-.008a2.531 2.531 0 0 0 .7-.146A2.019 2.019 0 0 0 44 43.7c.067-.038.182-.121.182-.121A2.019 2.019 0 0 0 45 41.964V25a.9.9 0 0 1-.458.783z"
      />
      <path
        fill="#1490df"
        d="M44.542 25.783l-.019.011-14.9 8.38c-.065.04-.131.078-.2.112a2.089 2.089 0 0 1-1.834 0 2.264 2.264 0 0 1-.2-.112l-14.9-8.38-.018-.011A.9.9 0 0 1 12 25v16.964A2.049 2.049 0 0 0 14.062 44h28.876A2.049 2.049 0 0 0 45 41.964V25a.9.9 0 0 1-.458.783z"
      />
      <path
        fill="#28a8ea"
        d="M14.09 44h28.845a2.074 2.074 0 0 0 1.235-.4L27.8 34.011a2.033 2.033 0 0 1-.2-.115l-15.1-8.618h-.007L12 25v16.906A2.092 2.092 0 0 0 14.09 44z"
      />
      <path fill="#50d9ff" d="M34 10h9v9h-9z" />
      <OfficePlate
        id={`${id}p`}
        stops={["#1784d9", "#107ad5", "#0a63c9"]}
        glyph="M7.729 20.688a5.332 5.332 0 0 1 2.094-2.313 6.33 6.33 0 0 1 3.327-.834 5.892 5.892 0 0 1 3.079.791 5.284 5.284 0 0 1 2.037 2.21 7.133 7.133 0 0 1 .714 3.25 7.528 7.528 0 0 1-.735 3.4 5.41 5.41 0 0 1-2.1 2.287 6.126 6.126 0 0 1-3.194.812 6.02 6.02 0 0 1-3.147-.8 5.366 5.366 0 0 1-2.064-2.214 6.963 6.963 0 0 1-.722-3.211 7.733 7.733 0 0 1 .711-3.378zm2.232 5.43a3.461 3.461 0 0 0 1.178 1.522 3.077 3.077 0 0 0 1.84.554 3.223 3.223 0 0 0 1.964-.572 3.315 3.315 0 0 0 1.144-1.522 5.908 5.908 0 0 0 .365-2.123 6.463 6.463 0 0 0-.344-2.15A3.4 3.4 0 0 0 15 20.241a3.043 3.043 0 0 0-1.947-.6 3.175 3.175 0 0 0-1.883.559 3.49 3.49 0 0 0-1.2 1.535 6.1 6.1 0 0 0-.008 4.385z"
      />
    </Svg>
  );
}

export function OneDriveIcon({ className }: IconProps) {
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <path fill="#0364b8" d="M28 27s8.854-6.054 9.045-6.041A13.126 13.126 0 0 0 13.366 17h.134z" />
      <path
        fill="#0f78d4"
        d="M19.016 18.564A10.447 10.447 0 0 0 13.5 17h-.134a10.5 10.5 0 0 0-8.479 16.5L19 32l8.833-8.155z"
      />
      <path
        fill="#1490df"
        d="M37.045 20.959a8.455 8.455 0 0 0-.576-.021 8.506 8.506 0 0 0-3.382.7l-5.254 2.21L34 31l9.98 2.517a8.532 8.532 0 0 0-6.935-12.558z"
      />
      <path
        fill="#28a8ea"
        d="M36.529 29.054l-2.178-1.3-4.994-2.991-1.524-.913-4.019 1.692-7.7 3.238-3.452 1.45-7.775 3.27A10.484 10.484 0 0 0 13.5 38h22.969a8.531 8.531 0 0 0 7.511-4.483z"
      />
    </Svg>
  );
}

export function WordIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <path
        fill="#41a5ee"
        d="M43.167 4H13.833A1.833 1.833 0 0 0 12 5.833V14l17 5 16-5V5.833A1.833 1.833 0 0 0 43.167 4z"
      />
      <path fill="#2b7cd3" d="M45 14H12v10l17 3 16-3V14z" />
      <path fill="#185abd" d="M12 24v10l16 2 17-2V24H12z" />
      <path
        fill="#103f91"
        d="M13.833 44h29.334A1.833 1.833 0 0 0 45 42.167V34H12v8.167A1.833 1.833 0 0 0 13.833 44z"
      />
      <OfficePlate
        id={id}
        stops={["#2368c4", "#1a5dbe", "#1146ac"]}
        glyph="M9.522 27.058c.036.283.06.529.071.74h.042q.024-.3.1-.723t.137-.715l1.928-8.318h2.493l2 8.193a12.133 12.133 0 0 1 .249 1.546h.033a11.853 11.853 0 0 1 .208-1.5l1.595-8.243h2.269l-2.802 11.92h-2.651l-1.9-7.894c-.055-.227-.118-.524-.187-.889s-.112-.632-.129-.8h-.033q-.033.291-.129.864t-.154.848l-1.786 7.869H8.18L5.363 18.042h2.31l1.737 8.335c.039.171.076.399.112.681z"
      />
    </Svg>
  );
}

export function ExcelIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <path
        fill="#185c37"
        d="M29 23l-17-3v22.167A1.833 1.833 0 0 0 13.833 44h29.334A1.833 1.833 0 0 0 45 42.167V34z"
      />
      <path fill="#21a366" d="M29 4H13.833A1.833 1.833 0 0 0 12 5.833V14l17 10 9 3 7-3V14z" />
      <path fill="#107c41" d="M12 14h17v10H12z" />
      <path fill="#33c481" d="M43.167 4H29v10h16V5.833A1.833 1.833 0 0 0 43.167 4z" />
      <path fill="#107c41" d="M29 24h16v10H29z" />
      <OfficePlate
        id={id}
        stops={["#18884f", "#117e43", "#0b6631"]}
        glyph="M7.677 29.958l3.856-5.975L8 18.041h2.842l1.928 3.8c.178.361.3.629.366.806h.025q.19-.432.4-.839l2.061-3.765h2.609l-3.623 5.907 3.715 6.008h-2.776l-2.227-4.171a3.5 3.5 0 0 1-.266-.557h-.033a2.638 2.638 0 0 1-.258.54l-2.293 4.188z"
      />
    </Svg>
  );
}

export function PowerPointIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <path fill="#ed6c47" d="M28 26L25 4h-.224A19.834 19.834 0 0 0 5 23.776V24z" />
      <path fill="#ff8f6b" d="M25.224 4H25v20l10 4 10-4v-.224A19.834 19.834 0 0 0 25.224 4z" />
      <path
        fill="#d35230"
        d="M45 24v.22A19.837 19.837 0 0 1 25.22 44h-.44A19.837 19.837 0 0 1 5 24.22V24z"
      />
      <OfficePlate
        id={id}
        stops={["#ca4c28", "#c5401e", "#b62f14"]}
        glyph="M13.2 17.889a5.039 5.039 0 0 1 3.338.978A3.5 3.5 0 0 1 17.7 21.7a3.942 3.942 0 0 1-.573 2.117 3.829 3.829 0 0 1-1.627 1.438 5.524 5.524 0 0 1-2.447.514h-2.319v4.31H8.359v-12.19zm-2.468 6.018h2.044a2.654 2.654 0 0 0 1.807-.539 2 2 0 0 0 .611-1.577q0-2.015-2.342-2.015h-2.12z"
      />
    </Svg>
  );
}

export function SharePointIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="15" r="12" fill="#036c70" />
      <circle cx="34" cy="26" r="11" fill="#1a9ba1" />
      <circle cx="25.5" cy="36.5" r="8.5" fill="#37c6d0" />
      <OfficePlate
        id={id}
        stops={["#058f92", "#038489", "#026d71"]}
        glyph="M10.187 23.776a3.384 3.384 0 0 1-1.049-1.109 3.018 3.018 0 0 1-.365-1.517 2.919 2.919 0 0 1 .679-1.965 4.011 4.011 0 0 1 1.806-1.178 7.629 7.629 0 0 1 2.467-.382 9.392 9.392 0 0 1 3.25.455v2.3a5.073 5.073 0 0 0-1.47-.6 7.159 7.159 0 0 0-1.719-.206 3.719 3.719 0 0 0-1.767.374 1.159 1.159 0 0 0-.7 1.062 1.076 1.076 0 0 0 .3.752 2.69 2.69 0 0 0 .8.572q.5.249 1.5.662a1.519 1.519 0 0 1 .214.086 12.341 12.341 0 0 1 1.892.933 3.387 3.387 0 0 1 1.118 1.126 3.264 3.264 0 0 1 .4 1.7 3.162 3.162 0 0 1-.636 2.046 3.557 3.557 0 0 1-1.7 1.144 7.71 7.71 0 0 1-2.424.352 12.824 12.824 0 0 1-2.2-.18 7.534 7.534 0 0 1-1.783-.524v-2.425a5.746 5.746 0 0 0 1.8.86 7.042 7.042 0 0 0 1.986.318 3.42 3.42 0 0 0 1.8-.382A1.208 1.208 0 0 0 15 26.971a1.15 1.15 0 0 0-.34-.826 3.425 3.425 0 0 0-.937-.653q-.6-.3-1.767-.791a10.044 10.044 0 0 1-1.769-.925z"
      />
    </Svg>
  );
}

export function TeamsIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <path
        fill="#5059c9"
        d="M31.993 19H43.1a1.9 1.9 0 0 1 1.9 1.9v10.117A6.983 6.983 0 0 1 38.017 38h-.033A6.983 6.983 0 0 1 31 31.017V19.993a.993.993 0 0 1 .993-.993z"
      />
      <circle cx="39.5" cy="12.5" r="4.5" fill="#5059c9" />
      <circle cx="25.5" cy="10.5" r="6.5" fill="#7b83eb" />
      <path
        fill="#7b83eb"
        d="M34.167 19H15.833A1.88 1.88 0 0 0 14 20.923v11.539A11.279 11.279 0 0 0 25 44a11.279 11.279 0 0 0 11-11.538V20.923A1.88 1.88 0 0 0 34.167 19z"
      />
      <OfficePlate
        id={id}
        stops={["#5a62c3", "#4d55bd", "#3940ab"]}
        glyph="M17.824 19.978h-3.665v9.98h-2.335v-9.98H8.176v-1.936h9.648z"
      />
    </Svg>
  );
}

export function ToDoIcon({ className }: IconProps) {
  const id = useSvgId();
  return (
    <Svg viewBox="0 0 48 48" className={className}>
      <defs>
        <linearGradient
          id={id}
          x1="15.292"
          y1="37.062"
          x2="41.417"
          y2="10.938"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#408ffd" />
          <stop offset="1" stopColor="#57aefd" />
        </linearGradient>
      </defs>
      <path
        fill="#185abd"
        d="M9.641 16.588L3.526 22.7a1.832 1.832 0 0 0 0 2.592l8.708 8.709L20.942 25.3l-8.708-8.708a1.834 1.834 0 0 0-2.593-.004z"
      />
      <path
        fill={`url(#${id})`}
        d="M44.474 14l-6.115-6.12a1.834 1.834 0 0 0-2.593 0l-7.412 7.412L19.646 24l-7.412 7.412a1.834 1.834 0 0 0 0 2.593l6.115 6.115a1.834 1.834 0 0 0 2.593 0l7.412-7.412L37.062 24l7.412-7.412A1.834 1.834 0 0 0 44.474 14z"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------- business systems

/** monday.com: the red and yellow strokes and the green dot. */
export function MondayIcon({ className }: IconProps) {
  return (
    <Svg viewBox="11.5 22 96 72" className={className}>
      <path
        d="M44.5 41.5l-20 33"
        fill="none"
        strokeWidth="21"
        strokeLinecap="round"
        stroke="#ff3d57"
      />
      <path
        d="M79.5 41.5l-20 33"
        fill="none"
        strokeWidth="21"
        strokeLinecap="round"
        stroke="#ffcb00"
      />
      <circle cx="94.5" cy="74.5" r="10.5" fill="#00d647" />
    </Svg>
  );
}

// ---------------------------------------------------------------- WhatsApp (where she lives, not a catalogue system)

/**
 * WhatsApp's speech-bubble glyph in white on its own green (#25D366) - the glyph of provider-logo.tsx WhatsappGlyph, as
 * the brand film draws it. For the price lists' voice-note line; buttons that open WhatsApp keep the one-colour glyph.
 */
export function WhatsAppIcon({ className }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" className={className}>
      <path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
      <path
        fill="#fff"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"
      />
    </Svg>
  );
}

/**
 * A system without a clean mark of its own (Priority, מורנינג, iCount): our monogram, never an imitation of the owner's
 * logo - its letters knocked out of a rounded plate in the owner's brand colour, with the same faint top light as the
 * Office plates, so it stands at the size and weight of the drawn marks on night and on paper alike.
 * The letters are drawn by a pseudo-element (`data-letters`), not as text in the page: inside a button named "iCount"
 * the visible fragment "iC" would not match the button's name (axe label-content-name-mismatch). They scale with the
 * plate (container units).
 */
export function MonogramMark({ text, color, className }: IconProps & { text: string; color: string }) {
  const id = useSvgId();
  return (
    <span data-monogram="" className={cn("relative block [container-type:inline-size]", className)}>
      <Svg viewBox="0 0 48 48" className="size-full">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".2" />
            <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="11" fill={color} />
        <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#${id})`} />
      </Svg>
      <span
        aria-hidden="true"
        dir="ltr"
        data-letters={text}
        className={cn(
          "absolute inset-0 grid place-items-center font-heading leading-none font-bold text-white before:content-[attr(data-letters)]",
          text.length > 1 ? "text-[44cqw] tracking-[-0.02em]" : "text-[54cqw]",
        )}
      />
    </span>
  );
}

/** Drawn marks by catalogue id. A system without one shows its monogram (lib/integrations/catalogue.ts). */
export const INTEGRATION_ICONS: Readonly<Record<string, ComponentType<IconProps>>> = {
  gmail: GmailIcon,
  "google-calendar": GoogleCalendarIcon,
  "google-drive": GoogleDriveIcon,
  "google-docs": GoogleDocsIcon,
  "google-sheets": GoogleSheetsIcon,
  "google-slides": GoogleSlidesIcon,
  "google-meet": GoogleMeetIcon,
  "google-tasks": GoogleTasksIcon,
  outlook: OutlookIcon,
  onedrive: OneDriveIcon,
  word: WordIcon,
  excel: ExcelIcon,
  powerpoint: PowerPointIcon,
  sharepoint: SharePointIcon,
  teams: TeamsIcon,
  todo: ToDoIcon,
  monday: MondayIcon,
};
