import { createHash } from "node:crypto";
import { BRAND } from "@/lib/brand";
import { gcopy } from "@/lib/copy/bot-google";
import type { ConnectionProvider, ConnectionRow, Db } from "@/lib/db/types";
import { EnvError, integrationsMocked, requireEnv } from "@/lib/env";
import { getMailer } from "@/lib/mail";
import { GOOGLE_SCOPES, gmailReadEnabled, hasScope } from "./oauth";

/**
 * Google's user cap for unverified apps (owner decision 21.10.2026: Gmail reading for the first users without
 * CASA; CASA or a broker such as Composio later). Verified on support.google.com/cloud (answers 7454865,
 * 13463817, 15549945), October 2026:
 *   - an app that requests sensitive/restricted scopes it is not approved for shows the "unverified app" screen
 *     and is limited to "100 new users in total";
 *   - "the user cap applies over the entire lifetime of the project, and it cannot be reset or changed";
 *   - the cap does not apply to scopes that were approved (verified).
 * Google counts users who GRANTED, not active ones — so a user who disconnects or deletes the account keeps
 * their slot. Our ledger (google_scope_grants, migration 0008) mirrors that: one row per Google account × counted
 * scope, never deleted. We stop requesting gmail.readonly from NEW accounts at GOOGLE_GMAIL_READ_CAP (default 95,
 * headroom for users who are on Google's consent screen at the same moment).
 *
 * Which grants Google counts: gmail.readonly (restricted, not verified without CASA) always; calendar.events and
 * gmail.send (sensitive) too, until the sensitive-scope verification is approved
 * (GOOGLE_SENSITIVE_SCOPES_VERIFIED=true). Rows recorded before that stay counted — they used up slots.
 */

export const RESTRICTED_SCOPES: readonly string[] = [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailModify];
export const SENSITIVE_SCOPES: readonly string[] = [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend];
/** Every scope a ledger row may hold — the count is over all of them (the ledger only holds counted grants). */
export const CAP_LEDGER_SCOPES: readonly string[] = [...RESTRICTED_SCOPES, ...SENSITIVE_SCOPES];
/** Operator alert levels: 80 and the cap (95 by default). */
export const CAP_ALERT_AT = 80;

export interface GoogleCapConfig {
  gmailReadEnabled: boolean;
  cap: number;
  sensitiveVerified: boolean;
  /** a real Google project (not the fixtures of DATA_MODE=memory / DEMO_MODE): the unverified-app screen appears */
  realGoogle: boolean;
}

/** Reads GOOGLE_GMAIL_READ_ENABLED / _CAP / GOOGLE_SENSITIVE_SCOPES_VERIFIED. Bad values → Hebrew EnvError. */
export function googleCapConfig(source: Record<string, string | undefined> = process.env): GoogleCapConfig {
  const env = requireEnv(["GOOGLE_GMAIL_READ_CAP", "GOOGLE_SENSITIVE_SCOPES_VERIFIED"], source);
  let mocked = true;
  try {
    mocked = integrationsMocked(source);
  } catch {
    mocked = true;
  }
  return { gmailReadEnabled: gmailReadEnabled(source), cap: env.GOOGLE_GMAIL_READ_CAP, sensitiveVerified: env.GOOGLE_SENSITIVE_SCOPES_VERIFIED, realGoogle: Boolean(source.GOOGLE_CLIENT_ID?.trim()) && !mocked };
}

/** Scopes whose grant Google counts right now (what we record). */
export function countedScopes(cfg: Pick<GoogleCapConfig, "sensitiveVerified">): string[] {
  return cfg.sensitiveVerified ? [...RESTRICTED_SCOPES] : [...CAP_LEDGER_SCOPES];
}

/** sha256 hex of the lowercased account email — the ledger never stores the address (SQL backfill: same formula). */
export function googleAccountHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export async function countCapUsers(db: Db): Promise<number> {
  return db.countGoogleScopeAccounts([...CAP_LEDGER_SCOPES]);
}

