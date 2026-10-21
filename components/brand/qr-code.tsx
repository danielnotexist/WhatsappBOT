import "server-only";
import QRCode from "qrcode";
import { palette } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/** SVG markup for a QR code (server side — no client JS, no canvas). Exported for tests. */
export async function qrSvg(value: string, opts: { dark?: string; light?: string } = {}): Promise<string> {
  return QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: opts.dark ?? palette.ink, light: opts.light ?? palette.paper },
  });
}

/**
 * A QR code rendered on the server as inline SVG (desktop "scan with your phone" on /start/ready).
 * The SVG comes from our own value through the qrcode library, never from user HTML.
 */
export async function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const svg = await qrSvg(value);
  return (
    <figure className={cn("m-0", className)}>
      <div role="img" aria-label={label} className="overflow-hidden rounded-2xl [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
}
