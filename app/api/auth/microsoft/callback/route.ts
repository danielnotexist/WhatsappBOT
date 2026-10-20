import type { Route } from "next";
import { getDb } from "@/lib/db";
import { EnvError } from "@/lib/env";
import { copy } from "@/lib/copy/bot";
import { activeMicrosoftConnection, getMsConfig, graphForConnection } from "@/lib/ms";
import { MsOAuthError, exchangeCode, parseIdToken } from "@/lib/ms/oauth";
import { ensureInboxSubscription } from "@/lib/ms/subscriptions";
import { sealTokens } from "@/lib/ms/token-store";
import { getWaSender } from "@/lib/wa";

function accountRedirect(request: Request, key: "notice" | "error", message: string): Response {
  const dest = new URL("/account", process.env.APP_URL || new URL(request.url).origin);
  dest.searchParams.set(key, message);
  return Response.redirect(dest.toString() as Route, 303);
}

/**
 * GET /api/auth/microsoft/callback — both the user flow (code + state) and the admin-consent flow
 * (admin_consent=True & tenant & state). Looks the pending state up by scanning the user profile; because the
 * state is random and single-use we find the user through it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const db = getDb();
  const user = state ? await db.findUserByOauthState("microsoft", state) : null;
  if (!user) return accountRedirect(request, "error", "החיבור לא הושלם: המצב לא זוהה (אולי הקישור פג). אפשר להתחיל שוב.");
  const pending = ((user.profile.oauth_pending as Record<string, unknown>)?.microsoft ?? {}) as { verifier?: string; admin?: boolean; via?: string };
  await db.mergeUserProfile(user.id, { oauth_pending: { ...((user.profile.oauth_pending as Record<string, unknown>) ?? {}), microsoft: null } });

  const phone = (await db.listWaIdentities(user.id)).find((w) => w.status === "active")?.phone_e164 ?? null;
  const tell = async (text: string) => {
    if (!phone) return;
    try {
      await getWaSender().sendText(phone, text);
      await db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
    } catch (e) {
      console.error("[ms:callback] wa notify failed:", (e as Error).message);
    }
  };

  // --- admin consent result ---
  if (url.searchParams.get("admin_consent")) {
    const ok = url.searchParams.get("admin_consent") === "True";
    await db.addAudit({ user_id: user.id, action: "ms.admin_consent", target: url.searchParams.get("tenant") ?? "", result: ok ? "granted" : (url.searchParams.get("error") ?? "denied") });
    if (ok) await tell("מנהל המערכת אישר את החיבור לארגון. אפשר לכתוב \"חבר שוב\" ואשלח קישור לחיבור החשבון.");
    return accountRedirect(request, ok ? "notice" : "error", ok ? "אישור המנהל התקבל. עכשיו אפשר לחבר את החשבון." : `אישור המנהל לא ניתן: ${url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? ""}`);
  }

  // --- user authorization result ---
  const error = url.searchParams.get("error");
  if (error || !url.searchParams.get("code")) {
    const desc = url.searchParams.get("error_description") ?? "";
    const needsAdmin = /AADSTS65001|AADSTS90094|consent_required|admin_consent/i.test(`${error} ${desc}`);
    await db.addAudit({ user_id: user.id, action: "ms.connect", result: `error:${error}` });
    if (needsAdmin) {
      const adminLink = new URL("/api/auth/microsoft/start?admin=1", process.env.APP_URL || url.origin).toString();
      await tell(copy["err.admin_consent_needed"](user.business_name ?? "הארגון", adminLink));
      return accountRedirect(request, "error", "הארגון דורש אישור מנהל. שלחנו בוואטסאפ טקסט להעביר למנהל ה-IT.");
    }
    return accountRedirect(request, "error", `החיבור ל-Microsoft 365 לא הושלם${desc ? `: ${desc.split("\n")[0]}` : ""}.`);
  }

  let cfg;
  try {
    cfg = getMsConfig();
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  try {
    const tokens = await exchangeCode(cfg, url.searchParams.get("code")!, pending.verifier ?? "");
    const claims = parseIdToken(tokens.idToken);
    const accountEmail = (claims.email ?? claims.preferred_username ?? user.email).toLowerCase();
    const connection = await db.upsertConnection({ user_id: user.id, provider: "microsoft", account_email: accountEmail, tenant_id: claims.tid, scopes: tokens.scope, consent_type: pending.admin ? "admin" : "user", ...sealTokens(user.id, tokens) });
    await db.addAudit({ user_id: user.id, action: "ms.connect", target: accountEmail, result: "ok" });
    try {
      const graph = graphForConnection(db, activeMicrosoftConnection([connection]) ?? connection);
      const me = await graph.me();
      if (me.displayName && !user.name) await db.updateUserProfile(user.id, { name: me.displayName });
      await ensureInboxSubscription(db, graph, connection, process.env.APP_URL || url.origin);
    } catch (e) {
      console.warn("[ms:callback] post-connect setup failed:", (e as Error).message);
    }
    await tell(copy["onb.connect_done"]("Microsoft 365", accountEmail));
    return accountRedirect(request, "notice", `החיבור ל-Microsoft 365 הושלם (${accountEmail}).`);
  } catch (e) {
    if (e instanceof MsOAuthError) {
      await db.addAudit({ user_id: user.id, action: "ms.connect", result: `token:${e.code}` });
      if (e.needsAdminConsent) {
        const adminLink = new URL("/api/auth/microsoft/start?admin=1", process.env.APP_URL || url.origin).toString();
        await tell(copy["err.admin_consent_needed"](user.business_name ?? "הארגון", adminLink));
        return accountRedirect(request, "error", "הארגון דורש אישור מנהל. שלחנו בוואטסאפ טקסט להעביר למנהל ה-IT.");
      }
      return accountRedirect(request, "error", `החיבור נכשל (${e.code}). אפשר לנסות שוב.`);
    }
    throw e;
  }
}
