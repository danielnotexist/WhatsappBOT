/**
 * The providers on the signup hand-off screen (/connect/[provider]). Shared by the server page (param check) and the
 * client transition — keep it free of "use client" so the server sees the real object, not a client reference.
 * Both start routes take `returnTo=onboarding`: success → /start/ready?connected=<provider>, failure → /start/connect?error=…
 */
export type ConnectProvider = "microsoft" | "google";

export const PROVIDERS: Record<ConnectProvider, { product: string; company: string; next: string; delayMs: number; available: boolean }> = {
  microsoft: { product: "Outlook", company: "Microsoft", next: "/api/auth/microsoft/start?returnTo=onboarding", delayMs: 900, available: true },
  google: { product: "Gmail", company: "Google", next: "/api/auth/google/start?returnTo=onboarding", delayMs: 900, available: true },
};

export function isConnectProvider(p: string): p is ConnectProvider {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, p);
}
