/**
 * Data access layer — one interface, two implementations:
 *   - `SupabaseDb` (lib/db/supabase.ts): service-role client, server only (PLAN §2.3).
 *   - `MemoryDb`   (lib/db/memory.ts):   in-memory, for tests and `DATA_MODE=memory` dev runs.
 *
 * Only the server ever talks to this layer. Row shapes mirror supabase/migrations/0001_init.sql.
 */

export type ConnectionProvider = "microsoft" | "google";
export type ConnectionStatus = "active" | "expired" | "revoked" | "error";
export type PlanKind = "trial" | "basic" | "pro";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";
export type WaIdentityStatus = "active" | "blocked" | "unlinked";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  business_type: string | null;
  timezone: string;
  morning_time: string;
  locale: string;
  created_at: string;
  deleted_at: string | null;
}

export interface OtpRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  used_at: string | null;
  created_at: string;
}

export interface LinkTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface WaIdentityRow {
  id: string;
  user_id: string;
  phone_e164: string;
  wa_name: string | null;
  linked_at: string;
  status: WaIdentityStatus;
}

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: ConnectionProvider;
  account_email: string | null;
  tenant_id: string | null;
  scopes: string[];
  status: ConnectionStatus;
  consent_type: "user" | "admin";
  created_at: string;
  revoked_at: string | null;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: PlanKind;
  status: SubscriptionStatus;
  next_charge_at: string | null;
  cancelled_at: string | null;
  started_at: string | null;
}

export interface UsageRow {
  user_id: string;
  period_start: string;
  counted_messages: number;
  free_remaining: number;
  plan_limit: number;
}

export interface AuditEntry {
  user_id: string | null;
  action: string;
  target?: string | null;
  reason?: string | null;
  result?: string | null;
}

export interface Db {
  // users
  findUserByEmail(email: string): Promise<UserRow | null>;
  getUser(id: string): Promise<UserRow | null>;
  createUser(email: string): Promise<UserRow>;
  updateUserProfile(
    id: string,
    patch: Partial<Pick<UserRow, "name" | "business_name" | "business_type" | "morning_time" | "timezone">>,
  ): Promise<UserRow>;
  /** Hard delete — cascades to every dependent table (PLAN §12.7). */
  deleteUser(id: string): Promise<void>;

  // auth_otps
  createOtp(email: string, codeHash: string, expiresAt: Date): Promise<OtpRow>;
  /** Latest unused OTP for the email (expired or not — the caller decides). */
  latestOtp(email: string): Promise<OtpRow | null>;
  countOtpsSince(email: string, since: Date): Promise<number>;
  incrementOtpAttempts(id: string): Promise<number>;
  markOtpUsed(id: string): Promise<void>;

  // link_tokens
  createLinkToken(userId: string, token: string, expiresAt: Date): Promise<LinkTokenRow>;
  findLinkToken(token: string): Promise<LinkTokenRow | null>;
  latestLinkToken(userId: string): Promise<LinkTokenRow | null>;
  markLinkTokenUsed(id: string): Promise<void>;

  // wa_identities
  listWaIdentities(userId: string): Promise<WaIdentityRow[]>;
  unlinkWaIdentity(userId: string, id: string): Promise<boolean>;

  // connections
  listConnections(userId: string): Promise<ConnectionRow[]>;
  revokeConnection(userId: string, id: string): Promise<ConnectionRow | null>;

  // subscriptions / usage
  getSubscription(userId: string): Promise<SubscriptionRow | null>;
  cancelSubscription(userId: string): Promise<SubscriptionRow | null>;
  getCurrentUsage(userId: string): Promise<UsageRow | null>;

  // audit
  addAudit(entry: AuditEntry): Promise<void>;
}
