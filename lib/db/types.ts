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
  /** free-form JSON the bot maintains (PLAN §2.2 profile, onboarding state, preferences) */
  profile: Record<string, unknown>;
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
  /** access-token expiry */
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Encrypted tokens — read only by the token store, never listed with the row. */
export interface ConnectionSecret {
  enc_access: string | null;
  enc_refresh: string | null;
  expires_at: string | null;
}

export interface NewConnection {
  user_id: string;
  provider: ConnectionProvider;
  account_email: string | null;
  tenant_id: string | null;
  scopes: string[];
  consent_type: "user" | "admin";
  enc_access: string;
  enc_refresh: string | null;
  expires_at: string;
}

export interface GraphSubscriptionRow {
  id: string;
  connection_id: string;
  subscription_id: string;
  resource: string;
  expires_at: string;
  client_state: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: PlanKind;
  status: SubscriptionStatus;
  next_charge_at: string | null;
  cancelled_at: string | null;
  started_at: string | null;
  charge_failures: number;
  /** card expiry YYMM from HYP getToken */
  hyp_tokef: string | null;
}

/** Only the billing module reads the encrypted token (separate call, never listed with the row). */
export interface SubscriptionSecret {
  hyp_token_enc: string | null;
  hyp_tokef: string | null;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  hyp_trans_id: string;
  amount_ils: number;
  ccode: string;
  acode: string | null;
  invoice_url: string | null;
  raw: Record<string, unknown>;
  created_at: string;
}

export type JobKind = "morning_summary" | "reminder" | "renew_subscription" | "charge" | "retry";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  user_id: string | null;
  kind: JobKind;
  run_at: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
}

/** Recurring reminder rule (reminders.recurrence, migration 0005). Times are wall-clock in the user's time zone. */
export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  /** weekly: 0 = Sunday … 6 = Saturday */
  weekdays?: number[];
  /** monthly: 1–31 (clamped to the month's last day) */
  monthDay?: number;
}

/** scheduled → fired: sent (one-off) / done (user pressed "טופל"); recurring reminders stay scheduled with the next due_at. */
export type ReminderStatus = "scheduled" | "sent" | "done" | "cancelled";

export interface ReminderRow {
  id: string;
  user_id: string;
  text: string;
  due_at: string;
  job_id: string | null;
  status: ReminderStatus;
  recurrence: RecurrenceRule | null;
  last_fired_at: string | null;
  created_at: string;
}

export interface NewReminder {
  user_id: string;
  text: string;
  due_at: Date;
  recurrence?: RecurrenceRule | null;
}

export interface UsageRow {
  user_id: string;
  period_start: string;
  counted_messages: number;
  free_remaining: number;
  plan_limit: number;
}

export type MessageDirection = "in" | "out";
export type MessageType = "text" | "audio" | "image" | "doc" | "button" | "template" | "other";

export interface MessageRow {
  id: string;
  user_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  text: string | null;
  media_url: string | null;
  transcript: string | null;
  model_used: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  /** which agent answered (migration 0006); null = the main assistant */
  agent_key: string | null;
  created_at: string;
}

export interface NewMessage {
  user_id: string;
  wa_message_id?: string | null;
  direction: MessageDirection;
  type?: MessageType;
  text?: string | null;
  media_url?: string | null;
  transcript?: string | null;
  model_used?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  agent_key?: AgentKey | null;
}

export interface ConversationStateRow {
  user_id: string;
  summary: string | null;
  last_summarized_msg_id: string | null;
  facts: string[];
  updated_at: string;
}

export type PendingActionKind = "send_mail" | "create_event" | "update_event" | "delete_event" | "share_file" | "forward_mail";
export type PendingActionStatus = "pending" | "approved" | "edited" | "cancelled" | "executed" | "expired" | "failed";

export interface PendingActionRow {
  id: string;
  user_id: string;
  kind: PendingActionKind;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  expires_at: string;
  approved_msg_id: string | null;
  executed_at: string | null;
  error: string | null;
  /** the agent that prepared the draft (migration 0006); null = the main assistant */
  agent_key: string | null;
  /** the agent's name when the draft was made (the WhatsApp header) */
  agent_name: string | null;
  created_at: string;
}

/** Who prepared a pending action — stored on the row, used for the header, the daily cap and the audit. */
export interface PendingActionMeta {
  agentKey: AgentKey;
  agentName: string;
}

export interface LinkAttemptResult {
  attempts: number;
  blocked: boolean;
}

