import type { ReactNode } from "react";
import { isDemo } from "@/lib/demo";
import { DemoWaDialog } from "./DemoWaDialog";

/**
 * Server-side switch for the WhatsApp button: in DEMO_MODE the children (the wa.me link) are wrapped in
 * <DemoWaDialog>, otherwise returned as they are. Reads DEMO_MODE at render time — use it under a request-time
 * render (the ready page already awaits `connection()`).
 *
 *   <DemoWaGate href={waHref}>
 *     <Cta href={waHref} external tone="honey" block>…חיבור לוואטסאפ</Cta>
 *   </DemoWaGate>
 */
export function DemoWaGate({ href, children }: { href: string; children: ReactNode }) {
  return <DemoWaDialog href={href} enabled={isDemo()}>{children}</DemoWaDialog>;
}
