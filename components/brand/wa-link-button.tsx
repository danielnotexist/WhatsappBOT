import type { ReactNode } from "react";
import { Cta, type CtaTone } from "./cta";
import { WhatsappGlyph } from "./provider-logo";

/** The prefilled message inside a wa.me link ("היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)"), or "" when there is none. */
export function waMessageOf(href: string): string {
  try {
    return new URL(href).searchParams.get("text") ?? "";
  } catch {
    return "";
  }
}

/**
 * THE single place that renders a button opening WhatsApp (a wa.me link with a prefilled message):
 * /start/ready ("חיבור לוואטסאפ") and /login/whatsapp ("פתיחת וואטסאפ").
 *
 * ── Demo wiring point ──
 * In the demo deployment the coordinator wraps `button` below with components/demo/DemoWaDialog.tsx (agent A), e.g.
 *   return isDemo() ? <DemoWaDialog href={href} message={waMessageOf(href)}>{button}</DemoWaDialog> : button;
 * Nothing else changes: every wa.me button on the site goes through this component, with the real href and token.
 */
export function WaLinkButton({
  href,
  children,
  tone = "honey",
  block = false,
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: CtaTone;
  block?: boolean;
  className?: string;
}) {
  const button = (
    <Cta href={href} external tone={tone} block={block} className={className}>
      <WhatsappGlyph className="size-5 flex-none" />
      {children}
    </Cta>
  );
  return button;
}
