import "server-only";
import { trackServerEvent } from "@/lib/analytics/track";
import { replaceOtherConnections } from "@/lib/account/service";
import { GOOGLE_CAPABILITY_SCOPES, gcopy } from "@/lib/copy/bot-google";
import type { Db, UserRow } from "@/lib/db/types";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { GOOGLE_SCOPES, hasScope, isGoogleFeature, missingScopes, scopesForRequest, type GoogleTokens } from "./oauth";
import { sealGoogleTokens, storedGoogleRefreshToken } from "./token-store";
import { googleConnectShowsUnverified, keepGrantedRestrictedRead, recordGoogleGrants, type RestrictedReadKeep } from "./user-cap";

/** What the start route stored with the state (the connect flow on the profile, Sign in with Google in its cookie). */
export interface GooglePendingAsk {
  feature?: string | null;
  /** the scopes the start route requested */
  scopes?: unknown[];
  /** the start route's user-cap decision (RestrictedReadAccess.reason): "already_counted" | "under_cap" | "disabled" | "cap_reached" */
  gmail_read?: string;
  /** the same decision for drive.readonly */
  drive_read?: string;
}

export type GoogleConnectOutcome = { ok: true; notice: string } | { ok: false; error: string };

/**
 * The second half of the Google callback, shared by the connect flow and Sign in with Google (lib/auth/sso-flow.ts):
 * the tokens are in hand and the account's email is known. Stores the encrypted tokens and the granted scopes
 * (granular consent → maybe fewer than requested), replaces an older Google connection of the user, records the funnel
 * step, audits, tells the user in WhatsApp (`tell`) and returns the line for the page.
 * gmail.readonly and drive.readonly are stored only when keepGrantedRestrictedRead allows it (the read switched on, and
 * asked for within the cap or the account was already counted) — the scope list in the consent URL is not trusted.
 * Google's grant is recorded in the user-cap ledger as soon as the account is known, before any later step can fail:
 * Google counted it already.
 */
