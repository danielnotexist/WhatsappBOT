import { createHash } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";
import { BRAND } from "@/lib/brand";
import { gcopy } from "@/lib/copy/bot-google";
import type { ConnectionProvider, ConnectionRow, Db } from "@/lib/db/types";
import { EnvError, integrationsMocked, requireEnv } from "@/lib/env";
import { getMailer } from "@/lib/mail";
import { GOOGLE_SCOPES, driveReadEnabled, gmailReadEnabled, hasScope, type RestrictedRead } from "./oauth";

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
 * Which grants Google counts: gmail.readonly and drive.readonly (restricted, not verified without CASA) always;
 * calendar.events, gmail.send and tasks (sensitive) too, until the sensitive-scope verification is approved
 * (GOOGLE_SENSITIVE_SCOPES_VERIFIED=true). Rows recorded before that stay counted — they used up slots.
 *
 * The cap is per Google account, not per scope: an account that is counted may add Gmail read AND Drive read without a
 * new slot. Each read has its own switch (GOOGLE_GMAIL_READ_ENABLED / GOOGLE_DRIVE_READ_ENABLED).
 */

export const RESTRICTED_SCOPES: readonly string[] = [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailModify, GOOGLE_SCOPES.driveReadonly];
export const SENSITIVE_SCOPES: readonly string[] = [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.tasks];
/** The scope each restricted read asks for. */
export const RESTRICTED_READ_SCOPE: Record<RestrictedRead, string> = { gmail_read: GOOGLE_SCOPES.gmailReadonly, drive_read: GOOGLE_SCOPES.driveReadonly };
/** Every scope a ledger row may hold — the count is over all of them (the ledger only holds counted grants). */
export const CAP_LEDGER_SCOPES: readonly string[] = [...RESTRICTED_SCOPES, ...SENSITIVE_SCOPES];
/** Operator alert levels: 80 and the cap (95 by default). */
export const CAP_ALERT_AT = 80;

export interface GoogleCapConfig {
  gmailReadEnabled: boolean;
  /** GOOGLE_DRIVE_READ_ENABLED; absent = off */
  driveReadEnabled?: boolean;
  cap: number;
  sensitiveVerified: boolean;
  /** a real Google project (not the fixtures of DATA_MODE=memory / DEMO_MODE): the unverified-app screen appears */
  realGoogle: boolean;
}

/** Reads GOOGLE_GMAIL_READ_ENABLED / GOOGLE_DRIVE_READ_ENABLED / _CAP / GOOGLE_SENSITIVE_SCOPES_VERIFIED. Bad values → Hebrew EnvError. */
export function googleCapConfig(source: Record<string, string | undefined> = process.env): GoogleCapConfig {
  const env = requireEnv(["GOOGLE_GMAIL_READ_CAP", "GOOGLE_SENSITIVE_SCOPES_VERIFIED"], source);
  let mocked = true;
  try {
    mocked = integrationsMocked(source);
  } catch {
    mocked = true;
  }
  return { gmailReadEnabled: gmailReadEnabled(source), driveReadEnabled: driveReadEnabled(source), cap: env.GOOGLE_GMAIL_READ_CAP, sensitiveVerified: env.GOOGLE_SENSITIVE_SCOPES_VERIFIED, realGoogle: Boolean(source.GOOGLE_CLIENT_ID?.trim()) && !mocked };
}

/** Scopes whose grant Google counts right now (what we record). */
export function countedScopes(cfg: Pick<GoogleCapConfig, "sensitiveVerified">): string[] {
  return cfg.sensitiveVerified ? [...RESTRICTED_SCOPES] : [...CAP_LEDGER_SCOPES];
}

/**
 * HMAC-SHA256 hex (the "ledger" sub-key of TOKEN_ENC_KEY) of the lowercased account email — the ledger never stores
 * the address, and without the key nobody can test an address against it (security round B; it was a bare sha256).
 */
export function googleAccountHash(email: string, key: Buffer = derivedKey("ledger")): string {
  return hmac(key, `google-account:${email.trim().toLowerCase()}`).toString("hex");
}