export interface AuditEntry {
  user_id: string | null;
  action: string;
  target?: string | null;
  reason?: string | null;
  result?: string | null;
  approved_by_msg_id?: string | null;
  pending_action_id?: string | null;
  /** migration 0006: which agent acted (from the pending action, or the managed agent for agent.* entries) */
  agent_key?: string | null;
  agent_name?: string | null;
}

// ---- agents (migration 0006, docs/design/agents.md §2) ----

export type BuiltinRole = "secretary" | "intern" | "bookkeeper";
export type AgentRole = BuiltinRole | "custom";
/** Stable attribution key: `builtin:secretary` or `custom:<agents.id>`. */
export type AgentKey = `builtin:${BuiltinRole}` | `custom:${string}`;

/** Narrowing only — approval by button is structural and is never a permission (I1). */
export interface AgentPermissions {
  /** up to 5 addresses; empty / absent = no restriction (still with approval) */
  recipients?: string[];
  /** 1–30; absent = the default (10) */
  max_outbound_per_day?: number;
}

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  role: AgentRole;
  /** custom agents only: the built-in template it started from */
  template: BuiltinRole | null;
  /** custom: the user's instructions; built-in override: additional instructions */
  instructions: string | null;
  /** capability ids (lib/agents/capabilities.ts), not tool names */
  tools: string[];
  permissions: AgentPermissions;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewAgent {
  user_id: string;
  name: string;
  role: AgentRole;
  template?: BuiltinRole | null;
  instructions?: string | null;
  tools?: string[];
  permissions?: AgentPermissions;
  enabled?: boolean;
}

