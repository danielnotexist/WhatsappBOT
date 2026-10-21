import type { ReactNode } from "react";
import { DemoWaGate } from "@/components/demo/DemoWaGate";
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
 * In DEMO_MODE `DemoWaGate` swaps the link for a dialog with the prefilled message (nothing opens WhatsApp).
 * Every wa.me button on the site goes through this component, with the real href and token.
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
  // In DEMO_MODE the link opens a dialog showing the prefilled message instead of WhatsApp (agent A's gate).
  return <DemoWaGate href={href}>{button}</DemoWaGate>;
}