/** The pre-round-B formula (and the 0008 SQL backfill): rows written with it are still recognised, and re-keyed on the next consent. */
export function legacyGoogleAccountHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

/** Did Google already count this account (under the current or the legacy hash)? */
async function accountCounted(db: Db, email: string): Promise<boolean> {
  const scopes = [...CAP_LEDGER_SCOPES];
  return (await db.hasGoogleScopeGrant(googleAccountHash(email), scopes)) || (await db.hasGoogleScopeGrant(legacyGoogleAccountHash(email), scopes));
}

export async function countCapUsers(db: Db): Promise<number> {
  return db.countGoogleScopeAccounts([...CAP_LEDGER_SCOPES]);
}

export type GmailReadAccess =
  | { allowed: true; reason: "already_counted" | "under_cap"; count: number | null; cap: number }
  | { allowed: false; reason: "disabled" | "cap_reached"; count: number | null; cap: number };
/** The same decision for any restricted read (Gmail or Drive). */
export type RestrictedReadAccess = GmailReadAccess;

/** Is this restricted read switched on (GOOGLE_GMAIL_READ_ENABLED / GOOGLE_DRIVE_READ_ENABLED)? */
export function restrictedReadEnabled(cfg: Pick<GoogleCapConfig, "gmailReadEnabled" | "driveReadEnabled">, read: RestrictedRead): boolean {
  return read === "gmail_read" ? cfg.gmailReadEnabled : Boolean(cfg.driveReadEnabled);
}

/**
 * May we request this restricted read (gmail.readonly / drive.readonly) for this Google account? `accountEmail` = the
 * account of the user's existing Google connection (any status), or null on a first connect. An account Google already
 * counted never costs a new slot.
 */
export async function restrictedReadAccess(db: Db, accountEmail: string | null, read: RestrictedRead, cfg: GoogleCapConfig = googleCapConfig()): Promise<RestrictedReadAccess> {
  if (!restrictedReadEnabled(cfg, read)) return { allowed: false, reason: "disabled", count: null, cap: cfg.cap };
  if (accountEmail && (await accountCounted(db, accountEmail))) return { allowed: true, reason: "already_counted", count: null, cap: cfg.cap };
  const count = await countCapUsers(db);
  return count < cfg.cap ? { allowed: true, reason: "under_cap", count, cap: cfg.cap } : { allowed: false, reason: "cap_reached", count, cap: cfg.cap };
}

/** May we request gmail.readonly for this Google account? (restrictedReadAccess for Gmail) */
export function gmailReadAccess(db: Db, accountEmail: string | null, cfg?: GoogleCapConfig): Promise<GmailReadAccess> {
  return restrictedReadAccess(db, accountEmail, "gmail_read", cfg);
}

/** May we request drive.readonly for this Google account? (restrictedReadAccess for Drive) */
export function driveReadAccess(db: Db, accountEmail: string | null, cfg?: GoogleCapConfig): Promise<RestrictedReadAccess> {
  return restrictedReadAccess(db, accountEmail, "drive_read", cfg);
}

/**
 * The Google account of the user's latest non-revoked (else any) Google connection — the one a reconnect reuses.
 * The start route decides the cap for this account AND sends it as login_hint, so the two always match.
 */
export function googleAccountOf(connections: ConnectionRow[]): string | null {
  const google = connections.filter((c) => c.provider === "google" && c.account_email);
  return (google.find((c) => c.status !== "revoked") ?? google[0])?.account_email ?? null;
}

export type GmailReadKeep =
  | { keep: true; reason: "already_counted" | "requested" }
  | { keep: false; reason: "not_granted" | "disabled" | "not_requested" | "cap_reached" | "error" };
/** The same verdict for any restricted read. */
export type RestrictedReadKeep = GmailReadKeep;