export async function storeGoogleConnection(
  db: Db,
  user: UserRow,
  tokens: GoogleTokens,
  input: { email: string; name: string | null; pending: GooglePendingAsk; appUrl: string; tell: (body: string) => Promise<void> },
): Promise<GoogleConnectOutcome> {
  const { email, pending, tell } = input;
  const feature = isGoogleFeature(pending.feature) ? pending.feature : null;
  // what was asked (stored by the start route — the cap may have moved since); older states: the static set
  const stored = Array.isArray(pending.scopes) ? pending.scopes.filter((s): s is string => typeof s === "string") : [];
  const requested = stored.length ? stored : scopesForRequest(feature);
  // may this connection keep gmail.readonly / drive.readonly? (decided before the grant below makes the account "counted")
  const gmailRead = await keepGrantedRestrictedRead(db, { accountEmail: email, granted: tokens.scope, requested, startReason: pending.gmail_read }, "gmail_read");
  const driveRead = await keepGrantedRestrictedRead(db, { accountEmail: email, granted: tokens.scope, requested, startReason: pending.drive_read }, "drive_read");
  // Google's unverified-app user cap counts this account from now on (lib/google/user-cap.ts) — recorded first,
  // with what Google really granted (also a restricted read we do not keep: Google counted it), best effort
  await recordGoogleGrants(db, { userId: user.id, accountEmail: email, granted: tokens.scope }).catch((e) => console.error("[google:callback] user-cap ledger failed:", (e as Error).message));
  const droppedGmail = !gmailRead.keep && gmailRead.reason !== "not_granted";
  const droppedDrive = !driveRead.keep && driveRead.reason !== "not_granted";
  const scopes = tokens.scope.filter((s) => !(droppedGmail && s === GOOGLE_SCOPES.gmailReadonly) && !(droppedDrive && s === GOOGLE_SCOPES.driveReadonly));
  if (droppedGmail) {
    console.warn(`[google:callback] gmail.readonly granted but not kept (${gmailRead.reason}) for user ${user.id}`);
    await db.addAudit({ user_id: user.id, action: "google.gmail_read_not_kept", target: email, result: gmailRead.reason });
  }
  if (droppedDrive) {
    console.warn(`[google:callback] drive.readonly granted but not kept (${driveRead.reason}) for user ${user.id}`);
    await db.addAudit({ user_id: user.id, action: "google.drive_read_not_kept", target: email, result: driveRead.reason });
  }

  // prompt=consent normally returns a new refresh token; if Google omits it on a re-consent, keep the stored one
  const existing = (await db.listConnections(user.id)).find((c) => c.provider === "google" && c.account_email === email);
  const refreshToken = tokens.refreshToken ?? (existing ? await storedGoogleRefreshToken(db, existing).catch(() => null) : null);
  const connection = await db.upsertConnection({ user_id: user.id, provider: "google", account_email: email, tenant_id: null, scopes, consent_type: "user", ...sealGoogleTokens(user.id, { ...tokens, refreshToken }) });
  await replaceOtherConnections(db, user.id, connection).catch((e) => console.error("[google:callback] replacing older connections failed:", (e as Error).message));
  trackServerEvent(db, "mail_connected", user.id); // the signup funnel (lib/analytics)

  // the restricted reads riding along a plain connect are optional: unticking them is a choice, not a failed connect
  const optional: string[] = feature ? [] : [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.driveReadonly];
  // what the user did not tick (a restricted read we did not keep WAS ticked — see `refused*` below)
  const missing = missingScopes(tokens.scope, requested).filter((s) => GOOGLE_CAPABILITY_SCOPES.includes(s) && !optional.includes(s));
  const declinedRide = (scope: string) => !feature && requested.includes(scope) && !hasScope(tokens.scope, scope);
  const gmailReadDeclined = declinedRide(GOOGLE_SCOPES.gmailReadonly);
  const declined = [gmailReadDeclined ? "gmail_read_declined" : "", declinedRide(GOOGLE_SCOPES.driveReadonly) ? "drive_read_declined" : ""].filter(Boolean);
  // the user asked for a restricted read and ticked it, but it is not available to this account (cap / off)
  const refusedGmail = droppedGmail && requested.includes(GOOGLE_SCOPES.gmailReadonly) ? gmailRead.reason : null;
  const refusedDrive = droppedDrive && requested.includes(GOOGLE_SCOPES.driveReadonly) ? driveRead.reason : null;
  await db.addAudit({
    user_id: user.id,
    action: "google.connect",
    target: email,
    result: missing.length ? `partial:${missing.join(" ")}` : refusedGmail ? `ok:gmail_read_refused:${refusedGmail}` : refusedDrive ? `ok:drive_read_refused:${refusedDrive}` : feature ? `ok:${feature}` : declined.length ? `ok:${declined.join(",")}` : "ok",
  });
  if (!user.name && input.name) await db.updateUserProfile(user.id, { name: input.name });
  if (!refreshToken) console.warn(`[google:callback] no refresh token for connection ${connection.id} - the user will need to reconnect when the access token expires`);

  await tell(gcopy["g.connect_done"](email, scopes, { gmailReadDeclined }));
  if (refusedGmail) await tell(refusedGmail === "cap_reached" ? gcopy["g.err.gmail_read_cap_reached"]() : gcopy["g.err.gmail_read_unavailable"]());
  if (refusedDrive) await tell(refusedDrive === "cap_reached" ? gcopy["g.err.drive_read_cap_reached"]() : gcopy["g.err.drive_read_unavailable"]());
  if (missing.length) {
    const retry = new URL(`/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(user.id, "google"))}${feature ? `&feature=${feature}` : ""}`, input.appUrl).toString();
    const headsUp = await googleConnectShowsUnverified(db, await db.listConnections(user.id));
    await tell(`${gcopy["g.connect_partial"](missing, retry)}${headsUp ? `\n${gcopy["g.unverified_heads_up"]()}` : ""}`);
  }
  if (missing.length) return { ok: true, notice: gcopy["g.web.connected_partial"](email, missing) };
  // an explicit restricted-read consent that we could not keep: say so (the rest of the connection is unchanged)
  if (feature && refusedGmail) return { ok: false, error: refusedNotice("gmail_read", refusedGmail) };
  if (feature && refusedDrive) return { ok: false, error: refusedNotice("drive_read", refusedDrive) };
  return { ok: true, notice: gcopy["g.web.connected"](email) };
}

const refusedNotice = (read: "gmail_read" | "drive_read", reason: RestrictedReadKeep["reason"]) =>
  read === "gmail_read"
    ? reason === "cap_reached"
      ? gcopy["g.web.gmail_read_cap_reached"]()
      : gcopy["g.web.feature_disabled"]()
    : reason === "cap_reached"
      ? gcopy["g.web.drive_read_cap_reached"]()
      : gcopy["g.web.drive_read_disabled"]();

/**
 * A consent that came back but is not in the user-cap ledger: Google may have counted the account (the user saw the
 * consent screen and approved), and we cannot tell which account it was. One greppable line per case, so the
 * operator can reconcile the ledger with Google Auth Platform → Audience → OAuth user cap.
 */
export function uncountedGoogleConsent(why: string, userId?: string): void {
  console.warn(`[google:user-cap] consent returned but not recorded (${why})${userId ? ` user ${userId}` : ""} - Google may have counted this account; compare with the Console's OAuth user cap.`);
}
