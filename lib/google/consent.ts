import { gcopy } from "@/lib/copy/bot-google";
import type { Db } from "@/lib/db/types";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import type { GoogleFeature } from "./oauth";
import { driveReadAccess, googleCapConfig, unverifiedScreenExpected } from "./user-cap";

/**
 * Incremental Google consent from the chat (one capability at a time, include_granted_scopes keeps the rest):
 * the one-time links, and what a tool answers when the connection lacks the capability's scope. The Gmail-read
 * equivalent (gmailReadStatus) lives in lib/google/gmail-tools.ts.
 */

/** The one-time chat link that asks Google for one feature's scopes only (`/api/auth/google/start?t=…&feature=…`). */
export function googleConsentLink(ctx: { appUrl: string; now: () => Date }, userId: string, feature: GoogleFeature): string {
  return new URL(`/api/auth/google/start?t=${encodeURIComponent(createConnectLinkToken(userId, "google", { now: ctx.now() }))}&feature=${feature}`, ctx.appUrl).toString();
}

/** Will the consent behind a link show Google's "unverified app" screen? Never throws (a bad env value → no line). */
function headsUp(requestsRestricted: boolean): boolean {
  try {
    return unverifiedScreenExpected(googleCapConfig(), requestsRestricted);
  } catch {
    return false;
  }
}

const RELAY = "להעביר למשתמש את הטקסט שב-say כלשונו, כולל הקישור.";

/**
 * What to tell a Google user who asks to search or read Drive files beyond what עלזה created (Docs / Sheets / Slides
 * already in the Drive) before granting drive.readonly: the consent link (+ the unverified-screen heads-up), or one line
 * when the read is switched off / the user cap is full for this account.
 */
export async function driveReadStatus(db: Db, deps: { accountEmail: string | null; consentLink?: () => string }): Promise<Record<string, unknown>> {
  let access;
  try {
    access = await driveReadAccess(db, deps.accountEmail, googleCapConfig());
  } catch (e) {
    console.error("[gdrive] read access check failed:", (e as Error).message);
    return { available: false, say: gcopy["g.err.drive_read_unavailable"]() };
  }
  if (access.reason === "disabled") return { available: false, say: gcopy["g.err.drive_read_unavailable"]() };
  if (!access.allowed) return { available: false, reason: "user_cap_reached", say: gcopy["g.err.drive_read_cap_reached"]() };
  if (!deps.consentLink) return { available: false, consent_needed: true, say: gcopy["g.drive_read.consent_no_link"]() };
  return { available: false, consent_needed: true, say: gcopy["g.drive_read.consent"](deps.consentLink(), headsUp(true)), note: `${RELAY} אחרי האישור אפשר יהיה לחפש ולקרוא את כל הקבצים ב-Drive.` };
}

/** A Google Tasks tool on a connection without the `tasks` scope (connected before it joined the base set). */
export function tasksConsentStatus(deps: { consentLink?: () => string }): Record<string, unknown> {
  if (!deps.consentLink) return { status: "consent_needed", say: gcopy["g.tasks.consent_no_link"]() };
  return { status: "consent_needed", say: gcopy["g.tasks.consent"](deps.consentLink(), headsUp(false)), note: `${RELAY} אחרי האישור אפשר לבקש שוב.` };
}