/**
 * The callback side of the cap: may the connection keep the gmail.readonly Google just returned? The start route
 * asks only within the cap, but the consent URL passes through the browser (its `scope=` can be edited), Google may
 * hand back an earlier grant (include_granted_scopes), and the user may pick another account than the login_hint.
 * So the grant is kept only while the feature is on, and when either
 *   - Google already counted this account before this consent (no new slot), or
 *   - the start route asked for it — and, when it asked only because ANOTHER account was already counted
 *     (`startReason` "already_counted"), only while the count is still under the cap.
 * A grant that is not kept is removed from the stored scopes (the gmail_* tools and the morning summary go by them).
 * Call BEFORE recordGoogleGrants (which makes this account "counted"). Never throws: an error drops the grant.
 */
export async function keepGrantedGmailRead(
  db: Db,
  input: { accountEmail: string; granted: readonly string[]; requested: readonly string[]; startReason?: unknown },
  cfg?: GoogleCapConfig,
): Promise<GmailReadKeep> {
  return keepGrantedRestrictedRead(db, input, "gmail_read", cfg);
}

/** keepGrantedGmailRead for any restricted read: the same rules for drive.readonly (its own switch, the same cap). */
export async function keepGrantedRestrictedRead(
  db: Db,
  input: { accountEmail: string; granted: readonly string[]; requested: readonly string[]; startReason?: unknown },
  read: RestrictedRead,
  cfg?: GoogleCapConfig,
): Promise<RestrictedReadKeep> {
  const scope = RESTRICTED_READ_SCOPE[read];
  if (!hasScope(input.granted, scope)) return { keep: false, reason: "not_granted" };
  try {
    const c = cfg ?? googleCapConfig();
    if (!restrictedReadEnabled(c, read)) return { keep: false, reason: "disabled" };
    if (await accountCounted(db, input.accountEmail)) return { keep: true, reason: "already_counted" };
    if (!hasScope(input.requested, scope)) return { keep: false, reason: "not_requested" };
    if (input.startReason === "already_counted" && (await countCapUsers(db)) >= c.cap) return { keep: false, reason: "cap_reached" };
    return { keep: true, reason: "requested" };
  } catch (e) {
    console.error(`[google:user-cap] ${scope} keep check failed — not kept:`, (e as Error).message);
    return { keep: false, reason: "error" };
  }
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
  // an account recorded under the legacy sha256 moves to the keyed hash (one account, counted once)
  await db.rekeyGoogleScopeGrants(legacyGoogleAccountHash(input.accountEmail), hash);
  const recorded: string[] = [];
  for (const scope of scopes) if (await db.recordGoogleScopeGrant({ account_hash: hash, scope, user_id: input.userId })) recorded.push(scope);
  const count = await countCapUsers(db);
  return { recorded, count, alerts: await raiseCapAlerts(db, count, cfg, { ...deps, userId: input.userId }) };
}

/** Raises each alert level `count` reached that was never raised before (ops flag, log, audit, operator email). */
async function raiseCapAlerts(db: Db, count: number, cfg: GoogleCapConfig, deps: { notify?: CapNotifier; now?: Date; userId?: string | null }): Promise<number[]> {
  const alerts: number[] = [];
  for (const level of alertLevels(cfg.cap)) {
    if (count < level) continue;
    const fresh = await db.setOpsFlagOnce(`google_user_cap:${level}`, { count, cap: cfg.cap, sensitive_verified: cfg.sensitiveVerified, at: (deps.now ?? new Date()).toISOString() });
    if (!fresh) continue;
    alerts.push(level);
    const alert: CapAlert = { level, count, cap: cfg.cap, sensitiveVerified: cfg.sensitiveVerified };
    console.warn(`[google:user-cap] ${count}/${cfg.cap} Google accounts counted toward the unverified-app cap (alert level ${level}).`);
    await db.addAudit({ user_id: deps.userId ?? null, action: "ops.google_user_cap", target: `level:${level}`, result: `count:${count}/${cfg.cap}` }).catch(() => undefined);
    await (deps.notify ?? emailOperator)(alert).catch((e) => console.error("[google:user-cap] operator email failed:", (e as Error).message));
  }
  return alerts;
}

