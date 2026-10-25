import "server-only";
import { trackServerEvent } from "@/lib/analytics/track";
import { gcopy } from "@/lib/copy/bot-google";
import type { ConnectionRow, Db, UserRow } from "@/lib/db/types";
import { isDemo } from "@/lib/demo";
import { getGoogleConfig } from "@/lib/google";
import { exchangeGoogleCode } from "@/lib/google/oauth";
import { sealGoogleTokens } from "@/lib/google/token-store";
import { getMsConfig } from "@/lib/ms";
import { exchangeCode, parseIdToken } from "@/lib/ms/oauth";
import { sealTokens } from "@/lib/ms/token-store";
import type { ConnectProvider } from "./oauth-providers";

/**
 * DEMO_MODE (lib/demo.ts): "connecting" Microsoft 365 / Google without leaving the site. Runs the existing fixture
 * token exchange (getMsConfig / getGoogleConfig are fixture-backed in the demo), seals the fixture tokens like the real
 * callback does and writes the connection row through the normal data layer — memory or Supabase — under the
 * user's own email. No Graph subscription, no WhatsApp message, no profile changes. The start routes then redirect
 * through the returnTo rule (lib/auth/oauth-return.ts), so the screens after it are the real ones.
 */
export async function demoConnect(db: Db, user: UserRow, provider: ConnectProvider): Promise<{ notice: string; connection: ConnectionRow }> {
  if (!isDemo()) throw new Error("demoConnect runs only in DEMO_MODE");
  const email = user.email;
  if (provider === "microsoft") {
    const tokens = await exchangeCode(getMsConfig(), "demo", "demo");
    const connection = await db.upsertConnection({
      user_id: user.id,
      provider: "microsoft",
      account_email: email,
      tenant_id: parseIdToken(tokens.idToken).tid,
      scopes: tokens.scope,
      consent_type: "user",
      ...sealTokens(user.id, tokens),
    });
    await db.addAudit({ user_id: user.id, action: "ms.connect", target: email, result: "ok:demo" });
    trackServerEvent(db, "mail_connected", user.id);
    return { notice: `החיבור ל-Microsoft 365 הושלם (${email}).`, connection };
  }
  const tokens = await exchangeGoogleCode(getGoogleConfig(), "demo", "demo");
  const connection = await db.upsertConnection({
    user_id: user.id,
    provider: "google",
    account_email: email,
    tenant_id: null,
    scopes: tokens.scope,
    consent_type: "user",
    ...sealGoogleTokens(user.id, tokens),
  });
  await db.addAudit({ user_id: user.id, action: "google.connect", target: email, result: "ok:demo" });
  trackServerEvent(db, "mail_connected", user.id);
  return { notice: gcopy["g.web.connected"](email), connection };
}