export type GmailReadAccess =
  | { allowed: true; reason: "already_counted" | "under_cap"; count: number | null; cap: number }
  | { allowed: false; reason: "disabled" | "cap_reached"; count: number | null; cap: number };

/**
 * May we request gmail.readonly for this Google account? `accountEmail` = the account of the user's existing Google
 * connection (any status), or null on a first connect. An account Google already counted never costs a new slot.
 */
export async function gmailReadAccess(db: Db, accountEmail: string | null, cfg: GoogleCapConfig = googleCapConfig()): Promise<GmailReadAccess> {
  if (!cfg.gmailReadEnabled) return { allowed: false, reason: "disabled", count: null, cap: cfg.cap };
  if (accountEmail && (await db.hasGoogleScopeGrant(googleAccountHash(accountEmail), [...CAP_LEDGER_SCOPES]))) return { allowed: true, reason: "already_counted", count: null, cap: cfg.cap };
  const count = await countCapUsers(db);
  return count < cfg.cap ? { allowed: true, reason: "under_cap", count, cap: cfg.cap } : { allowed: false, reason: "cap_reached", count, cap: cfg.cap };
}

/** The Google account of the user's latest non-revoked (else any) Google connection — the one a reconnect reuses. */
export function googleAccountOf(connections: ConnectionRow[]): string | null {
  const google = connections.filter((c) => c.provider === "google" && c.account_email);
  return (google.find((c) => c.status !== "revoked") ?? google[0])?.account_email ?? null;
}

// ---------------------------------------------------------------------------------------------
// recording grants + operator alerts
// ---------------------------------------------------------------------------------------------

export interface CapAlert {
  level: number;
  count: number;
  cap: number;
  sensitiveVerified: boolean;
}

export type CapNotifier = (alert: CapAlert) => Promise<void>;

/**
 * After a successful consent: records the counted scopes the account granted (idempotent), recounts, and raises
 * each alert level reached for the first time (ops_flags `google_user_cap:<level>`, once ever).
 */
export async function recordGoogleGrants(
  db: Db,
  input: { userId: string; accountEmail: string; granted: readonly string[] },
  deps: { cfg?: GoogleCapConfig; notify?: CapNotifier; now?: Date } = {},
): Promise<{ recorded: string[]; count: number; alerts: number[] }> {
  const cfg = deps.cfg ?? googleCapConfig();
  const scopes = countedScopes(cfg).filter((s) => hasScope(input.granted, s));
  if (!scopes.length) return { recorded: [], count: await countCapUsers(db), alerts: [] };
  const hash = googleAccountHash(input.accountEmail);
  const recorded: string[] = [];
  for (const scope of scopes) if (await db.recordGoogleScopeGrant({ account_hash: hash, scope, user_id: input.userId })) recorded.push(scope);
  const count = await countCapUsers(db);
  const alerts: number[] = [];
  for (const level of alertLevels(cfg.cap)) {
    if (count < level) continue;
    const fresh = await db.setOpsFlagOnce(`google_user_cap:${level}`, { count, cap: cfg.cap, sensitive_verified: cfg.sensitiveVerified, at: (deps.now ?? new Date()).toISOString() });
    if (!fresh) continue;
    alerts.push(level);
    const alert: CapAlert = { level, count, cap: cfg.cap, sensitiveVerified: cfg.sensitiveVerified };
    console.warn(`[google:user-cap] ${count}/${cfg.cap} Google accounts counted toward the unverified-app cap (alert level ${level}).`);
    await db.addAudit({ user_id: input.userId, action: "ops.google_user_cap", target: `level:${level}`, result: `count:${count}/${cfg.cap}` }).catch(() => undefined);
    await (deps.notify ?? emailOperator)(alert).catch((e) => console.error("[google:user-cap] operator email failed:", (e as Error).message));
  }
  return { recorded, count, alerts };
}

export function alertLevels(cap: number): number[] {
  return [...new Set([Math.min(CAP_ALERT_AT, cap), cap])].sort((a, b) => a - b);
}

