import "server-only";
import { isDemo } from "@/lib/demo";
import { requireEnv } from "@/lib/env";

/** A placeholder number for DATA_MODE=memory development and the demo (never a real line). */
export const DEV_PUBLIC_NUMBER = "972500000000";

/** עלזה's WhatsApp number for wa.me links (E.164 digits, no "+"). Hebrew EnvError when missing outside memory/demo mode. */
export function publicWaNumber(): string {
  if ((process.env.DATA_MODE === "memory" || isDemo()) && !process.env.WA_PUBLIC_NUMBER) return DEV_PUBLIC_NUMBER;
  return requireEnv(["WA_PUBLIC_NUMBER"]).WA_PUBLIC_NUMBER;
}

/** wa.me link with a prefilled message. */
export function waMeText(publicNumber: string, text: string): string {
  return `https://wa.me/${publicNumber}?text=${encodeURIComponent(text)}`;
}