/** The only fields that change after insert (user_id / role / template are immutable — SQL enforce_agent_rules). */
export type AgentPatch = Partial<Pick<AgentRow, "name" | "instructions" | "tools" | "permissions" | "enabled">>;

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

  /** user whose profile.oauth_pending.<provider>.state equals `state` (OAuth callback lookup) */
  findUserByOauthState(provider: "microsoft" | "google", state: string): Promise<UserRow | null>;
  /** Deep-merges into users.profile (top-level keys replaced). */
  mergeUserProfile(id: string, patch: Record<string, unknown>): Promise<UserRow>;

  // wa_identities
  listWaIdentities(userId: string): Promise<WaIdentityRow[]>;
  unlinkWaIdentity(userId: string, id: string): Promise<boolean>;
  findWaIdentityByPhone(phoneE164: string): Promise<WaIdentityRow | null>;
  createWaIdentity(userId: string, phoneE164: string, waName: string | null): Promise<WaIdentityRow>;

  // wa_link_attempts (unlinked numbers trying tokens; blocked after 3 — PLAN §2.3)
  recordLinkAttempt(phoneE164: string, maxAttempts: number, blockMs: number): Promise<LinkAttemptResult>;
  isPhoneBlocked(phoneE164: string): Promise<boolean>;

  // messages
  /** Inserts; returns null when wa_message_id already exists (webhook redelivery). */
  insertMessage(row: NewMessage): Promise<MessageRow | null>;
  recentMessages(userId: string, limit: number): Promise<MessageRow[]>;
  countMessagesSince(userId: string, since: Date): Promise<number>;
  /** voice notes: stores the STT transcript on the inbound audio message */
  setMessageTranscript(id: string, transcript: string): Promise<void>;

  // conversation_state
  getConversationState(userId: string): Promise<ConversationStateRow | null>;
  upsertConversationState(userId: string, patch: Partial<Pick<ConversationStateRow, "summary" | "last_summarized_msg_id" | "facts">>): Promise<ConversationStateRow>;

  // pending_actions
  createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date, meta?: PendingActionMeta): Promise<PendingActionRow>;
  getPendingAction(id: string): Promise<PendingActionRow | null>;
  updatePendingAction(id: string, patch: Partial<Pick<PendingActionRow, "status" | "payload" | "approved_msg_id" | "executed_at" | "error">>): Promise<PendingActionRow | null>;
  listPendingActions(userId: string, status: PendingActionStatus): Promise<PendingActionRow[]>;

  // usage — atomic counter (SQL: count_trial_message). Returns messages left after counting, or -1 when exhausted.
  countTrialMessage(userId: string): Promise<number>;

  // connections
  listConnections(userId: string): Promise<ConnectionRow[]>;
  revokeConnection(userId: string, id: string): Promise<ConnectionRow | null>;
  getConnection(id: string): Promise<ConnectionRow | null>;
  /** one active connection per (user, provider, account) — re-connecting replaces the tokens */
  upsertConnection(row: NewConnection): Promise<ConnectionRow>;
  getConnectionSecret(id: string): Promise<ConnectionSecret | null>;
  updateConnectionTokens(id: string, patch: { enc_access: string; enc_refresh?: string | null; expires_at: string }): Promise<void>;
  setConnectionStatus(id: string, status: ConnectionStatus): Promise<void>;

  // graph_subscriptions
  upsertGraphSubscription(row: Omit<GraphSubscriptionRow, "id">): Promise<GraphSubscriptionRow>;
  findGraphSubscription(subscriptionId: string): Promise<GraphSubscriptionRow | null>;
  listGraphSubscriptionsForConnection(connectionId: string): Promise<GraphSubscriptionRow[]>;
  listGraphSubscriptionsExpiring(before: Date, limit: number): Promise<GraphSubscriptionRow[]>;
  deleteGraphSubscription(subscriptionId: string): Promise<void>;

  // subscriptions / usage
  getSubscription(userId: string): Promise<SubscriptionRow | null>;
  cancelSubscription(userId: string): Promise<SubscriptionRow | null>;
  getCurrentUsage(userId: string): Promise<UsageRow | null>;
  upsertSubscription(userId: string, patch: Partial<Omit<SubscriptionRow, "id" | "user_id">> & { hyp_token_enc?: string | null }): Promise<SubscriptionRow>;
  getSubscriptionSecret(userId: string): Promise<SubscriptionSecret | null>;
  /** subscriptions whose next_charge_at <= now and that still have a token (active / past_due) */
  listSubscriptionsDue(now: Date, limit: number): Promise<SubscriptionRow[]>;

  // payments
  /** null when hyp_trans_id already recorded (idempotent redirect / retry) */
  insertPayment(row: Omit<PaymentRow, "id" | "created_at">): Promise<PaymentRow | null>;
  listPayments(userId: string, limit: number): Promise<PaymentRow[]>;

  // jobs (pg_cron claims and dispatches; the worker finishes)
  createJob(job: { kind: JobKind; user_id: string | null; run_at: Date; payload?: Record<string, unknown>; dedupe_key?: string | null; max_attempts?: number }): Promise<JobRow | null>;
  finishJob(id: string, error?: string | null, retryAt?: Date | null): Promise<JobRow | null>;
  cancelJobs(userId: string, kind: JobKind): Promise<number>;
  /** one queued job → cancelled (e.g. the old job of a snoozed reminder) */
  cancelJob(id: string): Promise<void>;
  /** SQL claim_due_jobs(): queued + run_at <= now → running, attempts + 1. Used by the dev tick route (pg_cron uses dispatch_due_jobs). */
  claimDueJobs(limit: number): Promise<JobRow[]>;

  // reminders (Milestone 5)
  createReminder(row: NewReminder): Promise<ReminderRow>;
  getReminder(id: string): Promise<ReminderRow | null>;
  updateReminder(id: string, patch: Partial<Pick<ReminderRow, "text" | "status" | "due_at" | "job_id" | "recurrence" | "last_fired_at">>): Promise<ReminderRow | null>;
  /** ordered by due_at; `dueFrom` (inclusive) / `dueBefore` (exclusive) bound due_at */
  listReminders(userId: string, opts: { statuses: ReminderStatus[]; dueFrom?: Date; dueBefore?: Date; limit?: number }): Promise<ReminderRow[]>;

  // agents (migration 0006). Every method filters by the owner, also when an id is given.
  // Writes throw AgentLimitError / AgentPlanError / AgentNameTakenError / AgentRuleError (lib/db/errors.ts).
  /** ordered by created_at (oldest first — the quota keeps the oldest agents active after a downgrade) */
  listAgents(userId: string): Promise<AgentRow[]>;
  getAgent(userId: string, id: string): Promise<AgentRow | null>;
  createAgent(row: NewAgent): Promise<AgentRow>;
  updateAgent(userId: string, id: string, patch: AgentPatch): Promise<AgentRow | null>;
  deleteAgent(userId: string, id: string): Promise<boolean>;
  /** drafts the agent prepared since `since` that still count toward its daily cap (not cancelled / expired / failed) */
  countAgentActionsSince(userId: string, agentKey: AgentKey, since: Date): Promise<number>;

  // audit
  addAudit(entry: AuditEntry): Promise<void>;
}
