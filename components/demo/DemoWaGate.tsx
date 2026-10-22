import type { ReactNode } from "react";
import { isDemo } from "@/lib/demo";
import { liveWaInDemo } from "@/lib/env";
import { DemoWaDialog } from "./DemoWaDialog";

/**
 * Server-side switch for the WhatsApp button: in DEMO_MODE the children (the wa.me link) are wrapped in
 * <DemoWaDialog>, otherwise returned as they are (also in the demo with LIVE_WA=1, where the number is real). Reads DEMO_MODE at render time — use it under a request-time
 * render (the ready page already awaits `connection()`).
 *
 *   <DemoWaGate href={waHref}>
 *     <Cta href={waHref} external tone="honey" block>…חיבור לוואטסאפ</Cta>
 *   </DemoWaGate>
 */
export function DemoWaGate({ href, children }: { href: string; children: ReactNode }) {
  return <DemoWaDialog href={href} enabled={isDemo() && !liveWaInDemo()}>{children}</DemoWaDialog>;
}