/** Operator-facing Hebrew text (an internal email, not customer copy). */
export function capAlertMail(a: CapAlert): { subject: string; text: string } {
  const reached = a.count >= a.cap;
  const subject = `${BRAND.name}: ${a.count} חשבונות Google בתקרה של אפליקציה לא מאומתת (סף ${a.level})`;
  const text = [
    `חשבונות Google שאישרו scope לא מאומת: ${a.count}. התקרה שלנו: ${a.cap}. Google חוסמת משתמשים חדשים ב-100, לכל חיי הפרויקט, בלי איפוס.`,
    reached
      ? "הגענו לתקרה: משתמשים חדשים כבר לא מתבקשים לאשר קריאת Gmail. היומן, Drive ושליחת מיילים מ-Gmail ממשיכים לעבוד, וסיכום הבוקר שלהם בלי \"מיילים שמחכים לתשובה\"."
      : `עוד ${a.cap - a.count} חשבונות עד שנפסיק לבקש קריאת Gmail ממשתמשים חדשים.`,
    a.sensitiveVerified
      ? ""
      : "חשוב: calendar.events ו-gmail.send עדיין לא אושרו ב-Verification Center, ולכן כל חיבור Google חדש נספר בתקרה — גם בלי קריאת Gmail. ב-100 Google תחסום חיבורים חדשים לגמרי. להגיש עכשיו אימות ל-scopes הרגישים (docs/google-setup.md §5) ואז GOOGLE_SENSITIVE_SCOPES_VERIFIED=true.",
    "הצעד הבא לקריאת Gmail מעבר לתקרה: הערכת CASA או ספק מתווך (Composio) — docs/google-setup.md §6. מצב התקרה ב-Console: Google Auth Platform → Audience → OAuth user cap.",
  ].filter(Boolean);
  return { subject, text: text.join("\n\n") };
}

/** Default notifier: email OPERATOR_EMAIL through the app mailer when both are configured; otherwise the log line is it. */
async function emailOperator(alert: CapAlert): Promise<void> {
  let to: string | undefined;
  try {
    to = requireEnv(["OPERATOR_EMAIL"]).OPERATOR_EMAIL;
  } catch (e) {
    if (e instanceof EnvError) console.error(`[google:user-cap] ${e.message}`);
    return;
  }
  if (!to) return;
  const mailer = getMailer();
  if (!mailer.sendOperatorAlert) return;
  await mailer.sendOperatorAlert({ to, ...capAlertMail(alert) });
}

// ---------------------------------------------------------------------------------------------
// the "unverified app" heads-up
// ---------------------------------------------------------------------------------------------

/** Will Google show "Google hasn't verified this app" before its consent screen? */
export function unverifiedScreenExpected(cfg: Pick<GoogleCapConfig, "realGoogle" | "sensitiveVerified">, requestsGmailRead: boolean): boolean {
  return cfg.realGoogle && (requestsGmailRead || !cfg.sensitiveVerified);
}

/**
 * For a chat message carrying a Google connect link: will the consent behind it show the unverified-app screen?
 * Mirrors the start route (gmail.readonly is added while the account may still get it). Never throws.
 */
/** "\n<heads-up line>" to append to a chat message carrying a connect link for `provider`, or "". Never throws. */
export async function connectHeadsUpSuffix(db: Db, connections: ConnectionRow[], provider: ConnectionProvider): Promise<string> {
  return provider === "google" && (await googleConnectShowsUnverified(db, connections)) ? `\n${gcopy["g.unverified_heads_up"]()}` : "";
}

export async function googleConnectShowsUnverified(db: Db, connections: ConnectionRow[], cfg?: GoogleCapConfig): Promise<boolean> {
  try {
    const c = cfg ?? googleCapConfig();
    if (!c.realGoogle) return false;
    if (!c.sensitiveVerified) return true;
    return (await gmailReadAccess(db, googleAccountOf(connections), c)).allowed;
  } catch (e) {
    console.error("[google:user-cap] heads-up check failed:", (e as Error).message);
    return false;
  }
}