/**
 * The alert check without a new grant — so a count that crossed 80 / the cap some other way (the 0008 backfill,
 * rows added by hand) alerts right away instead of at the next successful Google connect. Run by the job worker
 * (app/api/jobs/run) at most once an hour per instance; idempotent (each level once ever).
 */
export async function checkGoogleUserCapAlerts(db: Db, deps: { cfg?: GoogleCapConfig; notify?: CapNotifier; now?: Date } = {}): Promise<{ count: number; alerts: number[] }> {
  const cfg = deps.cfg ?? googleCapConfig();
  const count = await countCapUsers(db);
  return { count, alerts: await raiseCapAlerts(db, count, cfg, deps) };
}

const CAP_CHECK_EVERY_MS = 60 * 60_000;
let lastCapCheck = 0;

/** checkGoogleUserCapAlerts at most once per CAP_CHECK_EVERY_MS in this process; never throws. */
export async function maybeCheckGoogleUserCapAlerts(db: Db, now: Date = new Date()): Promise<void> {
  if (lastCapCheck && now.getTime() - lastCapCheck < CAP_CHECK_EVERY_MS) return;
  lastCapCheck = now.getTime();
  try {
    await checkGoogleUserCapAlerts(db, { now });
  } catch (e) {
    console.error("[google:user-cap] periodic alert check failed:", (e as Error).message);
  }
}

/** Tests: forget the last periodic check. */
export function resetGoogleUserCapCheckForTests(): void {
  lastCapCheck = 0;
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
      ? "הגענו לתקרה: משתמשים חדשים כבר לא מתבקשים לאשר קריאת Gmail וקריאת כל ה-Drive. היומן, Google Tasks, קבצי Drive שנוצרו דרכנו ושליחת מיילים מ-Gmail ממשיכים לעבוד, וסיכום הבוקר שלהם בלי \"מיילים שמחכים לתשובה\"."
      : `עוד ${a.cap - a.count} חשבונות עד שנפסיק לבקש קריאת Gmail וקריאת Drive ממשתמשים חדשים.`,
    a.sensitiveVerified
      ? ""
      : "חשוב: calendar.events ו-gmail.send (וגם tasks) עדיין לא אושרו ב-Verification Center, ולכן כל חיבור Google חדש נספר בתקרה — גם בלי קריאת Gmail. ב-100 Google תחסום חיבורים חדשים לגמרי. להגיש עכשיו אימות ל-scopes הרגישים (docs/google-setup.md §5) ואז GOOGLE_SENSITIVE_SCOPES_VERIFIED=true.",
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

/** Will Google show "Google hasn't verified this app" before its consent screen? (`requestsRestricted`: gmail.readonly / drive.readonly) */
export function unverifiedScreenExpected(cfg: Pick<GoogleCapConfig, "realGoogle" | "sensitiveVerified">, requestsRestricted: boolean): boolean {
  return cfg.realGoogle && (requestsRestricted || !cfg.sensitiveVerified);
}

/** "\n<heads-up line>" to append to a chat message carrying a connect link for `provider`, or "". Never throws. */
export async function connectHeadsUpSuffix(db: Db, connections: ConnectionRow[], provider: ConnectionProvider): Promise<string> {
  return provider === "google" && (await googleConnectShowsUnverified(db, connections)) ? `\n${gcopy["g.unverified_heads_up"]()}` : "";
}

/**
 * For a chat message carrying a Google connect link: will the consent behind it show the unverified-app screen?
 * Mirrors the start route (gmail.readonly / drive.readonly are added while the account may still get them). Never throws.
 */
export async function googleConnectShowsUnverified(db: Db, connections: ConnectionRow[], cfg?: GoogleCapConfig): Promise<boolean> {
  try {
    const c = cfg ?? googleCapConfig();
    if (!c.realGoogle) return false;
    if (!c.sensitiveVerified) return true;
    const account = googleAccountOf(connections);
    return (await gmailReadAccess(db, account, c)).allowed || (await driveReadAccess(db, account, c)).allowed;
  } catch (e) {
    console.error("[google:user-cap] heads-up check failed:", (e as Error).message);
    return false;
  }
}
